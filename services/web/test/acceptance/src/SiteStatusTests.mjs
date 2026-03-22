import { expect } from 'chai'
import cheerio from 'cheerio'
import settings from '@overleaf/settings'
import { Cookie } from 'tough-cookie'
import { User as UserModel } from '../../../app/src/models/User.mjs'
import request from './helpers/request.js'
import User from './helpers/User.mjs'

const cookieUrl = `https://${settings.cookieDomain.replace(/^\./, '')}/`

describe('Site status page', function () {
  describe('when public access is disabled', function () {
    beforeEach(function () {
      settings.allowPublicAccess = false
    })

    afterEach(function () {
      settings.allowPublicAccess = true
    })

    it('should remain accessible at /site-status without login', function (done) {
      request.get('/site-status', (error, response, body) => {
        expect(error).to.equal(null)
        expect(response.statusCode).to.equal(200)
        expect(body).to.contain('Website status')
        done()
      })
    })
  })

  describe('when the site is in maintenance mode', function () {
    beforeEach(function () {
      settings.siteIsOpen = false
    })

    afterEach(function () {
      settings.siteIsOpen = true
    })

    it('should remain accessible at /site-status', function (done) {
      request.get('/site-status', (error, response, body) => {
        expect(error).to.equal(null)
        expect(response.statusCode).to.equal(200)
        expect(body).to.contain('Website status')
        done()
      })
    })
  })

  describe('theme selection', function () {
    let user

    beforeEach(async function () {
      user = new User.promises()
      await user.ensureUserExists()
    })

    it('should use the saved user theme after login instead of the theme cookie', async function () {
      await UserModel.updateOne(
        { _id: user._id },
        { $set: { 'ace.overallTheme': 'light-' } }
      )
      await user.login()
      user.jar.setCookie(
        new Cookie({
          key: 'ol-overallTheme',
          value: 'dark',
          domain: settings.cookieDomain.replace(/^\./, ''),
          path: '/',
        }),
        cookieUrl
      )

      const response = await request.promises.request({
        url: '/site-status',
        jar: user.jar,
      })
      const dom = cheerio.load(response.body)

      expect(response.statusCode).to.equal(200)
      expect(dom('body').attr('data-theme')).to.equal('light')
    })
  })
})
