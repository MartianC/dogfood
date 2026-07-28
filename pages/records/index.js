const sharedMealRecordService = require('../../services/sharedMealRecordService')

function recordView(record) {
  const date = new Date(record.mealTime)
  const menus = (record.humanMenu || []).map((item) => item.title).filter(Boolean)
  const energy = record.assessment && record.assessment.energy
  return {
    ...record,
    mealTimeText: Number.isNaN(date.getTime())
      ? String(record.mealTime || '')
      : `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
    dogName: record.dogSnapshot && record.dogSnapshot.name || '狗狗',
    menuText: menus.join('、') || '未命名人饭菜单',
    ingredientCount: (record.dogMealItems || []).length,
    assessmentText: energy && energy.statusLabel || '本餐评估已保存'
  }
}

Page({
  data: { records: [], loading: true, errorText: '' },

  async onShow() {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null
    if (tabBar) tabBar.setData({ selected: 'records' })
    this.setData({ loading: true, errorText: '' })
    try {
      const result = await sharedMealRecordService.list({ limit: 20 })
      this.setData({ records: (result.items || []).map(recordView), loading: false })
    } catch (error) {
      this.setData({ records: [], loading: false, errorText: '记录暂时加载失败，请稍后重试。' })
    }
  },

  onOpenRecord(event) {
    wx.navigateTo({
      url: `/subpackages/shared-meal/record-detail/index?recordId=${encodeURIComponent(event.currentTarget.dataset.id)}`
    })
  },

  onCreateMeal() {
    wx.navigateTo({ url: '/subpackages/shared-meal/dog-select/index' })
  }
})

module.exports = { recordView }
