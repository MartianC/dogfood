const CANVAS_MAX_SIZE = 640
const OUTPUT_SIZE = 512
const OUTPUT_QUALITY = 0.82
const MIN_SCALE_PERCENT = 100
const MAX_SCALE_PERCENT = 350
const SLIDER_COLORS = {
  active: '#25684a',
  background: '#d8e1da'
}

function distanceBetween(first, second) {
  const dx = first.x - second.x
  const dy = first.y - second.y
  return Math.sqrt(dx * dx + dy * dy)
}

function midpointBetween(first, second) {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

Page({
  data: {
    canvasSize: 0,
    imageReady: false,
    processing: false,
    scalePercent: MIN_SCALE_PERCENT,
    minScalePercent: MIN_SCALE_PERCENT,
    maxScalePercent: MAX_SCALE_PERCENT,
    sliderActiveColor: SLIDER_COLORS.active,
    sliderBackgroundColor: SLIDER_COLORS.background,
    sliderBlockColor: SLIDER_COLORS.active
  },

  onLoad() {
    this.openerEventChannel = typeof this.getOpenerEventChannel === 'function'
      ? this.getOpenerEventChannel()
      : null
    if (this.openerEventChannel && typeof this.openerEventChannel.on === 'function') {
      this.openerEventChannel.on('avatarEditorInit', ({ tempFilePath } = {}) => {
        this.loadImage(tempFilePath)
      })
    }
  },

  onReady() {
    this.canvasContext = wx.createCanvasContext('avatar-editor-canvas', this)
    this.refreshCanvasRect()
    if (this.imageInfo && this.transform) this.drawCanvas()
  },

  refreshCanvasRect() {
    wx.createSelectorQuery()
      .select('.avatar-editor__canvas-wrap')
      .boundingClientRect((rect) => {
        if (rect) this.canvasRect = rect
      })
      .exec()
  },

  loadImage(tempFilePath) {
    if (!tempFilePath) {
      wx.showToast({ title: '未获取到图片', icon: 'none' })
      return
    }

    wx.getImageInfo({
      src: tempFilePath,
      success: (info) => {
        const windowInfo = typeof wx.getWindowInfo === 'function'
          ? wx.getWindowInfo()
          : wx.getSystemInfoSync()
        const windowWidth = Number(windowInfo && windowInfo.windowWidth) || 375
        const canvasSize = Math.min(CANVAS_MAX_SIZE, Math.max(280, windowWidth - 48))
        this.imageInfo = {
          src: tempFilePath,
          width: Number(info.width) || 1,
          height: Number(info.height) || 1
        }
        this.setData({
          canvasSize,
          imageReady: true,
          processing: false,
          scalePercent: MIN_SCALE_PERCENT
        }, () => {
          this.refreshCanvasRect()
          this.resetTransform()
          this.drawCanvas()
        })
      },
      fail: () => wx.showToast({ title: '图片读取失败，请重试', icon: 'none' })
    })
  },

  resetTransform() {
    const { width, height } = this.imageInfo
    const size = this.data.canvasSize
    const baseScale = Math.max(size / width, size / height)
    this.transform = {
      baseScale,
      scale: baseScale,
      x: (size - width * baseScale) / 2,
      y: (size - height * baseScale) / 2
    }
  },

  getScaleBounds() {
    const baseScale = this.transform ? this.transform.baseScale : 1
    return {
      min: baseScale,
      max: baseScale * (MAX_SCALE_PERCENT / MIN_SCALE_PERCENT)
    }
  },

  clampTransform(transform) {
    const size = this.data.canvasSize
    const { width, height } = this.imageInfo
    const minX = size - width * transform.scale
    const minY = size - height * transform.scale
    return {
      ...transform,
      baseScale: transform.baseScale || this.transform.baseScale,
      x: clamp(transform.x, minX, 0),
      y: clamp(transform.y, minY, 0)
    }
  },

  syncScalePercent() {
    const bounds = this.getScaleBounds()
    const percent = Math.round(this.transform.scale / bounds.min * 100)
    this.setData({ scalePercent: clamp(percent, MIN_SCALE_PERCENT, MAX_SCALE_PERCENT) })
  },

  drawCanvas(callback) {
    if (!this.canvasContext || !this.imageInfo || !this.transform) return
    const ctx = this.canvasContext
    const size = this.data.canvasSize
    const transform = this.transform
    ctx.clearRect(0, 0, size, size)
    ctx.drawImage(
      this.imageInfo.src,
      transform.x,
      transform.y,
      this.imageInfo.width * transform.scale,
      this.imageInfo.height * transform.scale
    )
    ctx.draw(false, callback)
  },

  getTouchPoint(touch) {
    const rect = this.canvasRect
    const clientX = Number.isFinite(touch.clientX) ? touch.clientX : touch.pageX
    const clientY = Number.isFinite(touch.clientY) ? touch.clientY : touch.pageY
    if (rect && Number.isFinite(clientX) && Number.isFinite(clientY)) {
      return { x: clientX - rect.left, y: clientY - rect.top }
    }
    return {
      x: Number.isFinite(touch.x) ? touch.x : 0,
      y: Number.isFinite(touch.y) ? touch.y : 0
    }
  },

  getTouches(event) {
    return (event.touches || []).map((touch) => this.getTouchPoint(touch))
  },

  createDragGesture(point) {
    return {
      type: 'drag',
      startPoint: point,
      startX: this.transform.x,
      startY: this.transform.y
    }
  },

  createPinchGesture(first, second) {
    const midpoint = midpointBetween(first, second)
    return {
      type: 'pinch',
      startDistance: Math.max(distanceBetween(first, second), 1),
      startMidpoint: midpoint,
      startScale: this.transform.scale,
      anchorX: (midpoint.x - this.transform.x) / this.transform.scale,
      anchorY: (midpoint.y - this.transform.y) / this.transform.scale
    }
  },

  onTouchStart(event) {
    if (!this.data.imageReady || this.data.processing) return
    const touches = this.getTouches(event)
    if (touches.length >= 2) this.gesture = this.createPinchGesture(touches[0], touches[1])
    else if (touches.length === 1) this.gesture = this.createDragGesture(touches[0])
  },

  onTouchMove(event) {
    if (!this.gesture || !this.transform || this.data.processing) return
    const touches = this.getTouches(event)
    if (touches.length >= 2) {
      if (this.gesture.type !== 'pinch') this.gesture = this.createPinchGesture(touches[0], touches[1])
      const midpoint = midpointBetween(touches[0], touches[1])
      const bounds = this.getScaleBounds()
      const scale = clamp(
        this.gesture.startScale * distanceBetween(touches[0], touches[1]) / this.gesture.startDistance,
        bounds.min,
        bounds.max
      )
      this.transform = this.clampTransform({
        scale,
        x: midpoint.x - this.gesture.anchorX * scale,
        y: midpoint.y - this.gesture.anchorY * scale
      })
    } else if (touches.length === 1) {
      if (this.gesture.type !== 'drag') this.gesture = this.createDragGesture(touches[0])
      const point = touches[0]
      this.transform = this.clampTransform({
        scale: this.transform.scale,
        x: this.gesture.startX + point.x - this.gesture.startPoint.x,
        y: this.gesture.startY + point.y - this.gesture.startPoint.y
      })
    }
    this.syncScalePercent()
    this.drawCanvas()
  },

  onTouchEnd() {
    this.gesture = null
  },

  onScaleChange(event) {
    if (!this.transform || this.data.processing) return
    const percent = clamp(Number(event.detail.value) || MIN_SCALE_PERCENT, MIN_SCALE_PERCENT, MAX_SCALE_PERCENT)
    const nextScale = this.getScaleBounds().min * percent / 100
    const size = this.data.canvasSize
    const center = size / 2
    const imagePointX = (center - this.transform.x) / this.transform.scale
    const imagePointY = (center - this.transform.y) / this.transform.scale
    this.transform = this.clampTransform({
      scale: nextScale,
      x: center - imagePointX * nextScale,
      y: center - imagePointY * nextScale
    })
    this.setData({ scalePercent: percent })
    this.drawCanvas()
  },

  onConfirm() {
    if (!this.data.imageReady || this.data.processing || !this.openerEventChannel) return
    this.setData({ processing: true })
    const size = this.data.canvasSize
    this.drawCanvas(() => {
      wx.canvasToTempFilePath({
        canvasId: 'avatar-editor-canvas',
        x: 0,
        y: 0,
        width: size,
        height: size,
        destWidth: OUTPUT_SIZE,
        destHeight: OUTPUT_SIZE,
        fileType: 'jpg',
        quality: OUTPUT_QUALITY,
        success: ({ tempFilePath }) => {
          if (!tempFilePath) {
            this.handleExportFailure()
            return
          }
          this.openerEventChannel.emit('avatarEdited', { tempFilePath })
          wx.navigateBack({ delta: 1 })
        },
        fail: () => this.handleExportFailure()
      }, this)
    })
  },

  handleExportFailure() {
    this.setData({ processing: false })
    this.drawCanvas()
    wx.showToast({ title: '头像处理失败，请重试', icon: 'none' })
  }
})
