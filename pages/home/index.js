const dogService = require('../../services/dogService')
const authService = require('../../services/authService')
const sharedMealRecordService = require('../../services/sharedMealRecordService')
const sharedMealEntryService = require('../../services/sharedMealEntryService')
const homeDraftSummaryService = require('../../services/homeDraftSummaryService')
const homeItemService = require('../../services/homeItemService')
const dataInvalidationService = require('../../services/dataInvalidationService')
const { createHomeStartupTiming } = require('../../services/homeStartupTiming')
const {
  HOME_STATUS,
  HOME_LOAD_STATUS,
  buildHomeState,
  recordView,
  shanghaiDateKey
} = require('../../services/homeStateModel')
const { MAIN_TABS } = require('../../services/navigationMigrationService')

// 记录首页创建时间，后续批次在认证、外壳和数据就绪时补齐其余时间点。
const homeStartupTiming = createHomeStartupTiming()
homeStartupTiming.mark('page-created')
const HOME_DATA_SCOPES = dataInvalidationService.ALL_SCOPES

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
  // 认证未决期间不使用 guest 状态，避免首帧闪现游客文案或触发游客分支。
  return buildHomeState({
    authState: 'unknown',
    loadStatus: HOME_LOAD_STATUS.INITIALIZING
  })
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

function homeRefreshErrorText(errors) {
  if (errors && errors.homeItems && !errors.records && !errors.profile) {
    return '护理安排暂时无法更新，仍显示上次内容。'
  }
  return '首页数据暂时无法更新，仍显示上次内容。'
}

function shouldRefreshHome(page, { authState, now, force = false }) {
  if (force || !page._homeLoadedSnapshot) return true
  if (page._homeLoadedSnapshot.authState !== authState) return true
  if (page._homeLoadedSnapshot.dateKey !== shanghaiDateKey(now)) return true
  return dataInvalidationService.hasChanged(
    page._homeLoadedSnapshot.revision,
    HOME_DATA_SCOPES
  )
}

/**
 * 根据认证完成时已经可用的全局快照构建首页外壳。
 *
 * 外壳只负责首屏主任务和本地草稿，不读取远端记录或事项，避免网络请求
 * 阻塞已登录用户看到可操作的首页。远端结果随后会通过完整状态覆盖它。
 */
function buildHomeShell({ authState, dogs, draft, now }) {
  return buildHomeState({
    authState,
    dogs,
    draft,
    loadStatus: HOME_LOAD_STATUS.PARTIAL,
    now
  })
}

async function loadHomeData(page, { requestToken, authStateBeforeLoad, now, preserveSnapshot }) {
  const cachedDogs = Array.isArray(getApp().globalData.dogs) ? getApp().globalData.dogs : []
  const draft = homeDraftSummaryService.getDraftSummary()
  if (!preserveSnapshot) {
    const shellState = buildHomeShell({
      authState: authStateBeforeLoad,
      dogs: cachedDogs,
      draft,
      now
    })
    if (requestToken !== page._homeLoadToken) return shellState
    page.setData({
      authState: shellState.authState,
      dogs: cachedDogs,
      todayText: todayText(now),
      latestRecord: null,
      homeState: shellState,
      homeRefreshing: false,
      homeRefreshError: ''
    })
    homeStartupTiming.mark('shell-ready')
  } else {
    page.setData({
      todayText: todayText(now),
      homeRefreshing: true,
      homeRefreshError: ''
    })
  }

  let dogs = cachedDogs
  let records = []
  let homeItems = []
  const errors = {}

  // 狗狗档案和本餐记录互不依赖，必须并行读取；用 Promise.resolve 包裹
  // 调用也能把服务实现中的同步异常纳入 allSettled 的分项错误。
  const [dogsResult, recordsResult] = await Promise.allSettled([
    Promise.resolve().then(() => dogService.listDogs()),
    Promise.resolve().then(() => sharedMealRecordService.list({ limit: 20 }))
  ])

  if (dogsResult.status === 'fulfilled') {
    dogs = Array.isArray(dogsResult.value) ? dogsResult.value : []
  } else {
    errors.profile = dogsResult.reason
  }

  if (recordsResult.status === 'fulfilled') {
    const result = recordsResult.value
    records = Array.isArray(result && result.items) ? result.items : []
  } else {
    errors.records = recordsResult.reason
  }

  if (dogs.length) {
    try {
      homeItems = await homeItemService.listForDogs(dogs, { now })
    } catch (error) {
      errors.homeItems = error
    }
  }

  const homeState = buildHomeState({
    authState: authService.getAuthState(),
    dogs,
    draft,
    todayRecords: recordsForToday(records, now),
    recentRecords: records,
    homeItems,
    errors,
    now
  })

  if (requestToken !== page._homeLoadToken) return homeState
  const revision = dataInvalidationService.getSnapshot()
  if (preserveSnapshot && Object.keys(errors).length) {
    page._homeLoadedSnapshot = {
      authState: page.data.homeState.authState,
      dateKey: shanghaiDateKey(now),
      revision
    }
    page.setData({
      homeRefreshing: false,
      homeRefreshError: homeRefreshErrorText(errors)
    })
    return page.data.homeState
  }

  page.setData({
    authState: homeState.authState,
    dogs,
    todayText: todayText(now),
    latestRecord: homeState.recentRecord,
    homeState,
    homeRefreshing: false,
    homeRefreshError: ''
  })
  page._homeLoadedSnapshot = {
    authState: homeState.authState,
    dateKey: shanghaiDateKey(now),
    revision
  }
  homeStartupTiming.mark('home-ready')
  return homeState
}

