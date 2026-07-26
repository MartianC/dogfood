const dogService = require('../../services/dogService')
const recipeUtils = require('../../utils/recipe')
const authService = require('../../services/authService')
const mealPlanService = require('../../services/mealPlanService')

Page({
  data: {
    authState: 'guest',
    dogs: [],
    recommendations: [],
    latestPlan: null
  },

  async onShow() {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null
    if (tabBar) tabBar.setData({ selected: 'home' })
    const app = getApp()
    if (app.globalData.authReady) await app.globalData.authReady
    const authStateBeforeLoad = authService.getAuthState()
    const dogs = authStateBeforeLoad === 'guest' ? [] : await dogService.listDogs()
    const authState = authService.getAuthState()
    const mode = dogs.length ? 'allDogs' : 'all'
    const recommendations = recipeUtils.filterRecipes(app.globalData.recipes, { mode, dogs }).slice(0, 3)
    let history = []
    if (authState !== 'guest') {
      try {
        history = await mealPlanService.listHistory()
      } catch (error) {
        history = []
      }
    }
    this.setData({
      authState,
      dogs,
      recommendations,
      latestPlan: app.globalData.latestPlan || history[history.length - 1] || null
    })
  },

  async onAddDog() {
    if (this.data.authState === 'guest') {
      const ok = await authService.login()
      if (!ok) return
    }
    wx.navigateTo({ url: '/subpackages/dog-profile/dog-edit/index' })
  },

  onBrowseRecipes() {
    wx.switchTab({ url: '/pages/recipes/list/index' })
  },

  onRecipeTap(e) {
    wx.navigateTo({ url: `/pages/recipes/detail/index?id=${e.detail.recipe.id}` })
  },

  onEditDog(e) {
    wx.navigateTo({ url: `/subpackages/dog-profile/dog-edit/index?id=${e.detail.dog.id}` })
  },

  onOpenPlan() {
    wx.switchTab({ url: '/pages/plan/index/index' })
  }
})
