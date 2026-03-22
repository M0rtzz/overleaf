import Settings from '@overleaf/settings'
import SessionManager from '../Authentication/SessionManager.mjs'
import SystemMessageManager from '../SystemMessages/SystemMessageManager.mjs'

const VALID_OVERALL_THEMES = new Set(['', 'light-', 'system'])

function normalizeOverallTheme(overallTheme) {
  return VALID_OVERALL_THEMES.has(overallTheme) ? overallTheme : 'system'
}

function getThemeRenderOptions(req) {
  const sessionUser = SessionManager.getSessionUser(req.session)
  if (!sessionUser) {
    return {
      overallThemeOverride: 'system',
    }
  }

  return {
    overallThemeOverride: normalizeOverallTheme(sessionUser.ace?.overallTheme),
    ignoreOverallThemeCookie: true,
  }
}

function getOverallStatus() {
  if (Settings.shuttingDown) {
    return {
      label: 'Shutting down',
      tone: 'maintenance',
      summary:
        'The service is shutting down and may become temporarily unavailable.',
      noticeTitle: 'Service shutdown in progress',
    }
  }

  if (!Settings.siteIsOpen) {
    return {
      label: 'Maintenance in progress',
      tone: 'maintenance',
      summary:
        'Core web functionality is temporarily unavailable while maintenance is in progress.',
      noticeTitle: 'Scheduled maintenance is active',
    }
  }

  if (!Settings.editorIsOpen) {
    return {
      label: 'Editor unavailable',
      tone: 'degraded',
      summary:
        'The website is reachable, but the editor is currently unavailable.',
      noticeTitle: 'Editor functionality is degraded',
    }
  }

  return {
    label: 'All systems operational',
    tone: 'operational',
    summary: 'The website, editor, and sign-in flow are operating normally.',
    noticeTitle: null,
  }
}

function getServiceStatus(
  name,
  description,
  isAvailable,
  unavailableLabel,
  unavailableTone = 'maintenance'
) {
  return {
    name,
    description,
    tone: isAvailable ? 'operational' : unavailableTone,
    label: isAvailable ? 'Operational' : unavailableLabel,
  }
}

function buildAnnouncements(overallStatus) {
  const announcements = []

  if (Settings.maintenanceMessageHTML) {
    announcements.push({
      title: overallStatus.noticeTitle || 'Maintenance notice',
      tone: overallStatus.tone,
      isHtml: true,
      content: Settings.maintenanceMessageHTML,
    })
  } else if (Settings.maintenanceMessage) {
    announcements.push({
      title: overallStatus.noticeTitle || 'Maintenance notice',
      tone: overallStatus.tone,
      isHtml: false,
      content: Settings.maintenanceMessage,
    })
  }

  for (const message of SystemMessageManager.getMessages() || []) {
    if (typeof message?.content !== 'string' || message.content.trim() === '') {
      continue
    }

    announcements.push({
      title: 'System message',
      tone: 'info',
      isHtml: false,
      content: message.content,
    })
  }

  return announcements
}

export default {
  page(req, res) {
    const overallStatus = getOverallStatus()
    const websiteAvailable = Settings.siteIsOpen && !Settings.shuttingDown
    const editorAvailable =
      Settings.siteIsOpen && Settings.editorIsOpen && !Settings.shuttingDown
    const signInAvailable = Settings.siteIsOpen && !Settings.shuttingDown
    const announcements = buildAnnouncements(overallStatus)

    res.render('general/site-status', {
      title: 'Website status',
      bodyClasses: ['site-status-page'],
      siteStatus: {
        overallStatus,
        announcements,
        services: [
          getServiceStatus(
            'Website',
            'Dashboard, project list, and general account pages.',
            websiteAvailable,
            Settings.shuttingDown ? 'Shutting down' : 'Maintenance'
          ),
          getServiceStatus(
            'Editor',
            'Project editing, compile workflow, and collaboration tools.',
            editorAvailable,
            !Settings.siteIsOpen
              ? 'Maintenance'
              : Settings.shuttingDown
                ? 'Shutting down'
                : 'Unavailable',
            !Settings.siteIsOpen || Settings.shuttingDown
              ? 'maintenance'
              : 'degraded'
          ),
          getServiceStatus(
            'Sign-in',
            'Login, session validation, and account access flow.',
            signInAvailable,
            Settings.shuttingDown ? 'Shutting down' : 'Unavailable'
          ),
        ],
        adminEmail: Settings.adminEmail,
        statusPageUrl: Settings.statusPageUrl,
      },
      ...getThemeRenderOptions(req),
    })
  },
}
