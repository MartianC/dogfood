const sharedMealRecordService = require('../../../services/sharedMealRecordService')
const { createSharedMealRecordDetailModel } = require('./viewModel')
const { isSharedMealRecordEditableToday } = require('../../../services/sharedMealRecordEditability')
const { createDraftFromRecord, saveDraft } = require('../services/sharedMealDraftService')

const detailView = createSharedMealRecordDetailModel

Page({
  data: {
    record: null,
    rawRecord: null,
    editableToday: false,
    assessmentExpanded: false,
    loading: true,
    errorText: ''
  },
  async onLoad(options) {
    try {
      const record = await sharedMealRecordService.get(String(options.recordId || ''))
      this.setData({
        record: detailView(record),
        rawRecord: record,
        editableToday: isSharedMealRecordEditableToday(record),
        loading: false
      })
    } catch (error) {
      this.setData({ loading: false, errorText: '这条记录不存在或无权查看。' })
    }
  },

  onEdit() {
    const record = this.data.rawRecord
    if (!isSharedMealRecordEditableToday(record)) {
      wx.showToast({ title: '这顿饭已进入历史，只能查看', icon: 'none' })
      this.setData({ editableToday: false })
      return
    }
    try {
      const draft = createDraftFromRecord(record)
      saveDraft(draft)
      wx.navigateTo({
        url: `/subpackages/shared-meal/compose/index?draftId=${encodeURIComponent(draft.id)}`
      })
    } catch (error) {
      wx.showToast({ title: error.message || '暂时无法编辑这顿饭', icon: 'none' })
    }
  },

  onAssessmentToggle(event) {
    this.setData({
      assessmentExpanded: Boolean(event.detail && event.detail.expanded)
    })
  }
})

module.exports = { detailView }
