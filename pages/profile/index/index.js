const authService = require('../../../services/authService')
const userProfileService = require('../../../services/userProfileService')
const assets = require('../../../utils/assets')

function getDisplayNickname(user) {
  const nickname = user && user.nickname
  if (nickname === '狗饭用户') return '爪饭用户'
  if (nickname === '狗饭体验用户') return '爪饭体验用户'
  return nickname || '微信用户'
}

Page({
  data: {
    authState: 'guest',
    user: null,
    displayNickname: '微信用户',
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
      displayNickname: getDisplayNickname(user),
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
