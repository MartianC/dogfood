const sharedMealRecordService = require('../../../services/sharedMealRecordService')

function detailView(record) {
  const mealTime = new Date(record.mealTime)
  return {
    ...record,
    mealTimeText: Number.isNaN(mealTime.getTime()) ? record.mealTime : mealTime.toLocaleString('zh-CN'),
    dogName: record.dogSnapshot && record.dogSnapshot.name || '狗狗',
    humanMenu: record.humanMenu || [],
    dogMealItems: record.dogMealItems || [],
    energyText: record.assessment && record.assessment.energy && record.assessment.energy.statusLabel || '数据不足',
    coverageText: record.assessment && record.assessment.dataCoverage && record.assessment.dataCoverage.energyComplete
      ? '能量数据可计算'
      : '部分关键数据缺失',
    versionsText: Object.entries(record.versions || {}).filter(([, value]) => typeof value === 'string').map(([key, value]) => `${key}: ${value}`).join(' · ')
  }
}

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
