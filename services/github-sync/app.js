// Metrics must be initialized before importing anything else
import '@overleaf/metrics/initialize.js'

import logger from '@overleaf/logger'
import Settings from '@overleaf/settings'
import { createServer } from './app/js/server.js'

const port = Settings.internal?.githubSync?.port
const host = Settings.internal?.githubSync?.host

const { server } = createServer()
server.listen(port, host, err => {
  if (err) {
    logger.fatal({ err }, `Cannot bind to ${host}:${port}. Exiting.`)
    process.exit(1)
  }

  logger.info({ host, port }, 'GitHub Sync service listening')
})