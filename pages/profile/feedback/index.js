const feedbackQrService = require('../../../services/feedbackQrService')

Page({
  data: {
    feedbackQrImage: '',
    qrLoadError: false,
    qrLoading: true,
    qrUsingFallback: false
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
      qrLoading: true,
      qrUsingFallback: false
    })

    const result = await feedbackQrService.resolveFeedbackQrImage()
    if (requestId !== this._feedbackQrRequestId) return
    this.setData({
      feedbackQrImage: result.imageUrl,
      qrLoadError: !result.imageUrl,
      qrUsingFallback: result.source === 'fallback',
      qrLoading: false
    })
  },

  onQrError() {
    if (this.data.qrUsingFallback) {
      this.setData({ qrLoadError: true, qrLoading: false })
      return
    }

    this.setData({
      feedbackQrImage: feedbackQrService.getFeedbackQrFallbackImage(),
      qrLoadError: false,
      qrLoading: false,
      qrUsingFallback: true
    })
  },

  onPreviewQr() {
    if (this.data.qrLoading || this.data.qrLoadError || !this.data.feedbackQrImage) return
    wx.previewImage({
      current: this.data.feedbackQrImage,
      urls: [this.data.feedbackQrImage]
    })
  }
})
