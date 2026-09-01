const assets = require('../../utils/assets')

Page({
  data: {
    defaultDogAvatar: assets.defaultDogAvatar
  },

  onStart() {
    wx.navigateTo({ url: '/subpackages/dog-profile/dog-quick-create/index' })
  }
})
