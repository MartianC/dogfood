const authService = require('../../services/authService')
const dogService = require('../../services/dogService')
const { dietGoalLabels } = require('../../utils/risk')
const assets = require('../../utils/assets')
const { breedAdultWeightCatalog } = require('../../data/breedAdultWeightCatalog')

const breedLabels = Object.fromEntries(
  breedAdultWeightCatalog.map(({ value, label }) => [value, label])
)

Page({
  data: {
    authState: 'guest',
    dogs: [],
    dietGoalLabels,
    breedLabels,
    defaultDogAvatar: assets.defaultDogAvatar
  },

  async onShow() {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null
    if (tabBar) tabBar.setData({ selected: 'dogs' })
    const app = getApp()
    if (app.globalData.authReady) await app.globalData.authReady
    const dogs = await dogService.listDogs()
    this.setData({
      authState: authService.getAuthState(),
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

  onEditDogPanel(e) {
    wx.navigateTo({ url: `/subpackages/dog-profile/dog-edit/index?id=${e.currentTarget.dataset.id}` })
  },

  onViewWeight(e) {
    const dogId = e && e.currentTarget && e.currentTarget.dataset.id
    if (!dogId) return
    wx.navigateTo({
      url: `/subpackages/dog-profile/weight/index?dogId=${encodeURIComponent(dogId)}`
    })
  },

  onViewCare(e) {
    const dogId = e && e.currentTarget && e.currentTarget.dataset.id
    if (!dogId) return
    wx.navigateTo({
      url: `/subpackages/dog-profile/care-record/index?dogId=${encodeURIComponent(dogId)}`
    })
  }
})
