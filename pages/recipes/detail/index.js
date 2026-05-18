const dogService = require('../../../services/dogService')
const recipeUtils = require('../../../utils/recipe')
const risk = require('../../../utils/risk')
const auth = require('../../../utils/auth')

Page({
  data: {
    recipe: null,
    dogs: [],
    warnings: [],
    authState: 'guest'
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
    const recipe = recipeUtils.findRecipeById(app.globalData.recipes, this.recipeId)
    const dogs = await dogService.listDogs()
    this.setData({
      recipe,
      dogs,
      authState: app.globalData.authState,
      warnings: risk.checkRisksForDogs(recipe, dogs)
    })
  },

  async onChoosePeriod() {
    const passed = await auth.requireAuth({
      requireProfile: true,
      redirect: `/pages/recipes/detail/index?id=${this.data.recipe.id}`
    })
    if (!passed) return
    const hasDanger = this.data.warnings.some((item) => item.level === 'danger')
    if (hasDanger) {
      wx.showModal({
        title: '确认继续',
        content: '这道食谱和狗狗档案存在明显冲突，建议换一道更合适的食谱。',
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
  }
})
