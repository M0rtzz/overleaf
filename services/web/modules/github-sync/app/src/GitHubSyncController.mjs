import { expressify } from '@overleaf/promise-utils'
import SessionManager from '../../../../app/src/Features/Authentication/SessionManager.mjs'
import Csrf from '../../../../app/src/infrastructure/Csrf.mjs'
import GitHubSyncHandler from './GitHubSyncHandler.mjs'
import Settings from '@overleaf/settings'
import logger from '@overleaf/logger'
import Path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import ProjectUploadManager from '../../../../app/src/Features/Uploads/ProjectUploadManager.mjs'
import { Readable } from 'node:stream'


/**
 * Get user's GitHub connection status
 */
async function getStatus(req, res) {
  const userId = SessionManager.getLoggedInUserId(req.session)

  const status = await GitHubSyncHandler.promises.getUserGitHubStatus(userId)
  res.json(status)
}

/**
 * List user's GitHub repositories
 */
async function listRepos(req, res) {
  const userId = SessionManager.getLoggedInUserId(req.session)

  try {
    const repos = await GitHubSyncHandler.promises.listUserRepos(userId)
    res.json({ repos })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}




/**
 * Get project's GitHub sync status
 */
async function getProjectStatus(req, res) {
  const { Project_id: projectId } = req.params

  const status = await GitHubSyncHandler.promises.getProjectSyncStatus(projectId)
  res.json(status)
}




/**
 * Import a GitHub repository as a new project
 */
async function importRepo(req, res) {
  const userId = SessionManager.getLoggedInUserId(req.session)
  const { projectName, repo } = req.body

  try {
    const url = new URL(`https://api.github.com/repos/${repo}/zipball`)
    const token = await GitHubSyncHandler.promises.getGitHubAccessTokenForUser(userId)
    
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.raw+json',
      },
    })
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
    }

    const fsPath = Path.join(
      Settings.path.dumpFolder,
      `github_import_${crypto.randomUUID()}`
    )

    const ab = await response.arrayBuffer()
    fs.writeFileSync(fsPath, Buffer.from(ab))


    const { project } = await ProjectUploadManager.promises.createProjectFromZipArchiveWithName(
      userId,
      projectName,
      fsPath,
      {}
    )
    res.json({ projectId: project._id})
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Error importing GitHub repository')
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' })
  }
}



/**
 * Redirect user to GitHub OAuth authorization URL 
 *   to begin linking process
 */
async function beginAuth(req, res) {
  // build GitHub OAuth URL with required query parameters
  let authUrl = new URL('https://github.com/login/oauth/authorize')
  authUrl.searchParams.append('client_id', Settings.githubSync.clientID)
  authUrl.searchParams.append('redirect_uri', Settings.githubSync.callbackURL)
  authUrl.searchParams.append('scope', 'read:org,repo,workflow')
  let state = req.csrfToken()
  authUrl.searchParams.append('state', state)

  res.redirect(authUrl.toString())
}


/**
 * Handle GitHub OAuth callback and complete registration
 * 1. Validate CSRF token
 * 2. Exchange code for access token
 * 3. Save access token for user
 * 4. Redirect to user settings with success message
 */
async function completeRegistration(req, res) {
  const userId = SessionManager.getLoggedInUserId(req.session)
  const { code, state } = req.query
  try {
    await Csrf.promises.validateToken(state, req.session)
  } catch (error) {
    return res.status(403).json({ error: 'Invalid CSRF token' })
  }

  // fetch access token from GitHub using the code
  let data
  try {
    data = await GitHubSyncHandler.promises.exchangeCodeForToken(code)
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }

  if (!data.access_token) {
    return res.status(400).json({ error: 'Failed to obtain access token from GitHub' })
  }

  await GitHubSyncHandler.promises.saveGitHubAccessTokenForUser(userId, data.access_token)
  
  // Save success message in session to display on redirect
  req.session.projectSyncSuccessMessage = req.i18n.translate('github_successfully_linked_description')
  // redirect to /user/settings
  res.redirect('/user/settings?oauth-complete=github#project-sync')
}


/**
 * Disconnect user's GitHub account
 */
async function unlink(req, res) {
  const userId = SessionManager.getLoggedInUserId(req.session)
  await GitHubSyncHandler.promises.removeGitHubAccessTokenForUser(userId)
  res.json({ success: true })
}

async function exportProject(req, res){

}

async function getUnmergedCommits(req, res){

}

async function mergeFromGitHub(req, res){

}

export default {
  getStatus: expressify(getStatus),
  beginAuth: expressify(beginAuth),
  unlink: expressify(unlink),
  completeRegistration: expressify(completeRegistration),
  listRepos: expressify(listRepos),
  getProjectStatus: expressify(getProjectStatus),
  importRepo: expressify(importRepo),
  exportProject: expressify(exportProject),
  getUnmergedCommits: expressify(getUnmergedCommits),
  mergeFromGitHub: expressify(mergeFromGitHub),
}