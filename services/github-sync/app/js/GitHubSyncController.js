import { GitHubSyncProjectStates } from './modals/index.js'
import GithubSyncHandler from './GitHubSyncHandler.js'
import { expressify } from '@overleaf/promise-utils'



// This function will create a new repo on GitHub, export current project to that repo,
// and link the repo with the project by saving sync status in database.
// body: {name: "xxx", description: "xxx", private: true, org: "github-org-name"}
// name:         the name of the repo to be created on GitHub, required
// description:  the description of the repo to be created on GitHub, optional
// private:      whether the repo is private or not, required
// org:          if provided, the repo will be created under the organization,
//                  otherwise it will be created under user's account.
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

// This funcion will check github sync status.
// 0. No merge_status in db, return error, no linked repo.
// 1. If merge_status is `success`
//    a), we will export a changes in overleaf since last sync to github, 
//        as a branch with name `overleaf-2026-02-26-1528`
//    b), we will call api to merge the branch `overleaf-2026-02-26-1528` to default branch in our db.
//    c), If merge success, goto step 3,
//        if failed, we will set merge_status to `failure`, and 
//                           set unmerged_branch to `overleaf-2026-02-26-1528`, 
//                           and return error to client, [end]

// 2. If merge_status is `failure` 
//    a), we will call api to merge unmerged_branch to default branch in our db.
//    b), If merge success, goto step 3,
//        if failed, we will keep merge_status to `failure`, and report error to client, [end]

// 3. we need to remember the new merged sha, and compare it with old sha.
//    a), list the differences between old sha and new sha
//    b), post the changes to web service, give them a [filePath, URL], 
//        just like what we do in git-bridge, we use an internal API/v0
//    c), web service will download URL to a temp folder, and apply all changes to the project
//        this is a realtime API call.

// 4. we need to update the sync status in our db, 
//       set merge_status to `success`, unmerged_branch to null
//       update last_sync_sha to new merged sha, and last_sync_version to version we just merged.
//       [end]
async function mergeToGitHubAndPushback(req, res, next) {
  const { Project_id: projectId, user_id: userId } = req.params

  try {
    const projectStatus = await GithubSyncHandler.promises.getProjectGitHubSyncStatus(projectId)
    if (!projectStatus) {
      return res.status(400).json({ error: 'Project is not linked to a GitHub repository' })
    }
    
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}




// p 699dd39a8a419bfc8f417400
// u 699d40291c632958125dbdab
async function dev(req, res, next) {
  // const { Project_id: projectId } = req.params
  // const { user_id: userId } = req.params
  // // const projectStatus = await GithubSyncHandler.promises.getProjectGitHubSyncStatus(projectId)
  // // const userCredentials = await GithubSyncHandler.promises.getUserGitHubCredentials(userId)

  // const repoName = `test-repo-${Date.now()}`

  // const createTest = await GithubSyncHandler.promises.createRepositoryOnGitHub(
  //   userId,
  //   repoName,
  //   'This is a test repository created by GitHub Sync Service',
  //   true,
  //   'ayaka-notes'
  // )

  // const repoFullName = createTest.full_name
  // const defaultBranch = createTest.default_branch
  
  // await GithubSyncHandler.promises.initializeRepositoryForProject(projectId, userId, repoFullName, defaultBranch)

  // res.json({ projectId, userId, repoFullName })
}



export default {
  exportProjectToGithub: expressify(exportProjectToGithub),
  mergeToGitHubAndPushback: expressify(mergeToGitHubAndPushback),
  dev: expressify(dev)
}