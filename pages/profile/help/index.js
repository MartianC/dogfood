Page({
  data: {
    topic: 'start'
  },

  onLoad(options = {}) {
    this.setData({
      topic: options.topic === 'assessment' ? 'assessment' : 'start'
    })
  }
})
