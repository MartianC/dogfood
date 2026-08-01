const dogService = require('../../services/dogService')
const authService = require('../../services/authService')
const sharedMealRecordService = require('../../services/sharedMealRecordService')
const sharedMealEntryService = require('../../services/sharedMealEntryService')
const homeDraftSummaryService = require('../../services/homeDraftSummaryService')
const {
  HOME_STATUS,
  PRIMARY_TASK_TYPE,
  buildHomeState,
  recordView,
  shanghaiDateKey
} = require('../../services/homeStateModel')
const { MAIN_TABS } = require('../../services/navigationMigrationService')

function todayText(now = new Date()) {
  const dateKey = shanghaiDateKey(now)
  if (!dateKey) return '今天 · 今天也一起好好吃饭'
  const [, month, day] = dateKey.split('-')
  return `${Number(month)}月${Number(day)}日 · 今天也一起好好吃饭`
}

function latestRecordView(record) {
  return recordView(record)
}

function initialHomeState() {
  return buildHomeState({ authState: 'guest' })
}

function recordsForToday(records, now) {
  const todayKey = shanghaiDateKey(now)
  return Array.isArray(records)
    ? records.filter((record) => shanghaiDateKey(record && record.mealTime) === todayKey)
    : []
}

function currentNow(page) {
  return typeof page.now === 'function' ? page.now() : new Date()
}

Page({
  data: {
    authState: 'guest',
    dogs: [],
    todayText: todayText(),
    latestRecord: null,
    homeState: initialHomeState()
  },

  async onShow() {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null
    if (tabBar) tabBar.setData({ selected: 'home' })
    const app = getApp()
    if (app.globalData.authReady) await app.globalData.authReady

    const requestToken = (this._homeLoadToken || 0) + 1
    this._homeLoadToken = requestToken
    const now = currentNow(this)
    const authStateBeforeLoad = authService.getAuthState()

    if (authStateBeforeLoad === HOME_STATUS.GUEST) {
      const homeState = buildHomeState({ authState: 'guest', now })
      this.setData({
        authState: 'guest',
        dogs: [],
        todayText: todayText(now),
        latestRecord: null,
        homeState
      })
      return homeState
    }

    let dogs = []
    let records = []
    const errors = {}

    try {
      dogs = await dogService.listDogs()
    } catch (error) {
      errors.profile = error
    }

    try {
      const result = await sharedMealRecordService.list({ limit: 20 })
      records = Array.isArray(result && result.items) ? result.items : []
    } catch (error) {
      errors.records = error
    }

    const draft = homeDraftSummaryService.getDraftSummary()
    const homeState = buildHomeState({
      authState: authService.getAuthState(),
      dogs,
      draft,
      todayRecords: recordsForToday(records, now),
      recentRecords: records,
      errors,
      now
    })

    if (requestToken !== this._homeLoadToken) return homeState
    this.setData({
      authState: homeState.authState,
      dogs,
      todayText: todayText(now),
      latestRecord: homeState.recentRecord,
      homeState
    })
    return homeState
  },

  onPrimaryTask() {
    const task = this.data.homeState && this.data.homeState.primaryTask
    if (task && task.type === PRIMARY_TASK_TYPE.VIEW_TODAY_RECORDS) {
      return this.onOpenRecords()
    }
    return this.onCreateMeal()
  },

  onCreateMeal() {
    return sharedMealEntryService.startSharedMeal()
  },

  onOpenLatestRecord() {
    const record = this.data.homeState && this.data.homeState.recentRecord
    if (!record || !record.id) return
    wx.navigateTo({
      url: `/subpackages/shared-meal/record-detail/index?recordId=${encodeURIComponent(record.id)}`
    })
  },

  onOpenRecords() {
    const recordsTab = MAIN_TABS.find((item) => item.value === 'records')
    if (!recordsTab) return
    wx.switchTab({ url: `/${recordsTab.pagePath}` })
  },

  onOpenProfileIssue(event) {
    const dogId = event && event.currentTarget && event.currentTarget.dataset.dogId
    if (!dogId) return
    wx.navigateTo({
      url: `/subpackages/dog-profile/dog-edit/index?id=${encodeURIComponent(dogId)}`
    })
  },

  onRetryHome() {
    return this.onShow()
  }
})

module.exports = {
  todayText,
  latestRecordView,
  recordsForToday
}
