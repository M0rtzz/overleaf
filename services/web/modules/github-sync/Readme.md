# GitHub Sync API Document

### API End Point:

#### 01. Link and Unlink Github Account (Finished in web/modules)
Appeared in user setting page, user can link or unlink github account here.
```
GET `/github-sync/beginAuth`
```
It will redirect to github auth and fetch token.


Appear in user setting page too, user can unlink github account here. It will revoke token and remove github account info in our database.
```
POST /github-sync/unlink
{"_csrf": "xxxx" }
```
Result: just refresh page after success.


#### 02. Import Project from Github

In project list page, we can select import from github, it should shows all repos.
```
GET: /user/github-sync/repos
{
    "repos": [
        {
            "name": "testRepoName",
            "full_name": "user/testRepoName"
        },
        {
            "name": "testRepoName2",
            "full_name": "user/testRepoName2"
        },
    ]
}
```


```
POST: `/project/new/github-sync`
{"projectName":"auto-overleaf","repo":"ayaka-notes/auto-overleaf"}
```

API return:
```
{"project_id":"699b0d628a0bdc986b68f21a"}
```

#### 03. Publish new project to github
```
POST: /project/699b0ea46161d1787ce2329b/github-sync/export
{name: "internal-test", description: "internal-test", private: true, org: "ayaka-notes"}
```

```
GET: /user/github-sync/status # check if paid user
{available: true, enabled: true}
```


#### 04. Sync between overleaf and github
When user open project github sync modal, we will fetch github sync status and show it in modal, user can choose to pull github's change or merge overleaf's change to github.

There are no difference between pull and merge, the only difference is push need a `message` for commit, but pull not.

Internally, we will export overleaf's changes since last sync point to github (export as a branch), and then we will try to merge the exported branch to default branch (main/master/etc).
- if there is no conflict, we will just merge it, delete the exported branch.
- if there is conflict, we will keep the exported branch and show the unmerged branch info in modal, user can choose to merge or not. 

When there are no conflict, we will just merge the change, delete the exported branch and update sync point.

Once sync point is determined, we will fetch all changed files since last sync point, and then we will replace all of those files in overleaf with the content in github, and then we will update sync point to latest commit.

Get github sync status, including if github sync enabled, merge status, repo info, unmerged branch info and owner info.
```
GET /project/699b0ea46161d1787ce2329b/github-sync/status
{
    "enabled": true,
    "merge_status": "success",
    "repo": "ayaka-notes/internal-test",
    "unmerged_branch": null,
    "owner_id": "698bf0400fb804ce63648e1a",
    "owner": {
        "_id": "698bf0400fb804ce63648e1a",
        "email": "xxxx@outlook.in",
        "githubFeature": {
            "available": true,
            "enabled": true
        }
    }
}
```

Pull github's change (maybe some changes Since last sync point)
```
GET /project/699b0ea46161d1787ce2329b/github-sync/commits/unmerged
{diverged: false, commits: []}
{
    "diverged": false,
    "commits": [
        {
            "message": "Update main.tex",
            "author": {
                "name": "xxxx",
                "email": "xxxx@xxx.xxx.cn",
                "date": "2026-02-22T14:24:30Z"
            },
            "sha": "94bf4029733794b9b68fb2692ec06d6a75b5c2b6"
        }
    ]
}
// or another example:
{
  "diverged": false,
  "commits": [
    {
      "message": "Update introduction section content",
      "author": {
        "name": "xxx",
        "email": "xxx@xx.edu.cn",
        "date": "2026-02-22T16:07:32Z"
      },
      "sha": "6bf04e90903975d1b197b0626d9578dbc599176d"
    },
    {
      "message": "Update main.tex",
      "author": {
        "name": "xxx",
        "email": "xxx@xx.edu.cn",
        "date": "2026-02-22T16:07:40Z"
      },
      "sha": "1d3f5b1811de8ba25e1407d8f08c0126660cafaf"
    },
    {
      "message": "Update main.tex",
      "author": {
        "name": "xxx",
        "email": "xxx@xx.edu.cn",
        "date": "2026-02-22T16:07:57Z"
      },
      "sha": "34d4c2506fbff5cf4a66e4ca63687e64e290e097"
    }
  ]
}
```

User commit overleaf's change to github.
```
POST /github-sync/merge
{message: "123123123"}
```