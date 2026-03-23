import Settings from '@overleaf/settings'
import SessionManager from '../Authentication/SessionManager.mjs'
import SystemMessageManager from '../SystemMessages/SystemMessageManager.mjs'
import { getSiteStatusHealthSnapshot } from '../HealthCheck/HealthCheckManager.mjs'
import {
  getOverallThemeFromRequestCookie,
  normalizeOverallTheme,
} from '../../infrastructure/OverallTheme.mjs'

const SMOKE_STEPS = {
  login: 'run.002_login',
  website: 'run.100_loadProjectDashboard',
  editor: 'run.101_loadEditor',
}

const SMOKE_FAILURE_STEPS = {
  login: new Set(['run.000_getLoginCsrf', 'run.002_login']),
  website: new Set(['run.100_loadProjectDashboard']),
  editor: new Set(['run.101_loadEditor']),
}

function getThemeRenderOptions(req) {
  const sessionUser = SessionManager.getSessionUser(req.session)
  if (!sessionUser) {
    return {
      overallThemeOverride: getOverallThemeFromRequestCookie(req),
    }
  }

  return {
    overallThemeOverride: normalizeOverallTheme(sessionUser.ace?.overallTheme),
    ignoreOverallThemeCookie: true,
  }
}

function getSmokeServiceState(serviceKey, healthSnapshot) {
  const smoke = healthSnapshot?.smoke

  if (!smoke?.configured) {
    return 'unknown'
  }

  if (smoke.completedRunSteps.has(SMOKE_STEPS[serviceKey])) {
    return 'operational'
  }

  if (SMOKE_FAILURE_STEPS[serviceKey].has(smoke.failedRunStep)) {
    return 'unavailable'
  }

  return 'unknown'
}

function getServiceStatus(serviceKey, name, description, healthSnapshot) {
  if (Settings.shuttingDown) {
    return {
      name,
      description,
      state: 'shutting-down',
      tone: 'maintenance',
      label: 'Shutting down',
    }
  }

  if (!Settings.siteIsOpen) {
    return {
      name,
      description,
      state: 'maintenance',
      tone: 'maintenance',
      label: 'Maintenance',
    }
  }

  if (serviceKey === 'editor' && !Settings.editorIsOpen) {
    return {
      name,
      description,
      state: 'maintenance',
      tone: 'maintenance',
      label: 'Maintenance',
    }
  }

  switch (getSmokeServiceState(serviceKey, healthSnapshot)) {
    case 'operational':
      return {
        name,
        description,
        state: 'operational',
        tone: 'operational',
        label: 'Operational',
      }
    case 'unavailable':
      return {
        name,
        description,
        state: 'unavailable',
        tone: 'degraded',
        label: 'Unavailable',
      }
    default:
      return {
        name,
        description,
        state: 'unknown',
        tone: 'degraded',
        label: 'Unavailable',
      }
  }
}

function buildServices(healthSnapshot) {
  return [
    getServiceStatus(
      'website',
      'Website',
      'Dashboard, project list, and general account pages.',
      healthSnapshot
    ),
    getServiceStatus(
      'editor',
      'Editor',
      'Project editing, compile workflow, and collaboration tools.',
      healthSnapshot
    ),
    getServiceStatus(
      'login',
      'Login',
      'Login, session validation, and account access flow.',
      healthSnapshot
    ),
  ]
}

function getUnavailableSummary(serviceName) {
  switch (serviceName) {
    case 'Website':
      return 'The latest health check could not load the project dashboard.'
    case 'Editor':
      return 'The latest health check could not load the editor.'
    case 'Login':
      return 'The latest health check could not complete the login flow.'
    default:
      return 'The latest health check could not verify service availability.'
  }
}

function getOverallStatus(services, healthSnapshot) {
  if (Settings.shuttingDown) {
    return {
      label: 'Shutting down',
      tone: 'maintenance',
      summary:
        'The service is shutting down and may become temporarily unavailable.',
      noticeTitle: 'Service shutdown in progress',
    }
  }

  if (!Settings.siteIsOpen) {
    return {
      label: 'Maintenance in progress',
      tone: 'maintenance',
      summary:
        'Core web functionality is temporarily unavailable while maintenance is in progress.',
      noticeTitle: 'Scheduled maintenance is active',
    }
  }

  if (!Settings.editorIsOpen) {
    return {
      label: 'Editor maintenance',
      tone: 'maintenance',
      summary:
        'The website is reachable, but the editor is temporarily unavailable for maintenance.',
      noticeTitle: 'Editor maintenance is active',
    }
  }

  const unavailableServices = services.filter(
    service => service.state === 'unavailable'
  )
  const unknownServices = services.filter(service => service.state === 'unknown')

  if (unavailableServices.length === 0 && unknownServices.length === 0) {
    return {
      label: 'All systems operational',
      tone: 'operational',
      summary: 'The website, editor, and login flow are operating normally.',
      noticeTitle: null,
    }
  }

  if (unavailableServices.length === 1) {
    const [service] = unavailableServices
    return {
      label: `${service.name} unavailable`,
      tone: 'degraded',
      summary: getUnavailableSummary(service.name),
      noticeTitle: `${service.name} health check failed`,
    }
  }

  if (unavailableServices.length > 1) {
    return {
      label: 'Multiple services degraded',
      tone: 'degraded',
      summary:
        'The latest health checks detected issues affecting multiple services.',
      noticeTitle: 'Multiple health checks failed',
    }
  }

  return {
    label: 'Health checks unavailable',
    tone: 'degraded',
    summary:
      healthSnapshot?.smoke?.configured === false
        ? 'Real health checks are not fully configured. Configure smoke test credentials to monitor login, website, and editor availability.'
        : 'The latest health checks could not verify all user-facing services.',
    noticeTitle: 'Health checks are unavailable',
  }
}

