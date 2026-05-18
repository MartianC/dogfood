const authService = require('../../../services/authService')
const dogService = require('../../../services/dogService')
const { ageStageLabels, dietGoalLabels } = require('../../../utils/risk')

Page({
  data: {
    authState: 'guest',
    user: null,
    dogs: [],
    ageStageLabels,
    dietGoalLabels
  },

  async onShow() {
    const app = getApp()
    if (app.globalData.authReady) await app.globalData.authReady
    const dogs = await dogService.listDogs()
    this.setData({
      authState: authService.getAuthState(),
      user: authService.getCurrentUser(),
      dogs
    })
  },

  async onLogin() {
    const ok = await authService.login()
    if (ok) {
      wx.navigateTo({ url: '/subpackages/dog-profile/dog-edit/index' })
    }
  },

  onAddDog() {
    wx.navigateTo({ url: '/subpackages/dog-profile/dog-edit/index' })
  },

  onEditDog(e) {
    wx.navigateTo({ url: `/subpackages/dog-profile/dog-edit/index?id=${e.detail.dog.id}` })
  },

  onEditDogPanel(e) {
    wx.navigateTo({ url: `/subpackages/dog-profile/dog-edit/index?id=${e.currentTarget.dataset.id}` })
  },

  onHistory() {
    wx.navigateTo({ url: '/subpackages/plan-extra/detail/index' })
  },

  onCustomRecipes() {
    wx.navigateTo({ url: '/subpackages/custom-recipe/edit/index' })
  }
})
