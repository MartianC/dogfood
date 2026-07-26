const dogService = require('../../../services/dogService')
const customRecipeService = require('../../../services/customRecipeService')

Page({
  data: {
    dogs: [],
    recipes: [],
    createVisible: false,
    createLoading: false
  },

  async onShow() {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null
    if (tabBar) tabBar.setData({ selected: 'recipes' })
    const app = getApp()
    if (app.globalData.authReady) await app.globalData.authReady
    const dogs = await dogService.listDogs()
    this.setData({
      dogs,
      recipes: customRecipeService.listRecipes()
    })
  },

  openCreatePopup() {
    const popup = this.selectComponent('#recipeCreatePopup')
    if (popup) popup.reset()
    this.setData({ createVisible: true })
  },

  onCreateVisibleChange(event) {
    this.setData({ createVisible: event.detail.visible })
  },

  onCreateCancel() {
    this.setData({ createVisible: false })
  },

  onCreateConfirm(event) {
    this.setData({ createLoading: true })
    try {
      const recipe = customRecipeService.createDraft(event.detail)
      this.setData({ createVisible: false })
      wx.navigateTo({ url: `/subpackages/custom-recipe/edit/index?id=${encodeURIComponent(recipe.id)}` })
    } catch (error) {
      wx.showToast({ title: error.message || '暂时无法新建食谱', icon: 'none' })
    } finally {
      this.setData({ createLoading: false })
    }
  },

  onRecipeTap(event) {
    const recipe = event.detail.recipe
    customRecipeService.saveDraft(recipe)
    wx.navigateTo({ url: `/subpackages/custom-recipe/edit/index?id=${encodeURIComponent(recipe.id)}` })
  }
})
