import express from 'express'
import { db, ObjectId } from './mongodb.js'

export function createServer() {
  const app = express()

  app.get('/status', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'github-sync' })
  })

  app.get('/healthz', (_req, res) => {
    res.sendStatus(204)
  })

  return { app, server: app }
}