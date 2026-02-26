import express from 'express'
import GitHubSyncController from './GitHubSyncController.js'
import { projectConcurrencyMiddleware, releaseProjectLimiter } from './GitHubSyncMiddleware.js'

export function createServer() {
  const app = express()
  app.use(express.json())
  
  app.get('/status', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'github-sync' })
  })

  app.get('/healthz', (_req, res) => {
    res.sendStatus(204)
  })

  app.post('/project/:Project_id/user/:user_id/export',
    projectConcurrencyMiddleware,
    GitHubSyncController.exportProjectToGithub,
    releaseProjectLimiter
  )


  app.get('/project/:Project_id/user/:user_id/dev',
    projectConcurrencyMiddleware,
    GitHubSyncController.dev,
    releaseProjectLimiter
  )

  return { app, server: app }
}