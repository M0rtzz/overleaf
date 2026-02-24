import { Project } from '../../../../app/src/models/Project.mjs'
import GitHubApiClient from './GitHubApiClient.mjs'
import { GitHubSyncUserCredentials } from '../models/githubSyncUserCredentials.mjs'
import Settings from '@overleaf/settings'
import logger from '@overleaf/logger'
import SecretsHelper from './SecretsHelper.mjs'


/**
 * Get user's GitHub sync status
 */
async function getUserGitHubStatus(userId) {
  const credentials = await GitHubSyncUserCredentials.findOne({ userId }).lean()
  if (!credentials) {
    return { available: true, enabled: false }
  }
  return {
    available: true,
    enabled: true
  }
}



/**
 * List user's GitHub repositories
 * @param {string} userId - User ID
 * @returns {Promise<Array>}
 */
async function listUserRepos(userId) {
  const pat = await getGitHubAccessTokenForUser(userId)
  if (!pat) {
    throw new Error('GitHub not connected')
  }

  return await GitHubApiClient.listAllRepos(pat)
}




/**
 * Get project's GitHub sync status
 * @param {string} projectId - Project ID
 * @returns {Promise<Object>}
 */
async function getProjectSyncStatus(projectId) {
  const project = await Project.findById(projectId, 'githubSync').lean()

  if (!project?.githubSync?.enabled) {
    return { configured: false }
  }

  return {
    configured: true,
    repoOwner: project.githubSync.repoOwner,
    repoName: project.githubSync.repoName,
    branch: project.githubSync.branch,
    lastSyncedAt: project.githubSync.lastSyncedAt,
  }
}


// This function would exchange the OAuth code for an access token with GitHub
// For security, this should be done server-side and not exposed to the client
// The implementation would involve making a POST request to GitHub's token endpoint
// with the client ID, client secret, and the code received from the OAuth callback
async function exchangeCodeForToken(code) {
  const resp = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: Settings.githubSync.clientID,
      client_secret: Settings.githubSync.clientSecret,
      code,
      redirect_uri: Settings.githubSync.callbackURL,
    }),
  })

  const data = await resp.json()
  if (!resp.ok || data.error) {
    throw new Error(
      `GitHub token exchange failed: ${data.error || resp.status} ${data.error_description || ''}`.trim()
    )
  }

  // data: { access_token, token_type, scope, (maybe expires_in/refresh_token...) }
  return data
}

// Save the GitHub access token for a user, encrypted in the database
async function saveGitHubAccessTokenForUser(userId, accessToken) {
  const tokenEncrypted = await SecretsHelper.encryptAccessToken(accessToken)

  let gitHubSyncUserCredentials = new GitHubSyncUserCredentials()
  gitHubSyncUserCredentials.userId = userId
  gitHubSyncUserCredentials.auth_token_encrypted = tokenEncrypted

  // save tp database
  await gitHubSyncUserCredentials.save()
}

/**
 * Remove a user's GitHub access token from the database.
 * Revokes the token with GitHub before deleting it locally.(try)
 * @param {string} userId - User ID
 */
async function removeGitHubAccessTokenForUser(userId) {
  let token = await getGitHubAccessTokenForUser(userId)
  if (token) {
    let URL = `https://api.github.com/applications/${Settings.githubSync.clientID}/token`
    let Authorization = `Basic ${Buffer.from(`${Settings.githubSync.clientID}:${Settings.githubSync.clientSecret}`).toString('base64')}`
    // Revoke token with GitHub
    const resp = await fetch(URL, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': Authorization,
      },
      body: JSON.stringify({ access_token: token }),
    })

    if (!resp.ok) {
      logger.warn(`Failed to revoke GitHub token for user ${userId}: ${resp.status} ${await resp.text()}`)
    }
  }

  await GitHubSyncUserCredentials.deleteMany({ userId })
}

/**
 * Get a user's GitHub token
 * @param {string} userId - User ID
 */
async function getGitHubAccessTokenForUser(userId) {
  const credentials = await GitHubSyncUserCredentials.findOne({ userId }).lean()
  if (!credentials) {
    return null
  }
  return await SecretsHelper.decryptAccessToken(credentials.auth_token_encrypted)
}


export default {
  promises: {
    getUserGitHubStatus,
    listUserRepos,
    getProjectSyncStatus,
    exchangeCodeForToken,
    saveGitHubAccessTokenForUser,
    removeGitHubAccessTokenForUser,
    getGitHubAccessTokenForUser,
  },
}