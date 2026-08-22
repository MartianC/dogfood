const authService = require('./services/authService')
const env = require('./config/env')

App({
  globalData: {
    authState: 'guest',
    userInfo: null,
    dogs: [],
    authReady: null,
    redirectFrom: null,
    latestPlan: null
  },

  onLaunch() {
    if (env.useCloudBase && typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.init === 'function') {
      wx.cloud.init({ env: env.cloudEnvId })
    }
    this.globalData.authReady = this.initApp()
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

  setLatestPlan(plan) {
    this.globalData.latestPlan = plan
  }
})
