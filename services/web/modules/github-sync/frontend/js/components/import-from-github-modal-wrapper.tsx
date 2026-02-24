import React from 'react'
import { useTranslation } from 'react-i18next'
import getMeta from '@/utils/meta'
import {
  OLModal,
  OLModalBody,
  OLModalFooter,
  OLModalHeader,
  OLModalTitle,
} from '@/shared/components/ol/ol-modal'
import OLButton from '@/shared/components/ol/ol-button'


const ModalContent = () => {
  const { t } = useTranslation()
  const { appName } = getMeta('ol-ExposedSettings')
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [repos, setRepos] = React.useState<Array<{ name: string; fullName: string }>>([])
  const [inFlight, setInFlight] = React.useState(false)

  const handleImport = (name: string, fullName: string) => {
    setInFlight(true)
    
    fetch('/project/new/github-sync', {
      method: 'POST',
      headers: {
        'X-CSRF-Token': getMeta('ol-csrfToken'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectName: name,
        repo: fullName,
      }),
    })
      .then(response => response.json())
      .then(data => {
        if (data.projectId) {
          window.location.href = `/project/${data.projectId}`
        } else {
          throw new Error('Failed to import project')
        }
      })
      .catch(error => {
        console.error('Error importing GitHub repository:', error)
        setError(error instanceof Error ? error.message : 'Unknown error')
        setInFlight(false)
      })
  }

  // Fetch data from '/user/github-sync/repos',
  // and set isLoading to false once data is fetched
  React.useEffect(() => {
    async function fetchRepos() {
      try {
        const response = await fetch('/user/github-sync/repos')
        if (!response.ok) {
          throw new Error('Network response was not ok')
        }
        // Assuming the response is a JSON array of repositories
        const reposData = await response.json()
        setRepos(reposData.repos)
      } catch (error) {
        console.error('Error fetching GitHub repositories:', error)
        setError(error instanceof Error ? error.message : 'Unknown error')
      } finally {
        setIsLoading(false)
      }
    }
    fetchRepos()
  }, [])

  return (
    <>
      {
        isLoading ? (
          <div className="modal-body">
            <div role="status" className="loading align-items-center">
              <div aria-hidden="true" data-testid="ol-spinner" className="spinner-border spinner-border-sm">
              </div>
              {t('loading_github_repositories')}
            </div>
          </div>
        ) : error ? (
          <div className="modal-body">
            <p className="text-center text-danger">{error}</p>
          </div>
        ) : (
          <>
            <p className="text-center">{
              t('select_github_repository', { appName: appName })
            }
            </p>
            <div className="table-container table-container-bordered">
              <table className="table table-striped table-hover">
                <tbody>
                  {repos.map((repo) => (
                    <tr>
                      <td>{repo.name}
                        <div className="small">
                          <a href={`https://github.com/${repo.fullName}`}>
                            {repo.fullName}
                          </a>
                        </div>
                      </td>
                      <td className="text-end">
                        {/* <button className="btn btn-primary"
                          onClick={() => handleImport(repo.name, repo.fullName)}
                        >{
                           
                          }</button> */}
                        <OLButton
                          variant="secondary"
                          type="button"
                          disabled={inFlight}
                          onClick={() => handleImport(repo.name, repo.fullName)}
                        >
                          { t('import_to_sharelatex', { appName: appName })}
                        </OLButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      }
    </>
  )
}

type ImportFromGitHubModalProps = {
  onHide: () => void
}

export default function ImportFromGitHubModal({ onHide }: ImportFromGitHubModalProps) {
  const { t } = useTranslation()
  return (
    <OLModal show animation size="lg" onHide={onHide}>
      <OLModalHeader onClose={onHide}>
        <OLModalTitle>
          {t('import_from_github')}
        </OLModalTitle>
      </OLModalHeader>
      <OLModalBody>
        <ModalContent />
      </OLModalBody>
      <OLModalFooter>
        <OLButton
          variant="secondary"
          onClick={onHide}
        >
          {t('cancel')}
        </OLButton>
      </OLModalFooter>
    </OLModal>
  )
}