const dogService = require('../../../services/dogService')
const weightService = require('../services/weightService')
const { dateTextInShanghai } = require('../../../services/weightContract')
const {
  buildWeightView,
  mergeMeasurements
} = require('./weightTrendModel')

function decode(value) {
  try {
    return decodeURIComponent(String(value || ''))
  } catch (error) {
    return String(value || '')
  }
}

function errorMessage(error) {
  return error && error.message
    ? error.message
    : '体重记录暂时加载失败，请稍后重试'
}

function navigationUrl(path, params = {}) {
  const query = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .map((key) => `${key}=${encodeURIComponent(params[key])}`)
    .join('&')
  return query ? `${path}?${query}` : path
}

function selectedDogIndex(dogs, dogId, fallback = 0) {
  const index = (dogs || []).findIndex((dog) => dog.id === dogId)
  if (index >= 0) return index
  if (!dogs || !dogs.length) return 0
  return Math.max(0, Math.min(Number(fallback) || 0, dogs.length - 1))
}

function emptyDogView() {
  return {
    dogId: '',
    dogName: '狗狗',
    currentWeightText: '未记录',
    currentMeasuredOnText: '还没有狗狗档案',
    currentWeightSourceText: '先添加一只狗狗',
    recordCount: 0,
    recordCountText: '0 次测量',
    hasMeasurements: false,
    latestMeasurementId: '',
    historyItems: [],
    chartPoints: [],
    chartSegments: [],
    chartMinLabel: '',
    chartMaxLabel: '',
    chartStartDateText: '',
    chartEndDateText: ''
  }
}

Page({
  data: {
    dogs: [],
    dogId: '',
    dogIndex: 0,
    dogName: '狗狗',
    measurements: [],
    nextCursor: null,
    loadStatus: 'loading',
    loadingMore: false,
    errorText: '',
    ...emptyDogView()
  },

  onLoad(options = {}) {
    this.requestedDogId = decode(options.dogId)
    if (typeof wx !== 'undefined' && wx.setNavigationBarTitle) {
      wx.setNavigationBarTitle({ title: '体重趋势' })
    }
  },

  async onShow() {
    await this.loadPage()
  },

  async loadPage() {
    if (this.loadingPage) return
    this.loadingPage = true
    this.setData({ loadStatus: 'loading', errorText: '' })

    try {
      const dogs = await dogService.listDogs()
      const requestedDogId = this.requestedDogId || this.data.dogId
      const dogIndex = selectedDogIndex(dogs, requestedDogId, this.data.dogIndex)
      const dog = dogs[dogIndex]
      if (!dog) {
        this.setData({
          dogs,
          dogIndex: 0,
          ...emptyDogView(),
          loadStatus: 'empty',
          errorText: ''
        })
        return
      }

      this.requestedDogId = dog.id
      this.setData({
        dogs,
        dogId: dog.id,
        dogIndex,
        dogName: dog.name || '狗狗'
      })
      await this.loadRecords(dog, { statusAlreadySet: true })
    } catch (error) {
      this.setData({ loadStatus: 'error', errorText: errorMessage(error) })
    } finally {
      this.loadingPage = false
      if (typeof wx !== 'undefined' && wx.stopPullDownRefresh) wx.stopPullDownRefresh()
    }
  },

  async loadRecords(dog, { statusAlreadySet = false } = {}) {
    if (!dog || !dog.id) return
    if (!statusAlreadySet) this.setData({ loadStatus: 'loading', errorText: '' })
    try {
      const result = await weightService.list({ dogId: dog.id, limit: 50 })
      const view = buildWeightView({ dog, measurements: result.items })
      this.setData({
        ...view,
        dogId: dog.id,
        dogName: dog.name || '狗狗',
        measurements: result.items,
        nextCursor: result.nextCursor,
        loadStatus: 'ready',
        errorText: ''
      })
    } catch (error) {
      this.setData({ loadStatus: 'error', errorText: errorMessage(error) })
    }
  },

  async onDogChange(event) {
    const index = Number(event && event.detail && event.detail.value)
    if (!Number.isInteger(index) || !this.data.dogs[index]) return
    const dog = this.data.dogs[index]
    this.requestedDogId = dog.id
    this.setData({ dogIndex: index, dogId: dog.id, dogName: dog.name || '狗狗' })
    await this.loadRecords(dog)
  },

  async onRetry() {
    await this.loadPage()
  },

  async onPullDownRefresh() {
    await this.loadPage()
  },

  async onLoadMore() {
    if (this.data.loadingMore || !this.data.nextCursor || !this.data.dogId) return
    this.setData({ loadingMore: true })
    try {
      const result = await weightService.list({
        dogId: this.data.dogId,
        cursor: this.data.nextCursor,
        limit: 50
      })
      const measurements = mergeMeasurements(this.data.measurements, result.items)
      const dog = this.data.dogs[this.data.dogIndex]
      this.setData({
        ...buildWeightView({ dog, measurements }),
        measurements,
        nextCursor: result.nextCursor,
        loadingMore: false
      })
    } catch (error) {
      this.setData({ loadingMore: false, errorText: errorMessage(error) })
      if (typeof wx !== 'undefined' && wx.showToast) {
        wx.showToast({ title: errorMessage(error), icon: 'none' })
      }
    }
  },

  onAddWeight() {
    if (!this.data.dogId) return this.onAddDog()
    wx.navigateTo({
      url: navigationUrl('/subpackages/dog-profile/weight-edit/index', {
        dogId: this.data.dogId
      })
    })
  },

  onEditWeight(event) {
    const recordId = event && event.currentTarget && event.currentTarget.dataset.id
    if (!recordId || !this.data.dogId) return
    wx.navigateTo({
      url: navigationUrl('/subpackages/dog-profile/weight-edit/index', {
        dogId: this.data.dogId,
        id: recordId
      })
    })
  },

  onAddDog() {
    wx.navigateTo({ url: '/subpackages/dog-profile/dog-edit/index' })
  }
})

module.exports = {
  decode,
  navigationUrl,
  selectedDogIndex,
  emptyDogView,
  errorMessage,
  dateTextInShanghai
}
