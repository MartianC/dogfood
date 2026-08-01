const dogService = require('../../services/dogService')
const authService = require('../../services/authService')
const sharedMealRecordService = require('../../services/sharedMealRecordService')
const sharedMealEntryService = require('../../services/sharedMealEntryService')
const { MAIN_TABS } = require('../../services/navigationMigrationService')

function todayText(now = new Date()) {
  return `${now.getMonth() + 1}月${now.getDate()}日 · 今天也一起好好吃饭`
}

function latestRecordView(record) {
  if (!record) return null
  const menuText = (record.humanMenu || []).map((item) => item.title).filter(Boolean).join('、')
  return {
    ...record,
    dogName: record.dogSnapshot && record.dogSnapshot.name || '狗狗',
    menuText: menuText || '这一顿',
    ingredientCount: (record.dogMealItems || []).length
  }
}

Page({
  data: {
    authState: 'guest',
    dogs: [],
    todayText: todayText(),
    latestRecord: null
  },

  async onShow() {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null
    if (tabBar) tabBar.setData({ selected: 'home' })
    const app = getApp()
    if (app.globalData.authReady) await app.globalData.authReady
    const authStateBeforeLoad = authService.getAuthState()
    const dogs = authStateBeforeLoad === 'guest' ? [] : await dogService.listDogs()
    let latestRecord = null
    if (authService.getAuthState() !== 'guest') {
      try {
        const result = await sharedMealRecordService.list({ limit: 1 })
        latestRecord = latestRecordView(result.items && result.items[0])
      } catch (error) {
        latestRecord = null
      }
    }
    this.setData({
      authState: authService.getAuthState(),
      dogs,
      todayText: todayText(),
      latestRecord
    })
  },

  onCreateMeal() {
    return sharedMealEntryService.startSharedMeal()
  },

  onOpenLatestRecord() {
    if (!this.data.latestRecord) return
    wx.navigateTo({
      url: `/subpackages/shared-meal/record-detail/index?recordId=${encodeURIComponent(this.data.latestRecord.id)}`
    })
  },

  onOpenRecords() {
    const recordsTab = MAIN_TABS.find((item) => item.value === 'records')
    wx.switchTab({ url: `/${recordsTab.pagePath}` })
  }
})

module.exports = { todayText, latestRecordView }
