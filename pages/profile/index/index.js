const authService = require('../../../services/authService')
const assets = require('../../../utils/assets')

Page({
  data: {
    authState: 'guest',
    user: null,
    defaultDogAvatar: assets.defaultDogAvatar
  },

  async onShow() {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null
    if (tabBar) tabBar.setData({ selected: 'profile' })
    const app = getApp()
    if (app.globalData.authReady) await app.globalData.authReady
    this.setData({
      authState: authService.getAuthState(),
      user: authService.getCurrentUser()
    })
  }
})
