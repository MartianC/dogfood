const authService = require('../../../services/authService')
const userProfileService = require('../../../services/userProfileService')
const assets = require('../../../utils/assets')
const { openAvatarEditor } = require('../../../utils/avatarEditor')

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
    openAvatarEditor(tempFilePath, (editedFilePath) => {
      this.setData({
        avatarTempFilePath: editedFilePath,
        avatarUrl: editedFilePath
      })
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
  }
})
