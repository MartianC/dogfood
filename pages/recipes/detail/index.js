const dogService = require('../../../services/dogService')
const authService = require('../../../services/authService')
const bundledRecipeService = require('../../../services/bundledRecipeService')
const risk = require('../../../utils/risk')
const assets = require('../../../utils/assets')

Page({
  data: {
    recipe: null,
    dogs: [],
    warnings: [],
    authState: 'guest',
    hasDanger: false,
    showAuthSheet: false,
    defaultRecipeImage: assets.defaultRecipeImage
  },

  async onLoad(options) {
    this.recipeId = options.id
    await this.load()
  },

  async onShow() {
    if (this.recipeId) await this.load()
  },

  async load() {
    const app = getApp()
    if (app.globalData.authReady) await app.globalData.authReady
    const recipe = bundledRecipeService.findRecipeById(this.recipeId)
    const dogs = await dogService.listDogs()
    const riskWarnings = risk.checkRisksForDogs(recipe, dogs)
    this.setData({
      recipe,
      dogs,
      authState: authService.getAuthState(),
      warnings: riskWarnings,
      hasDanger: riskWarnings.some((item) => item.level === 'danger')
    })
  },

  async onChoosePeriod() {
    if (this.data.authState !== 'has-profile') {
      this.setData({ showAuthSheet: true })
      return
    }
    if (this.data.hasDanger) {
      wx.showModal({
        title: '确认继续',
        content: '这道食谱和爱宠档案存在明显冲突，建议换一道更合适的食谱。',
        confirmText: '仍然继续',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: `/subpackages/plan-extra/period/index?recipeId=${this.data.recipe.id}` })
          }
        }
      })
      return
    }
    wx.navigateTo({ url: `/subpackages/plan-extra/period/index?recipeId=${this.data.recipe.id}` })
  },

  onCloseAuthSheet() {
    this.setData({ showAuthSheet: false })
  },

  noop() {},

  async onAuthAndCreate() {
    if (authService.getAuthState() === 'guest') {
      const ok = await authService.login()
      if (!ok) return
    }
    this.setData({ showAuthSheet: false })
    const redirect = encodeURIComponent(`/pages/recipes/detail/index?id=${this.data.recipe.id}`)
    wx.navigateTo({ url: `/subpackages/dog-profile/dog-quick-create/index?redirect=${redirect}` })
  }
})
