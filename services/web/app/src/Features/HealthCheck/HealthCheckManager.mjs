import RedisWrapper from '../../infrastructure/RedisWrapper.mjs'
import settings from '@overleaf/settings'
import logger from '@overleaf/logger'
import UserGetter from '../User/UserGetter.mjs'
import SmokeTests from './../../../../test/smoke/src/SmokeTests.mjs'

const { SmokeTestFailure, runSmokeTests } = SmokeTests

const rclient = RedisWrapper.client('health_check')

const SITE_STATUS_CACHE_TTL_MS = 30000

let cachedSiteStatusSnapshot
let cachedSiteStatusSnapshotExpiresAt = 0
let inFlightSiteStatusSnapshotPromise

function finalizeStats(stats) {
  stats.end = new Date()
  stats.duration = stats.end - stats.start
}

function getCompletedRunSteps(stats) {
  return new Set(
    (stats.steps || [])
      .flatMap(step => Object.keys(step))
      .filter(stepName => stepName.startsWith('run.'))
  )
}

function parseFailedRunStep(errorMessage) {
  if (typeof errorMessage !== 'string') {
    return null
  }

  const match = errorMessage.match(/^(run\.[^ ]+) failed$/)
  return match ? match[1] : null
}

function getMissingSmokeTestFields() {
  const smokeTest = settings.smokeTest || {}
  const missingFields = []

  if (!smokeTest.user) {
    missingFields.push('SMOKE_TEST_USER')
  }
  if (!smokeTest.userId) {
    missingFields.push('SMOKE_TEST_USER_ID')
  }
  if (!smokeTest.password) {
    missingFields.push('SMOKE_TEST_PASSWORD')
  }
  if (!smokeTest.projectId) {
    missingFields.push('SMOKE_TEST_PROJECT_ID')
  }

  return missingFields
}

function normalizeSmokeTestError(error) {
  if (!error) {
    return null
  }

  if (error instanceof SmokeTestFailure) {
    return error
  }

  return new SmokeTestFailure('low level error', {}, error)
}

export function isSmokeTestConfigured() {
  return getMissingSmokeTestFields().length === 0
}

export function runRedisHealthCheck() {
  return new Promise(resolve => {
    rclient.healthCheck(error => {
      if (error != null) {
        logger.err({ err: error }, 'failed redis health check')
        resolve({
          ok: false,
          statusCode: 500,
          error: 'Redis did not respond to the health check.',
        })
        return
      }

      resolve({
        ok: true,
        statusCode: 200,
        error: null,
      })
    })
  })
}

export function runMongoHealthCheck() {
  const smokeTestUserId = settings.smokeTest?.userId

  if (!smokeTestUserId) {
    return Promise.resolve({
      ok: false,
      configured: false,
      statusCode: 404,
      error: 'Mongo health checks are unavailable because the smoke test user is not configured.',
    })
  }

  return new Promise(resolve => {
    UserGetter.getUserEmail(smokeTestUserId, (err, email) => {
      if (err != null) {
        logger.err({ err }, 'mongo health check failed, error present')
        resolve({
          ok: false,
          configured: true,
          statusCode: 500,
          error: 'Mongo did not respond to the health check.',
        })
        return
      }

      if (email == null) {
        logger.err(
          { err },
          'mongo health check failed, no email present in find result'
        )
        resolve({
          ok: false,
          configured: true,
          statusCode: 500,
          error: 'Mongo health checks could not verify the smoke test user.',
        })
        return
      }

      resolve({
        ok: true,
        configured: true,
        statusCode: 200,
        error: null,
      })
    })
  })
}

export async function runApiHealthCheck() {
  const [redis, mongo] = await Promise.all([
    runRedisHealthCheck(),
    runMongoHealthCheck(),
  ])

  return {
    ok: redis.ok && mongo.ok,
    statusCode: redis.ok ? mongo.statusCode : redis.statusCode,
    redis,
    mongo,
  }
}

export async function runSmokeTestsHealthCheck({
  isAborted = () => false,
} = {}) {
  const stats = { start: new Date(), steps: [] }

  if (!isSmokeTestConfigured()) {
    finalizeStats(stats)

    return {
      ok: false,
      configured: false,
      error:
        'Smoke tests are not configured for this instance, so user-facing health checks are unavailable.',
      missingFields: getMissingSmokeTestFields(),
      failedRunStep: null,
      completedRunSteps: new Set(),
      stats,
    }
  }

  let smokeTestError = null

  try {
    await runSmokeTests({ isAborted, stats })
  } catch (error) {
    smokeTestError = normalizeSmokeTestError(error)
    logger.err({ err: smokeTestError, stats }, 'health check failed')
  } finally {
    finalizeStats(stats)
  }

  return {
    ok: smokeTestError == null,
    configured: true,
    error: smokeTestError?.message ?? null,
    missingFields: [],
    failedRunStep: parseFailedRunStep(smokeTestError?.message),
    completedRunSteps: getCompletedRunSteps(stats),
    stats,
  }
}

async function computeSiteStatusHealthSnapshot() {
  const checkedAt = new Date()

  if (settings.shuttingDown || !settings.siteIsOpen) {
    return {
      checkedAt,
      api: null,
      smoke: null,
      skipped: true,
    }
  }

  const [api, smoke] = await Promise.all([
    runApiHealthCheck(),
    runSmokeTestsHealthCheck(),
  ])

  return {
    checkedAt,
    api,
    smoke,
    skipped: false,
  }
}

export async function getSiteStatusHealthSnapshot() {
  if (
    cachedSiteStatusSnapshot &&
    Date.now() < cachedSiteStatusSnapshotExpiresAt
  ) {
    return cachedSiteStatusSnapshot
  }

  if (inFlightSiteStatusSnapshotPromise) {
    return inFlightSiteStatusSnapshotPromise
  }

  inFlightSiteStatusSnapshotPromise = computeSiteStatusHealthSnapshot()
    .then(snapshot => {
      cachedSiteStatusSnapshot = snapshot
      cachedSiteStatusSnapshotExpiresAt = Date.now() + SITE_STATUS_CACHE_TTL_MS
      return snapshot
    })
    .finally(() => {
      inFlightSiteStatusSnapshotPromise = null
    })

  return inFlightSiteStatusSnapshotPromise
}
