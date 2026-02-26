
import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import GithubLogo from '@/shared/svgs/github-logo'
import { useProjectContext } from '@/shared/context/project-context'
import IntegrationCard from '@/features/ide-redesign/components/integrations-panel/integration-card'
import {
  OLModalBody,
  OLModalFooter,
  OLModalHeader,
  OLModalTitle,
  OLModal,
} from '@/shared/components/ol/ol-modal'
import OLButton from '@/shared/components/ol/ol-button'
import OLForm from '@/shared/components/ol/ol-form'
import OLFormGroup from '@/shared/components/ol/ol-form-group'
import OLFormControl from '@/shared/components/ol/ol-form-control'
import OLFormLabel from '@/shared/components/ol/ol-form-label'
import OLFormCheckbox from '@/shared/components/ol/ol-form-checkbox'
import OLFormSelect from '@/shared/components/ol/ol-form-select'

import OLRow from '@/shared/components/ol/ol-row'
import OLCol from '@/shared/components/ol/ol-col'
import {
  getJSON,
  postJSON
} from '../../../../../frontend/js/infrastructure/fetch-json'
import getMeta from '@/utils/meta'
import OLNotification from '@/shared/components/ol/ol-notification'


type GithubSyncModalLoadingProps = {
  handleHide: () => void
}
const GithubSyncModalLoading = ({ handleHide }: GithubSyncModalLoadingProps) => {
  const { t } = useTranslation()
  return (
    <>
      <OLModalBody>
        <div role="status" className="loading align-items-start">
          <div aria-hidden="true" data-testid="ol-spinner" className="spinner-border spinner-border-sm"></div>
          {t('checking_project_github_status')}
        </div>
      </OLModalBody>
      <OLModalFooter>
        <OLButton
          variant="secondary"
          onClick={handleHide}
        >
          {t('cancel')}
        </OLButton>
      </OLModalFooter>
    </>
  )
}

