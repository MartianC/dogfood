const dogService = require('../../../services/dogService')
const careRecordService = require('../services/careRecordService')
const {
  CARE_RECORD_FILTER_OPTIONS,
  createEmptyCareRecordForm,
  formFromCareRecord,
  optionIndex,
  toCareRecordWritePayload
} = require('../services/careRecordPageModel')

const typeOptions = CARE_RECORD_FILTER_OPTIONS.slice(1)

function decodeQuery(value) {
  try {
    return decodeURIComponent(String(value || '')).trim()
  } catch (error) {
    return String(value || '').trim()
  }
}

function errorMessage(error, fallback = '护理记录暂时无法保存') {
  return String(error && error.message || fallback)
}

function fieldErrors(message) {
  const text = String(message || '')
  return {
    occurredOnError: /护理发生日期/.test(text) && !/下次护理日期/.test(text) ? text : '',
    nextDateError: /下次护理日期/.test(text) ? text : '',
    formError: /发生日期|下次护理日期/.test(text) ? '' : text
  }
}

function showError(error, fallback) {
  if (typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
    wx.showToast({ title: errorMessage(error, fallback), icon: 'none' })
  }
}

Page({
  data: {
    id: '',
    dogs: [],
    dogIndex: 0,
    dogId: '',
    dogName: '',
    typeOptions,
    typeIndex: 0,
    form: createEmptyCareRecordForm(),
    today: createEmptyCareRecordForm().occurredOn,
    loading: true,
    saving: false,
    deleting: false,
    loadError: '',
    formError: '',
    occurredOnError: '',
    nextDateError: ''
  },

  onLoad(options = {}) {
    const id = decodeQuery(options.id)
    const dogId = decodeQuery(options.dogId)
    this.setData({ id, dogId })
    if (typeof wx !== 'undefined' && typeof wx.setNavigationBarTitle === 'function') {
      wx.setNavigationBarTitle({ title: id ? '编辑护理记录' : '添加护理记录' })
    }
    return this.loadContext()
  },

  async loadContext() {
    this.setData({ loading: true, loadError: '', formError: '' })
    try {
      const dogs = await dogService.listDogs()
      if (!dogs.length) throw Object.assign(new Error('请先添加狗狗档案'), { code: 'NO_DOG' })

      const dogIndex = optionIndex(dogs, this.data.dogId, 0, 'id')
      const dog = dogs[dogIndex]
      this.setData({
        dogs,
        dogIndex,
        dogId: dog.id,
        dogName: dog.name || '这只狗狗'
      })

      if (this.data.id) {
        await this.loadRecord()
        return
      }

      this.setData({
        form: createEmptyCareRecordForm({ dogId: dog.id }),
        typeIndex: 0,
        loading: false
      })
    } catch (error) {
      this.setData({ loading: false, loadError: errorMessage(error, '护理记录暂时无法加载') })
    }
  },

  async loadRecord() {
    const record = await careRecordService.get(this.data.id)
    const dogIndex = optionIndex(this.data.dogs, record.dogId, this.data.dogIndex, 'id')
    const dog = this.data.dogs[dogIndex]
    if (!dog) throw new Error('未找到护理记录对应的狗狗档案')
    const form = formFromCareRecord(record)
    this.setData({
      dogIndex,
      dogId: record.dogId,
      dogName: dog.name || '这只狗狗',
      form,
      typeIndex: optionIndex(typeOptions, form.type),
      loading: false
    })
  },

  onDogChange(event) {
    if (this.data.id) return
    const dogIndex = Number(event.detail.value)
    const dog = this.data.dogs[dogIndex]
    if (!dog) return
    this.setData({
      dogIndex,
      dogId: dog.id,
      dogName: dog.name || '这只狗狗',
      'form.dogId': dog.id,
      formError: ''
    })
  },

  onTypeChange(event) {
    const typeIndex = Number(event.detail.value)
    const option = typeOptions[typeIndex]
    if (!option) return
    this.setData({ typeIndex, 'form.type': option.value, formError: '' })
  },

  onTextInput(event) {
    const key = String(event.currentTarget.dataset.key || '')
    if (!['name', 'notes'].includes(key)) return
    this.setData({ [`form.${key}`]: event.detail.value, formError: '' })
  },

  onOccurredDate(event) {
    this.setData({
      'form.occurredOn': event.detail.value,
      occurredOnError: '',
      nextDateError: '',
      formError: ''
    })
  },

  onNextDate(event) {
    this.setData({ 'form.nextDate': event.detail.value, nextDateError: '', formError: '' })
  },

  async onSave() {
    if (this.data.saving) return
    this.setData({
      saving: true,
      formError: '',
      occurredOnError: '',
      nextDateError: ''
    })
    try {
      const payload = toCareRecordWritePayload(this.data.form)
      if (this.data.id) await careRecordService.update(this.data.id, payload)
      else await careRecordService.create(payload)
      wx.showToast({ title: '已保存', icon: 'success' })
      wx.navigateBack()
    } catch (error) {
      const errors = fieldErrors(errorMessage(error))
      this.setData(errors)
      if (!errors.formError && typeof wx !== 'undefined' && typeof wx.showToast === 'function') {
        showError(error, '护理记录保存失败')
      }
    } finally {
      this.setData({ saving: false })
    }
  },

  onCancel() {
    wx.navigateBack()
  },

  onDelete() {
    if (!this.data.id || this.data.deleting) return
    wx.showModal({
      title: '删除护理记录',
      content: '删除后无法恢复，也不会影响体重或本餐记录。',
      success: async (result) => {
        if (!result.confirm) return
        this.setData({ deleting: true, formError: '' })
        try {
          await careRecordService.delete(this.data.id)
          wx.showToast({ title: '已删除', icon: 'success' })
          wx.navigateBack()
        } catch (error) {
          this.setData({ formError: errorMessage(error, '护理记录删除失败') })
        } finally {
          this.setData({ deleting: false })
        }
      }
    })
  },

  onRetry() {
    return this.loadContext()
  }
})
