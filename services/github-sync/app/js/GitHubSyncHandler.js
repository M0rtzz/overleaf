import logger from '@overleaf/logger'
import { GitHubSyncProjectStates, GitHubSyncUserCredentials } from './modals/index.js'
import { ObjectId } from './mongodb.js'
import SecretHelper from './SecretHelper.js'
import Settings from '@overleaf/settings'


const GITHUB_API_BASE = 'https://api.github.com'

async function getProjectGitHubSyncStatus(projectId) {
  return GitHubSyncProjectStates.findByProjectId(projectId)
}

async function saveProjectGitHubSyncStatus(projectId, status) {
  return GitHubSyncProjectStates.saveByProjectId(projectId, status)
}


async function getUserGitHubCredentials(userId) {
  const credentials = await GitHubSyncUserCredentials.findByUserId(userId)
  if (!credentials) {
    return null
  }
  return await SecretHelper.decryptAccessToken(credentials.auth_token_encrypted)
}

// This function will create a repository on GitHub for the project
// If org is provided, it will create the repository under the organization, otherwise it will create the repository under the user's account.
// We will initialize the repository with a README file, and then we will remove the README file later, because we need to make sure the repository is not empty, otherwise GitHub API will reject our commit.
// No other initialization is done in this function.
async function createRepositoryOnGitHub(userId, repoName, repoDescription, isPrivate, org) {
  const accessToken = await getUserGitHubCredentials(userId)
  if (!accessToken) {
    throw new Error('User does not have GitHub credentials')
  }

  const githubApiUrl = org
    ? `${GITHUB_API_BASE}/orgs/${org}/repos`
    : `${GITHUB_API_BASE}/user/repos`
  
  const response = await fetch(githubApiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `token ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
    },
    body: JSON.stringify({
      name: repoName,
      description: repoDescription,
      private: isPrivate,
      auto_init: true, // we need this, but will remove later.
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    logger.error('Failed to create GitHub repository', { userId, repoName, error: errorData })
    throw new Error(`Repository creation failed.`)
  }

  const repoData = await response.json()
  return repoData
}




// Request files list from project history, should return like this
// {
//   "projectId": "699fbae90f632055939d7a5d",
//   "files": {
//     "main.tex": {
//       "data": {
//         "hash": "fd3c0326302e49486d3ea86c833edf9b88320c41"
//       }
//     },
//     "sample.bib": {
//       "data": {
//         "hash": "a0e21c740cf81e868f158e30e88985b5ea1d6c19"
//       }
//     },
//     "frog.jpg": {
//       "data": {
//         "hash": "5b889ef3cf71c83a4c027c4e4dc3d1a106b27809"
//       }
//     },
// }
// We added version for next step to pull file contents.
async function getProjectLatestVersion(projectId) {
  let verURL = `${Settings.apis.project_history.url}/project/${projectId}/version`
  const response = await fetch(verURL)
  if (!response.ok) {
    const errorData = await response.json()
    logger.error('Failed to pull project version from Project History', { projectId, error: errorData })
    throw new Error(`Project History API error: ${errorData.message}`)
  }
  const versionData = await response.json()
  const latestVersion = versionData.version
  
  let URL = `${Settings.apis.project_history.url}/project/${projectId}/version/${latestVersion}`
  const fileResponse = await fetch(URL)
  if (!fileResponse.ok) {
    const errorData = await fileResponse.json()
    logger.error('Failed to pull project files from Project History', { projectId, version: latestVersion, error: errorData })
    throw new Error(`Project History API error: ${errorData.message}`)
  }
  
  let result = await fileResponse.json()
  result.version = latestVersion
  return result
}


async function uploadBlobToGitHub(repoFullName, filePath, buffer, accessToken) {
  const encoding = 'base64'
  const content = buffer.toString('base64')

  const response = await fetch(`${GITHUB_API_BASE}/repos/${repoFullName}/git/blobs`, {
    method: 'POST',
    headers: {
      'Authorization': `token ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
    },
    body: JSON.stringify({
      content,
      encoding,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    logger.error('Failed to upload blob to GitHub', { repoFullName, filePath, error: errorData })
    throw new Error(`GitHub API error: ${errorData.message}`)
  }
  
  const blobData = await response.json()
  return blobData.sha
}

async function createTreeOnGitHub(repoFullName, blobShas, accessToken) {
  const response = await fetch(`${GITHUB_API_BASE}/repos/${repoFullName}/git/trees`, {
    method: 'POST',
    headers: {
      'Authorization': `token ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
    },
    body: JSON.stringify({
      tree: blobShas.map(item => ({
        path: item.path,
        sha: item.sha,
        mode: '100644',
        type: 'blob',
      })),
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    logger.error('Failed to create tree on GitHub', { repoFullName, error: errorData })
    throw new Error(`GitHub API error: ${errorData.message}`)
  }

  const treeData = await response.json()
  return treeData.sha
}


async function createCommitOnGitHub(repoFullName, treeSha, message, accessToken, parents = []) {
  const response = await fetch(`${GITHUB_API_BASE}/repos/${repoFullName}/git/commits`, {
    method: 'POST',
    headers: {
      Authorization: `token ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
    body: JSON.stringify({
      message,
      tree: treeSha,
      parents: parents,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    logger.error('Failed to create commit on GitHub', { repoFullName, error: errorData })
    throw new Error(`GitHub API error: ${errorData.message || response.statusText}`)
  }

  const commitData = await response.json()
  return commitData.sha
}


// We need to remove init README.
async function forceUpdateBranchToCommit(repoFullName, branch, commitSha, accessToken) {
  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${repoFullName}/git/refs/heads/${branch}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sha: commitSha,
        force: true, //
      }),
    }
  )

  const text = await response.text().catch(() => '')
  if (!response.ok) {
    let err = {}
    try { err = JSON.parse(text) } catch {}
    logger.error({ repoFullName, branch, commitSha, status: response.status, body: text }, 'Failed to force update ref')
    throw new Error(`GitHub API error: ${err.message || text || response.statusText}`)
  }

  return JSON.parse(text)
}


// Export a project to GitHub will be a complex process,
//   1. We need to get the latest version of the project, and get the file list with their hashes from project history service.
//   2. Then we need to pull the file contents from project history service, and upload the file blobs to GitHub, and get the blob shas.
//   3. Then, we need to create a tree with all the blobs, and create a commit with the tree, and finally update the ref of the repo to point to the new commit.
//   4. Finally, we need to save the GitHub sync status to the database, so we can show the status on the UI.
async function initializeRepositoryForProject(projectId, userId, repoFullName, defaultBranch) {
  const accessToken = await getUserGitHubCredentials(userId)
  if (!accessToken) {
    throw new Error('User does not have GitHub credentials')
  }

  let blobShas = []
  try {
    // Get latest version, then ask for file contents.
    const latestVersionData = await getProjectLatestVersion(projectId)
    const latestVersion = latestVersionData.version


    for(const filePath in latestVersionData.files) {
      const fileURL = `${Settings.apis.project_history.url}/project/${projectId}/version/${latestVersion}/${encodeURIComponent(filePath)}`
      logger.debug({ projectId, filePath, fileURL }, 'Pulling project file from Project History')
      const fileResponse = await fetch(fileURL)
      if (!fileResponse.ok) {
        const errorData = await fileResponse.json()
        logger.error('Failed to pull project file from Project History', { projectId, filePath, error: errorData })
        throw new Error(`Project History API error: ${errorData.message}`)
      }
      const buffer = Buffer.from(await fileResponse.arrayBuffer())
      const blobSha = await uploadBlobToGitHub(repoFullName, filePath, buffer, accessToken)
      blobShas.push({ path: filePath, sha: blobSha })

      logger.debug({ projectId, filePath, blobSha }, 'Uploaded file blob to GitHub Successfully')
    }

    // // Then, we need to create a tree with all the blobs, and create a commit with the tree, and finally update the ref of the repo to point to the new commit.
    const treeSha = await createTreeOnGitHub(repoFullName, blobShas, accessToken)
    const commitSha = await createCommitOnGitHub(repoFullName, treeSha, `Initial Overleaf Import`, accessToken)

    const updateRefResult = await forceUpdateBranchToCommit(repoFullName, defaultBranch, commitSha, accessToken)
    
    logger.debug({ projectId, repoFullName, treeSha, commitSha, updateRefResult }, 'Created initial commit on GitHub Successfully')

    // Finally, we need to save the GitHub sync status to the database, so we can show the status on the UI.
    return await saveProjectGitHubSyncStatus(projectId, {
      merge_status: 'success',
      default_branch: defaultBranch,
      unmerged_branch: null,
      last_sync_sha: commitSha,
      last_sync_version: latestVersion,
      repo: repoFullName,
      ownerId: new ObjectId(userId),
    })
  } catch (err) {
    logger.error({ err, projectId }, 'Error initializing GitHub repository for project')
    throw err
  }
}

export default {
  promises: {
    getProjectGitHubSyncStatus,
    getUserGitHubCredentials,
    createRepositoryOnGitHub,
    initializeRepositoryForProject,
  }
}