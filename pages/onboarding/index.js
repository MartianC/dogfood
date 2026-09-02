const assets = require('../../utils/assets')
const authService = require('../../services/authService')

Page({
  data: {
    onboardingHeroImage: assets.onboardingHeroImage,
    loginLoading: false
  },

  onStart() {
    wx.navigateTo({ url: '/subpackages/dog-profile/dog-quick-create/index' })
  },

  async onDirectLogin() {
    if (this.data.loginLoading) return
    this.setData({ loginLoading: true })
    try {
      const loggedIn = authService.getAuthState() === 'guest'
        ? await authService.login()
        : true
      if (!loggedIn) return

      if (authService.getAuthState() === 'has-profile') {
        wx.switchTab({ url: '/pages/home/index' })
        return
      }
      wx.navigateTo({ url: '/subpackages/dog-profile/dog-quick-create/index' })
    } finally {
      this.setData({ loginLoading: false })
    }
  }
})
