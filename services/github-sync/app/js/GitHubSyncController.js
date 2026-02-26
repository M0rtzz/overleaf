import { GitHubSyncProjectStates } from './modals/index.js'
import GithubSyncHandler from './GitHubSyncHandler.js'
import { expressify } from '@overleaf/promise-utils'


// {name: "123123", description: "13123123123", private: true, org: "ayaka-notes"}
// need to check if status existed, if existed, refuse to link github repo.
async function exportProjectToGithub(req, res, next) {
  const { Project_id: projectId, user_id: userId } = req.params
  const { name, description, private: isPrivate, org } = req.body
  // org can be optional
  if (!projectId || !name || isPrivate === undefined) {
    return res.status(400).json({ error: 'Project_id, name and private are required' })
  }

  try {
    const projectStatus = await GithubSyncHandler.promises.getProjectGitHubSyncStatus(projectId)
    if (projectStatus) {
      return res.status(400).json({ error: 'Project is already linked to a GitHub repository' })
    }
    const repoResult = await GithubSyncHandler.promises.createRepositoryOnGitHub(
      userId,
      name,
      description,
      isPrivate,
      org
    )
    const repoFullName = repoResult.full_name
    const defaultBranch = repoResult.default_branch


    const statusData = await GithubSyncHandler.promises.initializeRepositoryForProject(
      projectId,
      userId,
      repoFullName,
      defaultBranch
    )
  
    res.json({ statusData })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}


// p 699dd39a8a419bfc8f417400
// u 699d40291c632958125dbdab
async function dev(req, res, next) {
  const { Project_id: projectId } = req.params
  const { user_id: userId } = req.params
  // const projectStatus = await GithubSyncHandler.promises.getProjectGitHubSyncStatus(projectId)
  // const userCredentials = await GithubSyncHandler.promises.getUserGitHubCredentials(userId)

  const repoName = `test-repo-${Date.now()}`

  const createTest = await GithubSyncHandler.promises.createRepositoryOnGitHub(
    userId,
    repoName,
    'This is a test repository created by GitHub Sync Service',
    true,
    'ayaka-notes'
  )

  const repoFullName = createTest.full_name
  const defaultBranch = createTest.default_branch
  
  await GithubSyncHandler.promises.initializeRepositoryForProject(projectId, userId, repoFullName, defaultBranch)

  res.json({ projectId, userId, repoFullName })
}

export default {
  exportProjectToGithub,
  dev
}