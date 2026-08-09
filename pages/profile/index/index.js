const authService = require('../../../services/authService')
const userProfileService = require('../../../services/userProfileService')
const assets = require('../../../utils/assets')

Page({
  data: {
    authState: 'guest',
    user: null,
    avatarUrl: '',
    defaultUserAvatar: assets.defaultUserAvatar
  },

  async onShow() {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null
    if (tabBar) tabBar.setData({ selected: 'profile' })
    const app = getApp()
    if (app.globalData.authReady) await app.globalData.authReady
    const user = authService.getCurrentUser()
    this.setData({
      authState: authService.getAuthState(),
      user,
      avatarUrl: user && user.avatarUrl ? user.avatarUrl : ''
    })
  },

  async onChooseAvatar(event) {
    const tempFilePath = event && event.detail && event.detail.avatarUrl
    if (this.data.authState === 'guest' || !this.data.user || !tempFilePath) return
    try {
      const avatarUrl = await userProfileService.saveAvatar(tempFilePath, this.data.user.id)
      const user = await authService.updateCurrentUserProfile({ avatarUrl })
      this.setData({ user, avatarUrl })
    } catch (error) {
      wx.showToast({ title: '头像保存失败，请稍后再试', icon: 'none' })
    }
  },

  onAvatarError() {
    this.setData({ avatarUrl: '' })
  }
})
