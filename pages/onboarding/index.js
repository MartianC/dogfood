const assets = require('../../utils/assets')

Page({
  data: {
    onboardingHeroImage: assets.onboardingHeroImage
  },

  onStart() {
    wx.navigateTo({ url: '/subpackages/dog-profile/dog-quick-create/index' })
  }
})
