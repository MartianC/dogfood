const feedbackQrService = require('../../../services/feedbackQrService')

Page({
  data: {
    feedbackQrImage: '',
    qrLoadError: false,
    qrLoading: true
  },

  onShow() {
    this.loadFeedbackQr()
  },

  async loadFeedbackQr() {
    const requestId = (this._feedbackQrRequestId || 0) + 1
    this._feedbackQrRequestId = requestId
    this.setData({
      feedbackQrImage: '',
      qrLoadError: false,
      qrLoading: true
    })

    const result = await feedbackQrService.resolveFeedbackQrImage()
    if (requestId !== this._feedbackQrRequestId) return
    this.setData({
      feedbackQrImage: result.imageUrl,
      qrLoadError: Boolean(result.error || !result.imageUrl),
      qrLoading: false
    })
  },

  onQrError() {
    this.setData({ qrLoadError: true, qrLoading: false })
  },

  onPreviewQr() {
    if (this.data.qrLoading || this.data.qrLoadError || !this.data.feedbackQrImage) return
    wx.previewImage({
      current: this.data.feedbackQrImage,
      urls: [this.data.feedbackQrImage]
    })
  }
})