Page({
  data: {
    authState: 'unknown',
    dogs: [],
    todayText: todayText(),
    latestRecord: null,
    homeState: initialHomeState(),
    homeRefreshing: false,
    homeRefreshError: ''
  },

  async onShow() {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null
    if (tabBar) tabBar.setData({ selected: 'home' })
    const app = getApp()
    if (app.globalData.authReady) await app.globalData.authReady

    // 认证完成即刻记录时间点，并消费 app.js 已注入的认证/狗狗缓存。
    homeStartupTiming.mark('auth-ready')

    const now = currentNow(this)
    const authStateBeforeLoad = app.globalData.authState || authService.getAuthState()

    if (authStateBeforeLoad === HOME_STATUS.GUEST) {
      this._homeLoadToken = (this._homeLoadToken || 0) + 1
      const homeState = buildHomeState({ authState: 'guest', now })
      this._homeLoadedSnapshot = {
        authState: homeState.authState,
        dateKey: shanghaiDateKey(now),
        revision: dataInvalidationService.getSnapshot()
      }
      this.setData({
        authState: 'guest',
        dogs: [],
        todayText: todayText(now),
        latestRecord: null,
        homeState,
        homeRefreshing: false,
        homeRefreshError: ''
      })
      return homeState
    }

    const forceRefresh = Boolean(this._homeForceRefresh)
    this._homeForceRefresh = false
    if (!shouldRefreshHome(this, { authState: authStateBeforeLoad, now, force: forceRefresh })) {
      return this.data.homeState
    }
    const requestToken = (this._homeLoadToken || 0) + 1
    this._homeLoadToken = requestToken
    const preserveSnapshot = Boolean(
      this._homeLoadedSnapshot && this._homeLoadedSnapshot.authState !== HOME_STATUS.GUEST
    )
    return loadHomeData(this, {
      requestToken,
      authStateBeforeLoad,
      now,
      preserveSnapshot
    })
  },

  onPrimaryTask() {
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
    const dataset = event && event.currentTarget && event.currentTarget.dataset
    const dogId = dataset && dataset.dogId
    if (!dogId) return

    const action = dataset.action || 'edit-dog'
    const path = action === 'open-weight'
      ? '/subpackages/dog-profile/weight/index'
      : action === 'open-care'
        ? '/subpackages/dog-profile/care-record/index'
        : '/subpackages/dog-profile/dog-edit/index'
    const url = action === 'edit-dog'
      ? `${path}?id=${encodeURIComponent(dogId)}`
      : `${path}?dogId=${encodeURIComponent(dogId)}`
    wx.navigateTo({
      url
    })
  },

  onRetryHome() {
    this._homeForceRefresh = true
    return this.onShow()
  }
})

module.exports = {
  todayText,
  latestRecordView,
  recordsForToday,
  buildHomeShell
}