type GithubSyncModalExportingProps = {
  handleHide: () => void
  handleSetModalState: (modalStatus: 'loading' | 'export' | 'merge' | 'pushSubmit') => void
}
const GithubSyncModalExporting = ({ handleHide, handleSetModalState }: GithubSyncModalExportingProps) => {
  const { t } = useTranslation()
  const [orgs, setOrgs] = useState<string[]>([])
  const [user, setUser] = useState<string>('')
  const [selectedOwner, setSelectedOwner] = useState('')
  const [repoName, setRepoName] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('private')
  const [submitLoading, setSubmitLoading] = useState(false)
  const [isSubmitError, setIsSubmitError] = useState(false)
  const { project } = useProjectContext()

  useEffect(() => {
    const fetchOrgs = async () => {
      try {
        const data = await getJSON<string[]>('/user/github-sync/orgs')
        if (data.user) {
          setUser(data.user.login)
          setSelectedOwner(data.user.login)
        }
        if (data.orgs) {
          setOrgs(data.orgs.map((org: any) => org.login))
        }
      } catch (err: any) {
        console.error('Failed to fetch GitHub orgs', err)
      }
    }

    fetchOrgs()
  }, [])

  const handlerSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSubmitLoading(true)
    // Interface with backend
    // Endpoint: /project/<project_id>/github-sync/export

    // description: "repoDescription"
    // name: "repoName"
    // private: true
    // org: "test-org" (Optional, if not set, use user's)
    const exportRepo = async () => {
      try {
        await postJSON(`/project/${project?._id}/github-sync/export`, {
          body: {
            name: repoName,
            description,
            private: visibility === 'private',
            org: selectedOwner === user ? undefined : selectedOwner,
          },
        })
        // After successful export, we should set modal status to loading.

        setSubmitLoading(false)
        handleSetModalState('loading')
      } catch (err: any) {
        console.error('Failed to export project to GitHub', err)
        setSubmitLoading(false)
        setIsSubmitError(true)
      }
    }

    exportRepo()
  }

  return (
    <>
      <OLModalBody>
        <h4>{t('export_project_to_github')}</h4>
        <p>{t('project_not_linked_to_github')}</p>
        {
          isSubmitError && (
            <OLNotification
              type="error"
              content={t('github_validation_check')}
            />
          )
        }
        <OLForm>
          <OLRow>
            <OLCol md={4}>
              <OLFormGroup>
                <OLFormLabel htmlFor="github-sync-owner">
                  {t('owner')}
                </OLFormLabel>
                <OLFormSelect
                  as="select"
                  id="github-sync-owner"
                  name="org"
                  value={selectedOwner}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setSelectedOwner(e.target.value)
                  }
                >
                  <option key={user} value={user}>
                    {user}
                  </option>
                  {orgs.map(org => (
                    <option key={org} value={org}>
                      {org}
                    </option>
                  ))}
                </OLFormSelect>
              </OLFormGroup>
            </OLCol>

            <OLCol md={5}>
              <OLFormGroup>
                <OLFormLabel htmlFor="github-sync-name">
                  {t('repository_name')}
                </OLFormLabel>
                <OLFormControl
                  id="github-sync-name"
                  name="name"
                  type="text"
                  value={repoName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setRepoName(e.target.value)
                  }
                />
              </OLFormGroup>
            </OLCol>
          </OLRow>

          <OLRow>
            <OLCol md={12}>
              <OLFormGroup>
                <OLFormLabel htmlFor="github-sync-description">
                  {t('description')} ({t('optional')})
                </OLFormLabel>
                <OLFormControl
                  id="github-sync-description"
                  name="description"
                  type="text"
                  value={description}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setDescription(e.target.value)
                  }
                />
              </OLFormGroup>
            </OLCol>
          </OLRow>

          <hr />

          <fieldset>
            <legend className="visually-hidden">
              {t('repository_visibility')}
            </legend>

            <OLFormGroup>
              <OLRow>
                <OLCol md={12}>
                  <OLFormCheckbox
                    type="radio"
                    id="public"
                    name="repository"
                    value="public"
                    checked={visibility === 'public'}
                    onChange={() => setVisibility('public')}
                    label={t('public', { defaultValue: 'Public' })}
                    description={t('github_public_description')}
                  />
                </OLCol>
              </OLRow>
            </OLFormGroup>

            <OLFormGroup>
              <OLRow>
                <OLCol md={12}>
                  <OLFormCheckbox
                    type="radio"
                    id="private"
                    name="repository"
                    value="private"
                    checked={visibility === 'private'}
                    onChange={() => setVisibility('private')}
                    label={t('private', { defaultValue: 'Private' })}
                    description={t('github_private_description')}
                  />
                </OLCol>
              </OLRow>
            </OLFormGroup>
          </fieldset>
        </OLForm>
      </OLModalBody>
      <OLModalFooter>
        <OLButton
          variant="secondary"
          onClick={handleHide}
        >
          {t('cancel')}
        </OLButton>
        <OLButton
          variant="primary"
          onClick={handlerSubmit}
          isLoading={submitLoading}
        >
          {t('create_project_in_github')}
        </OLButton>
      </OLModalFooter>
    </>
  )
}


type GithubSyncModalMergingProps = {
  handleHide: () => void
  setModalStatus: (modalStatus: 'loading' | 'export' | 'merge' | 'pushSubmit') => void
  projectSyncStatus: any
  projectId: string
  // other props to show conflict and allow user to resolve conflict
}

