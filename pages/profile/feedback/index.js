const profileConfig = require('../../../config/profile')

Page({
  data: {
    feedbackQrImage: profileConfig.feedbackQrImage,
    qrLoadError: false
  },

  onQrError() {
    this.setData({ qrLoadError: true })
  },

  onPreviewQr() {
    if (this.data.qrLoadError || !this.data.feedbackQrImage) return
    wx.previewImage({
      current: this.data.feedbackQrImage,
      urls: [this.data.feedbackQrImage]
    })
  }
})
