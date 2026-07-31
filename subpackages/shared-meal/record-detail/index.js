const sharedMealRecordService = require('../../../services/sharedMealRecordService')
const { createSharedMealRecordDetailModel } = require('./viewModel')

const detailView = createSharedMealRecordDetailModel

Page({
  data: { record: null, loading: true, errorText: '' },
  async onLoad(options) {
    try {
      const record = await sharedMealRecordService.get(String(options.recordId || ''))
      this.setData({ record: detailView(record), loading: false })
    } catch (error) {
      this.setData({ loading: false, errorText: '这条记录不存在或无权查看。' })
    }
  }
})

module.exports = { detailView }
