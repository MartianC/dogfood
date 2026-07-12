const authService = require('./services/authService')
const mealPlanService = require('./services/mealPlanService')
const env = require('./config/env')
const recipes = require('./data/recipes')

App({
  globalData: {
    authState: 'guest',
    userInfo: null,
    dogs: [],
    recipes,
    recipeVersion: 'bundled-v1',
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
    await mealPlanService.syncPendingPlans()
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
