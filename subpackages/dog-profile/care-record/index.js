const dogService = require('../../../services/dogService')
const careRecordService = require('../services/careRecordService')
const {
  CARE_RECORD_FILTER_OPTIONS,
  decorateCareRecords,
  optionIndex
} = require('../services/careRecordPageModel')

function decodeQuery(value) {
  try {
    return decodeURIComponent(String(value || '')).trim()
  } catch (error) {
    return String(value || '').trim()
  }
}

function errorCode(error, fallback = 'UNKNOWN') {
  return String(error && error.code || fallback)
}

function errorMessage(error, fallback = '护理记录暂时无法加载') {
  return String(error && error.message || fallback)
}

function showError(error, fallback) {
  if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
    wx.showToast({ title: errorMessage(error, fallback), icon: 'none' })
  }
}

function dogEditUrl() {
  return '/subpackages/dog-profile/dog-edit/index'
}

Page({
  data: {
    requestedDogId: '',
    dogs: [],
    dogIndex: 0,
    dogId: '',
    dogName: '',
    filterOptions: CARE_RECORD_FILTER_OPTIONS,
    selectedType: '',
    records: [],
    nextCursor: null,
    loading: true,
    loadingMore: false,
    contextLoaded: false,
    errorCode: '',
    errorMessage: '',
    deletingId: ''
  },

  onLoad(options = {}) {
    this.setData({ requestedDogId: decodeQuery(options.dogId) })
    return this.ensureContext()
  },

  onShow() {
    if (this.data.contextLoaded) return this.reloadRecords()
    return this.ensureContext()
  },

  ensureContext() {
    if (!this._contextPromise) {
      this._contextPromise = this.loadContext()
        .finally(() => { this._contextPromise = null })
    }
    return this._contextPromise
  },

  async loadContext() {
    this.setData({ loading: true, errorCode: '', errorMessage: '' })
    try {
      const dogs = await dogService.listDogs()
      if (!dogs.length) {
        this.setData({
          dogs: [],
          contextLoaded: true,
          loading: false,
          errorCode: 'NO_DOG',
          errorMessage: '请先添加爱宠档案'
        })
        return
      }

      const dogIndex = optionIndex(dogs, this.data.requestedDogId, 0, 'id')
      const dog = dogs[dogIndex]
      this.setData({
        dogs,
        dogIndex,
        dogId: dog.id,
        dogName: dog.name || '这只爱宠',
        contextLoaded: true
      })
      await this.reloadRecords()
    } catch (error) {
      this.setData({
        contextLoaded: true,
        loading: false,
        errorCode: errorCode(error),
        errorMessage: errorMessage(error)
      })
    }
  },

  async reloadRecords({ selectedType = this.data.selectedType } = {}) {
    if (!this.data.dogId) return
    const requestId = (this._requestId || 0) + 1
    this._requestId = requestId
    this.setData({
      selectedType,
      records: [],
      nextCursor: null,
      loading: true,
      loadingMore: false,
      errorCode: '',
      errorMessage: ''
    })

    try {
      const result = await careRecordService.list({
        dogId: this.data.dogId,
        type: selectedType || null,
        limit: 20
      })
      if (requestId !== this._requestId) return
      this.setData({
        records: decorateCareRecords(result.items),
        nextCursor: result.nextCursor || null,
        loading: false
      })
    } catch (error) {
      if (requestId !== this._requestId) return
      this.setData({
        loading: false,
        errorCode: errorCode(error),
        errorMessage: errorMessage(error)
      })
    }
  },

  async loadMore() {
    if (this.data.loadingMore || !this.data.nextCursor || !this.data.dogId) return
    const requestId = this._requestId
    const cursor = this.data.nextCursor
    this.setData({ loadingMore: true })
    try {
      const result = await careRecordService.list({
        dogId: this.data.dogId,
        type: this.data.selectedType || null,
        limit: 20,
        cursor
      })
      if (requestId !== this._requestId) return
      this.setData({
        records: this.data.records.concat(decorateCareRecords(result.items)),
        nextCursor: result.nextCursor || null,
        loadingMore: false
      })
    } catch (error) {
      if (requestId !== this._requestId) return
      this.setData({ loadingMore: false })
      showError(error, '护理记录加载失败')
    }
  },

  onPullDownRefresh() {
    return this.reloadRecords().finally(() => {
      if (typeof wx !== 'undefined' && typeof wx.stopPullDownRefresh === 'function') {
        wx.stopPullDownRefresh()
      }
    })
  },

  onDogChange(event) {
    const dogIndex = Number(event.detail.value)
    const dog = this.data.dogs[dogIndex]
    if (!dog) return
    this.setData({ dogIndex, dogId: dog.id, dogName: dog.name || '这只爱宠' })
    return this.reloadRecords({ selectedType: '' })
  },

  onFilter(event) {
    const selectedType = String(event.currentTarget.dataset.value || '')
    if (selectedType === this.data.selectedType) return
    return this.reloadRecords({ selectedType })
  },

  onAdd() {
    if (!this.data.dogId) return this.onAddDog()
    wx.navigateTo({
      url: `/subpackages/dog-profile/care-edit/index?dogId=${encodeURIComponent(this.data.dogId)}`
    })
  },

  onAddDog() {
    wx.navigateTo({ url: dogEditUrl() })
  },

  onEdit(event) {
    const id = String(event.currentTarget.dataset.id || '')
    if (!id) return
    wx.navigateTo({
      url: `/subpackages/dog-profile/care-edit/index?id=${encodeURIComponent(id)}&dogId=${encodeURIComponent(this.data.dogId)}`
    })
  },

  onDelete(event) {
    const id = String(event.currentTarget.dataset.id || '')
    if (!id || this.data.deletingId) return
    wx.showModal({
      title: '删除护理记录',
      content: '删除后无法恢复，也不会影响体重或本餐记录。',
      success: async (result) => {
        if (!result.confirm) return
        this.setData({ deletingId: id })
        try {
          await careRecordService.delete(id)
          wx.showToast({ title: '已删除', icon: 'success' })
          await this.reloadRecords()
        } catch (error) {
          showError(error, '护理记录删除失败')
        } finally {
          this.setData({ deletingId: '' })
        }
      }
    })
  },

  onRetry() {
    if (this.data.errorCode === 'NO_DOG') return this.onAddDog()
    return this.reloadRecords()
  }
})
