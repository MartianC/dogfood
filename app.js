const authService = require('./services/authService')
const mealPlanService = require('./services/mealPlanService')
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
