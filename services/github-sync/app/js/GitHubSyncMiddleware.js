import pLimit from 'p-limit'

const projectLimiters = new Map()

function getProjectLimiter(projectId) {
  if (!projectLimiters.has(projectId)) {
    projectLimiters.set(projectId, pLimit(1))
  }
  return projectLimiters.get(projectId)
}

export function projectConcurrencyMiddleware(req, res, next) {
  const projectId = req.params.Project_id
  if (!projectId) return res.status(400).json({ error: 'Missing Project_id' })
  const limiter = getProjectLimiter(projectId)
  limiter(() => new Promise(resolve => {
    req._releaseLimiter = resolve
    next()
  }))
}

export function releaseProjectLimiter(req, res, next) {
  if (req._releaseLimiter) {
    req._releaseLimiter()
  }
  next()
}