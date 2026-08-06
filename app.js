const authService = require('./services/authService')
const mealPlanService = require('./services/mealPlanService')
const env = require('./config/env')
const recipes = require('./data/recipes')

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

function shanghaiTodayKey(now = new Date()) {
  const timestamp = new Date(now).getTime()
  if (!Number.isFinite(timestamp)) return ''
  const date = new Date(timestamp + SHANGHAI_OFFSET_MS)
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0')
  ].join('-')
}

App({
  globalData: {
    authState: 'guest',
    userInfo: null,
    dogs: [],
    recipes,
    recipeVersion: 'bundled-v1',
    authReady: null,
    recordTimelineState: null,
    recordTimelinePrefetch: null,
    redirectFrom: null,
    latestPlan: null
  },

  onLaunch() {
    if (env.useCloudBase && typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.init === 'function') {
      wx.cloud.init({ env: env.cloudEnvId })
    }
    this.globalData.authReady = this.initApp()
  },

  async initApp() {
    const auth = await authService.initAuth()
    this.globalData.authState = auth.authState
    this.globalData.userInfo = auth.user
    this.globalData.dogs = auth.dogs || []
    this.startRecordTimelinePrefetch(auth)
    mealPlanService.syncPendingPlans().catch(() => {})
    return auth
  },

  startRecordTimelinePrefetch(auth) {
    if (!auth || auth.authState === 'guest') return null
    const todayKey = shanghaiTodayKey()
    if (!todayKey) return null
    const timelineService = require('./services/unifiedRecordTimelineService')
    const state = timelineService.createUnifiedRecordTimelineState()
    this.globalData.recordTimelineState = state
    this.globalData.recordTimelinePrefetch = state.load(todayKey.slice(0, 7), {
      selectedDateKey: todayKey
    }).catch(() => null)
    return this.globalData.recordTimelinePrefetch
  },

  async refreshAuthState() {
    const auth = await authService.initAuth()
    this.globalData.authState = auth.authState
    this.globalData.userInfo = auth.user
    this.globalData.dogs = auth.dogs || []
    this.startRecordTimelinePrefetch(auth)
    return auth
  },

  setLatestPlan(plan) {
    this.globalData.latestPlan = plan
  }
})
