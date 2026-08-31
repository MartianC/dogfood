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
    avatarUrl: '',
    avatarTempFilePath: '',
    nickname: '',
    defaultUserAvatar: assets.defaultUserAvatar,
    saving: false
  },

  async onShow() {
    const app = getApp()
    if (app.globalData.authReady) await app.globalData.authReady
    const user = authService.getCurrentUser()
    this.setData({
      authState: authService.getAuthState(),
      user,
      avatarUrl: user && user.avatarUrl ? user.avatarUrl : '',
      avatarTempFilePath: '',
      nickname: getDisplayNickname(user),
      saving: false
    })
  },

  async onLogin() {
    const ok = await authService.login()
    if (ok) await this.onShow()
  },

  onChooseAvatar(event) {
    if (this.data.authState === 'guest') return
    const tempFilePath = event && event.detail && event.detail.avatarUrl
    if (!tempFilePath) return
    this.setData({
      avatarTempFilePath: tempFilePath,
      avatarUrl: tempFilePath
    })
  },

  onAvatarError() {
    this.setData({ avatarUrl: '' })
  },

  onNicknameInput(event) {
    this.setData({ nickname: event && event.detail ? event.detail.value : '' })
  },

  async onSave() {
    if (this.data.authState === 'guest' || this.data.saving) return
    const nickname = String(this.data.nickname || '').trim()
    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    try {
      let avatarUrl = this.data.avatarUrl
      if (this.data.avatarTempFilePath) {
        avatarUrl = await userProfileService.saveAvatar(
          this.data.avatarTempFilePath,
          this.data.user && this.data.user.id
        )
      }
      const user = await authService.updateCurrentUserProfile({ avatarUrl, nickname })
      this.setData({
        user,
        avatarUrl: user && user.avatarUrl ? user.avatarUrl : '',
        avatarTempFilePath: '',
        nickname: getDisplayNickname(user),
        saving: false
      })
      wx.showToast({ title: '已保存', icon: 'success' })
      wx.navigateBack({ delta: 1 })
    } catch (error) {
      this.setData({ saving: false })
      wx.showToast({ title: '保存失败，请稍后再试', icon: 'none' })
    }
  },

  async onLogout() {
    if (this.data.authState === 'guest' || this.data.saving) return false

    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '退出登录',
        content: '退出后将回到游客模式，确定要退出当前账号吗？',
        cancelText: '取消',
        confirmText: '退出登录',
        success: (result) => resolve(Boolean(result && result.confirm)),
        fail: () => resolve(false)
      })
    })
    if (!confirmed) return false

    authService.logout()
    const app = typeof getApp === 'function' ? getApp() : null
    if (app && typeof app.refreshAuthState === 'function') {
      await app.refreshAuthState()
    } else if (app && app.globalData) {
      app.globalData.authState = 'guest'
      app.globalData.userInfo = null
      app.globalData.dogs = []
    }
    wx.switchTab({ url: '/pages/profile/index/index' })
    return true
  }
})
