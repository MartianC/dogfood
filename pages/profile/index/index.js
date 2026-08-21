const authService = require('../../../services/authService')
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

  onAvatarError() {
    this.setData({ avatarUrl: '' })
  },

  onShareAppMessage() {
    return {
      title: '爪饭，帮你把每一顿记清楚',
      path: '/pages/home/index'
    }
  }
})