const GithubSyncModalMerging = ({ handleHide, setModalStatus, projectSyncStatus, projectId }: GithubSyncModalMergingProps) => {
  const { t } = useTranslation()
  const { appName } = getMeta('ol-ExposedSettings')
  const [unmergedCommits, setUnmergedCommits] = useState<any[]>([])
  const [isLoadingCommits, setIsLoadingCommits] = useState(true)

  useEffect(() => {
    const fetchUnmergedCommits = async () => {
      try {
        const data = await getJSON(`/project/${projectId}/github-sync/commits/unmerged`)
        setUnmergedCommits(data.commits)
        setIsLoadingCommits(false)
      } catch (err) {
        console.error('Failed to fetch unmerged commits', err)
        setIsLoadingCommits(false)
      }
    }
    fetchUnmergedCommits()
  }, [])

  if (isLoadingCommits) {
    return (
      <>
        <OLModalBody>
          <div role="status" className="loading align-items-start">
            <div aria-hidden="true" data-testid="ol-spinner" className="spinner-border spinner-border-sm"></div>
            {t('checking_project_github_status')}
          </div>
        </OLModalBody>
        <OLModalFooter>
          <OLButton
            variant="secondary"
            onClick={handleHide}
          >
            {t('close')}
          </OLButton>
        </OLModalFooter>
      </>
    )
  }


  return (
    <>
      <OLModalBody>
        <p className="text-center">{t('project_linked_to')}:
          <a href={`https://github.com/${projectSyncStatus.repo}`} target="_blank" rel="noopener noreferrer">
            {projectSyncStatus.repo}
          </a>
        </p>
        <hr></hr>

        {unmergedCommits.length === 0 &&
          <div className="text-center commit-message">
            <p>{t('no_new_commits_in_github')}</p>
          </div>
        }

        {unmergedCommits.length > 0 &&
          <>
            <h3>
              {t('recent_commits_in_github')}
            </h3>
            <div style={{ maxHeight: '200px', overflow: 'auto', marginTop: '1em' }}>
              {unmergedCommits.map((commit: any) => (
                <div id={commit.sha}>
                  <span className="small float-end">
                    <a href={`https://github.com/${projectSyncStatus.repo}/commit/${commit.sha}`}
                      target="_blank" rel="noreferrer noopener">
                      {commit.sha.substring(0, 7)}
                    </a>
                  </span>
                  <a href={`https://github.com/${projectSyncStatus.repo}/commit/${commit.sha}`}
                    target="_blank" className="commit-message" rel="noreferrer noopener">
                    {commit.message}
                  </a>
                  <div className="small">by {commit.author.name} &lt;{commit.author.email}&gt;</div>
                </div>
                // <p key={commit.sha}>{commit.message}</p>
              ))}
            </div>

          </>
        }
        <p className="text-center row-spaced">
          <OLButton
            variant="secondary"
            leadingIcon="arrow_upward"
          >
            {t('pull_github_changes_into_sharelatex', { appName })}
          </OLButton>
        </p>
        <hr></hr>
        <p className="text-center">
          <OLButton
            variant="secondary"
            leadingIcon="arrow_upward"
            onClick={() => setModalStatus('pushSubmit')}
          >
            {t('push_sharelatex_changes_to_github', { appName })}
          </OLButton>
        </p>


      </OLModalBody>
      <OLModalFooter>
        <OLButton
          variant="secondary"
          onClick={handleHide}
        >
          {t('close')}
        </OLButton>
      </OLModalFooter>
    </>
  )
}


type GitHubSyncModalPushSubmitProps = {
  handleHide: () => void
  // other props to show commit message input and submit button
}

const GitHubSyncModalPushSubmit = ({ handleHide }: GitHubSyncModalPushSubmitProps) => {
  const { t } = useTranslation()
  const { appName } = getMeta('ol-ExposedSettings')

  return (
    <>
      <OLModalBody>
        <OLForm>
          <p>{t('sync_project_to_github_explanation', { appName })}</p>
          <OLFormGroup>
            <OLFormControl
              as="textarea"
              rows={2}
              placeholder={t('github_commit_message_placeholder', { appName })}
            />
          </OLFormGroup>
        </OLForm>
      </OLModalBody>
      <OLModalFooter>
        <OLButton
          variant="secondary"
          onClick={handleHide}
        >
          {t('cancel')}
        </OLButton>
        <OLButton
          variant="primary"
        >
          {t('sync')}
        </OLButton>
      </OLModalFooter>
    </>
  )
}


