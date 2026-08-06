const dogService = require('../../../services/dogService')
const weightService = require('../services/weightService')
const {
  formFromMeasurement,
  formErrorState,
  todayText,
  validateForm
} = require('./weightFormModel')

function decode(value) {
  try {
    return decodeURIComponent(String(value || ''))
  } catch (error) {
    return String(value || '')
  }
}

function errorMessage(error) {
  return error && error.message ? error.message : '体重记录暂时不可用，请稍后重试'
}

function selectedDog(dogs, dogId) {
  return (dogs || []).find((dog) => dog.id === dogId) || null
}

Page({
  data: {
    id: '',
    dogId: '',
    dogName: '狗狗',
    mode: 'create',
    modeTitle: '记录体重',
    today: todayText(),
    form: {
      weightKg: '',
      measuredOn: todayText()
    },
    weightKgError: '',
    measuredOnError: '',
    formError: '',
    loadStatus: 'loading',
    errorText: '',
    saving: false,
    deleting: false
  },

  onLoad(options = {}) {
    const id = decode(options.id)
    const dogId = decode(options.dogId)
    const mode = id ? 'edit' : 'create'
    const modeTitle = id ? '编辑体重' : '记录体重'
    this.requestedId = id
    this.requestedDogId = dogId
    this.setData({ id, dogId, mode, modeTitle })
    if (typeof wx !== 'undefined' && wx.setNavigationBarTitle) {
      wx.setNavigationBarTitle({ title: modeTitle })
    }
  },

  async onShow() {
    if (this.formLoaded) return
    await this.loadForm()
  },

  async loadForm() {
    this.setData({ loadStatus: 'loading', errorText: '' })
    try {
      const dogs = await dogService.listDogs()
      let dogId = this.requestedDogId || this.data.dogId || dogs[0] && dogs[0].id
      let measurement = null

      if (this.data.id) {
        measurement = await weightService.get(this.data.id)
        dogId = measurement.dogId
      }

      const dog = selectedDog(dogs, dogId)
      if (!dog) throw new Error('找不到目标狗狗档案')

      this.requestedDogId = dog.id
      this.formLoaded = true
      this.setData({
        dogId: dog.id,
        dogName: dog.name || '狗狗',
        form: measurement ? formFromMeasurement(measurement) : {
          weightKg: '',
          measuredOn: this.data.today
        },
        loadStatus: 'ready',
        errorText: '',
        weightKgError: '',
        measuredOnError: '',
        formError: ''
      })
    } catch (error) {
      this.setData({ loadStatus: 'error', errorText: errorMessage(error) })
    }
  },

  async onRetry() {
    this.formLoaded = false
    await this.loadForm()
  },

  setField(event) {
    const key = event && event.currentTarget && event.currentTarget.dataset.key
    if (!key) return
    this.setData({ [`form.${key}`]: event.detail.value })
  },

  onMeasuredOn(event) {
    this.setData({ 'form.measuredOn': event.detail.value, measuredOnError: '', formError: '' })
  },

  clearFormErrors() {
    this.setData({ weightKgError: '', measuredOnError: '', formError: '' })
  },

  async onSave() {
    if (this.data.saving || this.data.deleting || this.data.loadStatus !== 'ready') return
    this.clearFormErrors()
    let payload
    try {
      payload = validateForm({
        dogId: this.data.dogId,
        form: this.data.form,
        today: this.data.today
      })
    } catch (error) {
      this.setData(formErrorState(error.message))
      return
    }

    this.setData({ saving: true })
    try {
      if (this.data.id) await weightService.update(this.data.id, payload)
      else await weightService.create(payload)
      if (typeof wx !== 'undefined' && wx.showToast) {
        wx.showToast({ title: this.data.id ? '体重已更新' : '体重已记录', icon: 'success' })
      }
      if (typeof wx !== 'undefined' && wx.navigateBack) wx.navigateBack()
    } catch (error) {
      this.setData({ formError: errorMessage(error) })
    } finally {
      this.setData({ saving: false })
    }
  },

  onCancel() {
    if (this.data.saving || this.data.deleting) return
    if (typeof wx !== 'undefined' && wx.navigateBack) wx.navigateBack()
  },

  onDelete() {
    if (!this.data.id || this.data.saving || this.data.deleting) return
    if (typeof wx === 'undefined' || !wx.showModal) return
    wx.showModal({
      title: '删除这次测量？',
      content: '如果这是最新测量，当前体重会回退到上一条有效记录；没有上一条时会变为未记录。已保存的本餐记录不受影响。',
      confirmText: '删除',
      cancelText: '保留',
      success: async (result) => {
        if (!result.confirm) return
        this.setData({ deleting: true, formError: '' })
        try {
          await weightService.remove(this.data.id)
          if (wx.showToast) wx.showToast({ title: '已删除', icon: 'success' })
          if (wx.navigateBack) wx.navigateBack()
        } catch (error) {
          this.setData({ formError: errorMessage(error), deleting: false })
        }
      }
    })
  }
})

module.exports = {
  decode,
  errorMessage,
  selectedDog
}
