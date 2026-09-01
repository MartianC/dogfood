const authService = require('./services/authService')
const env = require('./config/env')

const ONBOARDING_HERO_PATH = '/pages/onboarding/index'
const ONBOARDING_FORM_PATH = '/subpackages/dog-profile/dog-quick-create/index'
const ONBOARDING_ENTRY_PATHS = [ONBOARDING_HERO_PATH, ONBOARDING_FORM_PATH]

function shouldOpenOnboarding(auth) {
  return Boolean(auth && auth.authState === 'guest')
}

function launchPath(options = {}) {
  return String(options.path || '').replace(/^\//, '')
}

App({
  globalData: {
    authState: 'guest',
    userInfo: null,
    dogs: [],
    authReady: null,
    redirectFrom: null,
    latestPlan: null,
    startupRouteResolved: false
  },

  onLaunch(options = {}) {
    if (env.useCloudBase && typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.init === 'function') {
      wx.cloud.init({ env: env.cloudEnvId })
    }
    this.globalData.authReady = this.initApp()
    this.globalData.authReady.then((auth) => this.routeInitialPage(auth, options))
  },

  async initApp() {
    const auth = await authService.initAuth()
    this.globalData.authState = auth.authState
    this.globalData.userInfo = auth.user
    this.globalData.dogs = auth.dogs || []
    return auth
  },

  async refreshAuthState() {
    const auth = await authService.initAuth()
    this.globalData.authState = auth.authState
    this.globalData.userInfo = auth.user
    this.globalData.dogs = auth.dogs || []
    return auth
  },

  routeInitialPage(auth, options = {}) {
    if (this.globalData.startupRouteResolved) return
    if (!shouldOpenOnboarding(auth)) {
      this.globalData.startupRouteResolved = true
      return
    }

    // 直接打开 01 或 02 时不重复重定向；普通冷启动则先展示 01 Hero。
    if (ONBOARDING_ENTRY_PATHS.some((path) => launchPath(options) === path.slice(1))) {
      this.globalData.startupRouteResolved = true
      return
    }
    if (typeof wx === 'undefined' || typeof wx.redirectTo !== 'function') return

    this.globalData.startupRouteResolved = true
    wx.redirectTo({ url: ONBOARDING_HERO_PATH })
  },

  setLatestPlan(plan) {
    this.globalData.latestPlan = plan
  }
})
