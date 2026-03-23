const VALID_OVERALL_THEMES = new Set(['', 'light-', 'system'])

function normalizeOverallTheme(overallTheme) {
  return VALID_OVERALL_THEMES.has(overallTheme) ? overallTheme : 'system'
}

function getOverallThemeFromRequestCookie(req) {
  const overallThemeCookie = req.cookies?.['ol-overallTheme']
  if (overallThemeCookie === 'dark') {
    return ''
  }

  return normalizeOverallTheme(overallThemeCookie)
}

export { getOverallThemeFromRequestCookie, normalizeOverallTheme }
