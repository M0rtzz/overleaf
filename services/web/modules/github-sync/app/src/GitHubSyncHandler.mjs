import { Project } from '../../../../app/src/models/Project.mjs'
import GitHubApiClient from './GitHubApiClient.mjs'
import { GitHubSyncUserCredentials } from '../models/githubSyncUserCredentials.mjs'
import { GitHubSyncProjectStates } from '../models/githubSyncProjectStates.mjs'
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
 * Get project's GitHub sync status
 */
async function getProjectGitHubSyncStatus(projectId) {
  const projectStatus = await GitHubSyncProjectStates.findOne({ projectId }, 
    { 
      _id: 0, __v: 0, 
      last_sync_sha: 0, 
      last_sync_version: 0,
    }
  ).lean()
  if (!projectStatus) {
    return { enabled: false }
  }
  projectStatus.enabled = true
  return projectStatus
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
 * Get project's GitHub sync status, directly from db.
 */
async function getProjectSyncStatus(projectId) {
  const projectStatus = await GitHubSyncProjectStates.findOne({ projectId }, { _id: 0, __v: 0 }).lean()
  if (!projectStatus) {
    return { enabled: false }
  }
  return projectStatus
}


// This function would exchange the OAuth code for an access token with GitHub
// For security, this should be done server-side and not exposed to the client
// The implementation would involve making a POST request to GitHub's token endpoint
// with the client ID, client secret, and the code received from the OAuth callback
async function exchangeCodeForToken(code) {

  return await GitHubApiClient.exchangeCodeForToken(code)
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

// Save githubSyncProjectStates for a project
async function saveNewlySyncedProjectState(projectId, ownerId, repo, sha, branch, ver) {
  let gitHubSyncProjectStates = new GitHubSyncProjectStates()
  gitHubSyncProjectStates.projectId = projectId
  gitHubSyncProjectStates.ownerId = ownerId
  gitHubSyncProjectStates.repo = repo
  gitHubSyncProjectStates.merge_status = 'success'
  gitHubSyncProjectStates.last_sync_sha = sha
  gitHubSyncProjectStates.default_branch = branch
  gitHubSyncProjectStates.last_sync_sha = sha
  gitHubSyncProjectStates.last_sync_version = ver
  await gitHubSyncProjectStates.save()
}



/**
 * Remove a user's GitHub access token from the database.
 * Revokes the token with GitHub before deleting it locally.(try)
 * @param {string} userId - User ID
 */
async function removeGitHubAccessTokenForUser(userId) {
  let token = await getGitHubAccessTokenForUser(userId)
  if (token) {
    await GitHubApiClient.revokePat(token)
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

/**
 * Get a repo's basic info
 * @param {string} userId - User ID
 */
async function getRepoInfo(userId, repoFullName) {
  const pat = await getGitHubAccessTokenForUser(userId)
  if (!pat) {
    throw new Error('GitHub not connected')
  }

  return await GitHubApiClient.getRepoInfo(pat, repoFullName)
}

async function getGitHubOrgsForUser(userId) {
  const pat = await getGitHubAccessTokenForUser(userId)
  if (!pat) {
    throw new Error('GitHub not connected')
  }

  const orgs = await GitHubApiClient.listOrgs(pat)
  const user = await GitHubApiClient.listUser(pat)
  return { user: user, orgs: orgs }
}

async function exportProjectToGitHub(userId, projectId, name, description, isPrivate, org) {
  const url = `${Settings.apis.github_sync.url}/project/${projectId}/user/${userId}/export`

  logger.debug({ userId, projectId, url }, 'Exporting project to GitHub')
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, description, private: isPrivate, org }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`GitHub Sync Service error: ${response.status} - ${errorText}`)
  }

  return await response.json()
}

export default {
  promises: {
    getUserGitHubStatus,
    getProjectGitHubSyncStatus,
    listUserRepos,
    getProjectSyncStatus,
    exchangeCodeForToken,
    saveGitHubAccessTokenForUser,
    removeGitHubAccessTokenForUser,
    getGitHubAccessTokenForUser,
    getRepoInfo,
    saveNewlySyncedProjectState,
    getGitHubOrgsForUser,
    exportProjectToGitHub,
  },
}