type GitHubSyncModalProps = {
  show: boolean
  handleHide: () => void
  projectId: string
  modalStatus: 'loading' | 'export' | 'merge' | 'pushSubmit'
  setModalStatus: (modalStatus: 'loading' | 'export' | 'merge' | 'pushSubmit') => void
}

// 0. Check project github sync status 
//    Show spinner while loading, show error message if error occurs
// 1. If /project/<project_ID>/github-sync/status 
//    returns {enabled: false} then show export Github table
//        a) export Github table will check /user/github-sync/orgs
//        b) once user submits export, spinner in button
//        c) if export is successful, return to step 0, to reload status.
// 2. If /project/<project_ID>/github-sync/status 
//    returns {enabled: true, merge_status: 'success'}
//    then show pull/push table
//        a) check /project/<project_ID>/github-sync/commits/unmerged
//        b) if there are unmerged commits, show pull button
//        c) push button should always be shown
// 3. If /project/<project_ID>/github-sync/status
//    returns {enabled: true, merge_status: 'conflict'}
//    then show conflict resolution contents.
//        a) user can choose to merge confict in github, and submit 
//           remerge form overleaf.
function GitHubSyncModal({ show, handleHide, projectId, modalStatus, setModalStatus }: GitHubSyncModalProps) {
  const { t } = useTranslation()
  const { project } = useProjectContext()
  
  const [projectSyncStatus, setProjectSyncStatus] = useState<any>(null)

  // If modalStatus is loading, we will fetch status
  useEffect(() => {
    if (!show || !project || modalStatus !== 'loading') {
      return
    }
    const fetchGitHubSyncStatus = async () => {
      try {
        const data = await getJSON(`/project/${projectId}/github-sync/status`)
        if (data.enabled) {
          setModalStatus('merge')
          setProjectSyncStatus(data)
        } else {
          setModalStatus('export')
        }
      } catch (err: any) {
        console.error('Failed to fetch GitHub sync status', err)
      }
    }

    fetchGitHubSyncStatus()
  }, [show, modalStatus])

  return (
    <OLModal show={show} onHide={handleHide} size="lg" backdrop="static">
      <OLModalHeader closeButton>
        <OLModalTitle>{t('github_sync')}</OLModalTitle>
      </OLModalHeader>
      {modalStatus === 'loading' && <GithubSyncModalLoading handleHide={handleHide} />}
      {modalStatus === 'export' && <GithubSyncModalExporting handleHide={handleHide} handleSetModalState={setModalStatus} />}
      {modalStatus === 'merge' && <GithubSyncModalMerging handleHide={handleHide} setModalStatus={setModalStatus} projectSyncStatus={projectSyncStatus} projectId={projectId} />}
      {modalStatus === 'pushSubmit' && <GitHubSyncModalPushSubmit handleHide={handleHide} />}
    </OLModal >
  )
}




const GitHubSyncCard = () => {
  const { t } = useTranslation()

  const [showGithubSyncModal, setShowGithubSyncModal] = useState(false)
  const { project, tags: projectTags } = useProjectContext()

  // loading: checking github sync status
  // export: show export table to link github repo
  // merge: show remote changes from github and allow user to pull/push
  // pushSubmit: allow user to fill submit message
  const [modalStatus, setModalStatus] = useState<'loading' | 'export' | 'merge' | 'pushSubmit'>('loading')

  return (
    <>
      <IntegrationCard
        title={t('github')}
        description={t('sync_with_a_github_repository')}
        icon={<GithubLogo size={32} />}
        showPaywallBadge={false}
        onClick={() => setShowGithubSyncModal(true)}
      >
      </IntegrationCard>
      <GitHubSyncModal
        show={showGithubSyncModal}
        modalStatus={modalStatus}
        setModalStatus={setModalStatus}
        handleHide={() => {
          setShowGithubSyncModal(false)
          setModalStatus('loading')
        }}
        projectId={project?._id || ''}
      />
    </>
  )
}

export default GitHubSyncCard
