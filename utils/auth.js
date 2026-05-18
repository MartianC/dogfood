const authService = require('../services/authService')

function currentPageRoute() {
  if (typeof getCurrentPages !== 'function') return ''
  const pages = getCurrentPages()
  const page = pages[pages.length - 1]
  if (!page) return ''
  const query = page.options ? Object.keys(page.options).map((key) => `${key}=${page.options[key]}`).join('&') : ''
  return `/${page.route}${query ? `?${query}` : ''}`
}

async function requireAuth(options = {}) {
  const state = authService.getAuthState()
  if (state === 'guest') {
    const ok = await authService.login()
    if (!ok) return false
  }
  const nextState = authService.getAuthState()
  if (options.requireProfile && nextState !== 'has-profile') {
    const redirect = encodeURIComponent(options.redirect || currentPageRoute())
    if (typeof wx !== 'undefined') {
      wx.navigateTo({ url: `/subpackages/dog-profile/dog-quick-create/index?redirect=${redirect}` })
    }
    return false
  }
  return true
}

module.exports = {
  requireAuth
}
