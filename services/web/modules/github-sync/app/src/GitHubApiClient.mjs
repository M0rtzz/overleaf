import logger from '@overleaf/logger'
import fetch from 'node-fetch'

const GITHUB_API_BASE = 'https://api.github.com'

/**
 * Create headers for GitHub API requests
 * @param {string} pat - Personal Access Token
 * @returns {Object}
 */
function getHeaders(pat) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${pat}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Overleaf-GitHub-Sync',
  }
}

/**
 * Verify PAT and get user info
 * @param {string} pat - Personal Access Token
 * @returns {Promise<{login: string, id: number, name: string}>}
 */
async function verifyPat(pat) {
  const response = await fetch(`${GITHUB_API_BASE}/user`, {
    headers: getHeaders(pat),
  })

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Invalid GitHub Personal Access Token')
    }
    throw new Error(`GitHub API error: ${response.status}`)
  }

  const user = await response.json()
  return {
    login: user.login,
    id: user.id,
    name: user.name,
  }
}

/**
 * List 100 repositories for the authenticated user
 */
async function listRepos(pat, page = 1, perPage = 100) {
  const params = new URLSearchParams({
    page: page.toString(),
    per_page: perPage.toString(),
    sort: 'updated',
    direction: 'desc',
  })

  const response = await fetch(
    `${GITHUB_API_BASE}/user/repos?${params.toString()}`,
    {
      headers: getHeaders(pat),
    }
  )

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`)
  }

  let repos = await response.json()

  return repos.map(repo => ({
    name: repo.name,
    fullName: repo.full_name,
  }))
}

/**
 * List All repositories for the authenticated user
 */
async function listAllRepos(pat) {
  let page = 1
  const perPage = 100
  let allRepos = []
  while (true) {
    const repos = await listRepos(pat, page, perPage)
    allRepos = allRepos.concat(repos)
    if (repos.length < perPage) break
    page++
  }
  return allRepos
}


export default {
  verifyPat,
  listRepos,
  listAllRepos,
}