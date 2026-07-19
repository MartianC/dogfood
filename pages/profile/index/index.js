const authService = require('../../../services/authService')
const dogService = require('../../../services/dogService')
const { dietGoalLabels } = require('../../../utils/risk')
const assets = require('../../../utils/assets')

Page({
  data: {
    authState: 'guest',
    user: null,
    dogs: [],
    dietGoalLabels,
    defaultDogAvatar: assets.defaultDogAvatar
  },

  async onShow() {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null
    if (tabBar) tabBar.setData({ selected: 'profile' })
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