function getSmokeFailureNoticeContent(failedRunStep) {
  switch (failedRunStep) {
    case 'run.000_getLoginCsrf':
    case 'run.002_login':
      return 'The latest smoke test failed while checking the login flow.'
    case 'run.100_loadProjectDashboard':
      return 'The latest smoke test failed while checking the project dashboard.'
    case 'run.101_loadEditor':
      return 'The latest smoke test failed while checking the editor.'
    default:
      return 'The latest smoke test did not complete successfully.'
  }
}

function getAnnouncementMetaLabel(tone, overallStatusLabel) {
  switch (tone) {
    case 'maintenance':
      return 'Maintenance'
    case 'degraded':
      return 'Degraded'
    case 'operational':
      return overallStatusLabel || 'Operational'
    case 'info':
    default:
      return 'Notice'
  }
}

function buildHealthAnnouncements(healthSnapshot) {
  if (!healthSnapshot || healthSnapshot.skipped) {
    return []
  }

  const announcements = []

  if (healthSnapshot.smoke?.configured === false) {
    announcements.push({
      title: 'Real health checks are not configured',
      tone: 'info',
      metaLabel: getAnnouncementMetaLabel('info'),
      isHtml: false,
      content:
        'Configure SMOKE_TEST_USER, SMOKE_TEST_USER_ID, SMOKE_TEST_PASSWORD, and SMOKE_TEST_PROJECT_ID to enable login, website, and editor smoke tests.',
    })
  } else if (!healthSnapshot.smoke?.ok) {
    announcements.push({
      title: 'Latest smoke test failed',
      tone: 'degraded',
      metaLabel: getAnnouncementMetaLabel('degraded'),
      isHtml: false,
      content: getSmokeFailureNoticeContent(healthSnapshot.smoke?.failedRunStep),
    })
  }

  if (healthSnapshot.api && !healthSnapshot.api.redis.ok) {
    announcements.push({
      title: 'Redis health check failed',
      tone: 'degraded',
      metaLabel: getAnnouncementMetaLabel('degraded'),
      isHtml: false,
      content: 'Redis did not respond to the latest health check.',
    })
  }

  if (
    healthSnapshot.api &&
    !healthSnapshot.api.mongo.ok &&
    healthSnapshot.api.mongo.configured !== false
  ) {
    announcements.push({
      title: 'Mongo health check failed',
      tone: 'degraded',
      metaLabel: getAnnouncementMetaLabel('degraded'),
      isHtml: false,
      content: 'Mongo did not respond to the latest health check.',
    })
  }

  return announcements
}

function buildAnnouncements(overallStatus, healthSnapshot) {
  const announcements = buildHealthAnnouncements(healthSnapshot)
  const maintenanceNoticeTone =
    overallStatus.tone === 'operational' ? 'info' : overallStatus.tone

  if (Settings.maintenanceMessageHTML) {
    announcements.push({
      title: overallStatus.noticeTitle || 'Maintenance notice',
      tone: maintenanceNoticeTone,
      metaLabel: getAnnouncementMetaLabel(
        maintenanceNoticeTone,
        overallStatus.label
      ),
      isHtml: true,
      content: Settings.maintenanceMessageHTML,
    })
  } else if (Settings.maintenanceMessage) {
    announcements.push({
      title: overallStatus.noticeTitle || 'Maintenance notice',
      tone: maintenanceNoticeTone,
      metaLabel: getAnnouncementMetaLabel(
        maintenanceNoticeTone,
        overallStatus.label
      ),
      isHtml: false,
      content: Settings.maintenanceMessage,
    })
  }

  for (const message of SystemMessageManager.getMessages() || []) {
    if (typeof message?.content !== 'string' || message.content.trim() === '') {
      continue
    }

    announcements.push({
      title: 'System message',
      tone: 'info',
      metaLabel: getAnnouncementMetaLabel('info'),
      isHtml: false,
      content: message.content,
    })
  }

  return announcements
}

export default {
  page(req, res, next) {
    return getSiteStatusHealthSnapshot()
      .then(healthSnapshot => {
        const services = buildServices(healthSnapshot)
        const overallStatus = getOverallStatus(services, healthSnapshot)
        const announcements = buildAnnouncements(overallStatus, healthSnapshot)

        res.render('general/site-status', {
          title: 'Website status',
          bodyClasses: ['site-status-page'],
          siteStatus: {
            overallStatus,
            announcements,
            services,
            adminEmail: Settings.adminEmail,
            statusPageUrl: Settings.statusPageUrl,
          },
          ...getThemeRenderOptions(req),
        })
      })
      .catch(next)
  },
}
