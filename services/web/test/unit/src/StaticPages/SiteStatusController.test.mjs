import { expect, vi } from 'vitest'
import MockRequest from '../helpers/MockRequest.mjs'
import MockResponse from '../helpers/MockResponse.mjs'

const modulePath = '../../../../app/src/Features/StaticPages/SiteStatusController'

describe('SiteStatusController', function () {
  beforeEach(async function (ctx) {
    vi.resetModules()

    ctx.settings = {
      appName: 'Overleaf',
      adminEmail: 'admin@example.com',
      siteIsOpen: true,
      editorIsOpen: true,
      shuttingDown: false,
    }
    ctx.SessionManager = {
      getSessionUser: vi.fn().mockReturnValue(null),
    }

    vi.doMock('@overleaf/settings', () => ({
      default: ctx.settings,
    }))

    vi.doMock(
      '../../../../app/src/Features/Authentication/SessionManager',
      () => ({
        default: ctx.SessionManager,
      })
    )

    ctx.SiteStatusController = (await import(modulePath)).default
    ctx.req = new MockRequest(vi)
    ctx.res = new MockResponse(vi)
  })

  it('renders the site status page for anonymous visitors using system theme defaults', function (ctx) {
    ctx.SiteStatusController.page(ctx.req, ctx.res)

    expect(ctx.res.renderedTemplate).to.equal('general/site-status')
    expect(ctx.res.renderedVariables.overallThemeOverride).to.equal('system')
    expect(ctx.res.renderedVariables.ignoreOverallThemeCookie).to.equal(
      undefined
    )
    expect(ctx.res.renderedVariables.siteStatus.overallStatus.label).to.equal(
      'All systems operational'
    )
  })

  it('prefers the saved user theme over cookies for signed-in users', function (ctx) {
    ctx.SessionManager.getSessionUser.mockReturnValue({
      ace: {
        overallTheme: 'light-',
      },
    })

    ctx.SiteStatusController.page(ctx.req, ctx.res)

    expect(ctx.res.renderedVariables.overallThemeOverride).to.equal('light-')
    expect(ctx.res.renderedVariables.ignoreOverallThemeCookie).to.equal(true)
  })

  it('falls back to system theme for invalid saved user themes', function (ctx) {
    ctx.SessionManager.getSessionUser.mockReturnValue({
      ace: {
        overallTheme: 'midnight',
      },
    })

    ctx.SiteStatusController.page(ctx.req, ctx.res)

    expect(ctx.res.renderedVariables.overallThemeOverride).to.equal('system')
    expect(ctx.res.renderedVariables.ignoreOverallThemeCookie).to.equal(true)
  })
})
