const sharedMealRecordService = require('../../services/sharedMealRecordService')
const sharedMealEntryService = require('../../services/sharedMealEntryService')

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
const SOURCE_LABELS = Object.freeze({
  meal: '吃饭',
  weight: '体重',
  care: '护理'
})

function pad(value) {
  return String(value).padStart(2, '0')
}

function shanghaiDateParts(value) {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return null
  const date = new Date(timestamp + SHANGHAI_OFFSET_MS)
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hours: date.getUTCHours(),
    minutes: date.getUTCMinutes()
  }
}

function shanghaiTodayKey(now = new Date()) {
  const parts = shanghaiDateParts(now)
  if (!parts) return ''
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

function monthKeyFromDateKey(dateKey) {
  return String(dateKey || '').slice(0, 7)
}

function firstDateKeyOfMonth(monthKey) {
  return `${monthKey}-01`
}

function selectedDateText(dateKey) {
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(dateKey || ''))
  if (!match) return '当天'
  return `${Number(match[1])}月${Number(match[2])}日`
}

function activeMonthText(monthKey) {
  const match = /^\d{4}-(\d{2})$/.exec(String(monthKey || ''))
  return match ? `${Number(match[1])} 月` : '本月'
}

function selectedDateHeading(dateKey, recordCount) {
  return `${selectedDateText(dateKey)} · ${recordCount}条记录`
}

function selectedDateDescription(recordCount) {
  return recordCount > 3
    ? '当天记录按时间倒序，可继续向下查看'
    : recordCount > 0
      ? '吃饭、体重和护理记录按时间顺序展示'
      : '选择日历中有圆点的日期查看记录'
}

function sourceNoticeText(model) {
  const failedSources = Object.keys(SOURCE_LABELS)
    .filter((source) => model && model.sources && model.sources[source]
      && model.sources[source].status !== 'success')
    .map((source) => SOURCE_LABELS[source])
  if (!failedSources.length) return ''
  return `部分${failedSources.join('、')}记录暂时无法读取`
}

function recordView(record = {}) {
  if (record.source) {
    return {
      ...record,
      tagVariant: 'neutral',
      sourceLabel: record.typeLabel || SOURCE_LABELS[record.source] || '记录'
    }
  }

  const parts = shanghaiDateParts(record.mealTime)
  const menus = (record.humanMenu || []).map((item) => item.title).filter(Boolean)
  return {
    ...record,
    timeText: parts ? `${pad(parts.hours)}:${pad(parts.minutes)}` : '时间待确认',
    dogName: record.dogSnapshot && record.dogSnapshot.name || '狗狗',
    menuText: menus.join('、') || '未命名人饭菜单',
    ingredientCount: (record.dogMealItems || []).length
  }
}

function groupView(group) {
  return {
    ...group,
    toggleText: group.expanded ? '收起' : '展开',
    records: group.records.map(recordView)
  }
}

Page({
  data: {
    activeMonthKey: '',
    activeMonthText: '本月',
    selectedDateKey: '',
    selectedDateText: '当天',
    selectedDateHeading: '当天 · 0条记录',
    selectedDateDescription: '选择日历中有圆点的日期查看记录',
    calendarDays: [],
    selectedRecords: [],
    dogGroups: [],
    dogCount: 0,
    isSingleDog: false,
    monthHasRecords: false,
    monthRecordCount: 0,
    hasPartialFailure: false,
    allSourcesFailed: false,
    dogsLoadError: false,
    hasBlockingError: false,
    sourceNoticeText: '',
    errorText: '',
    hasModel: false,
    loadStatus: 'idle',
    loading: false
  },

  ensureTimelineState() {
    if (!this.timelineState) {
      this.timelineState = sharedMealRecordService.createUnifiedRecordTimelineState()
    }
    return this.timelineState
  },

  syncTimelineView() {
    const state = this.ensureTimelineState().getState()
    const model = state.model
    const dogsLoadError = Boolean(model && model.dogsStatus && model.dogsStatus.status === 'error')
    const allSourcesFailed = Boolean(model && model.allSourcesFailed)
    const hasBlockingError = state.status === 'error'
      && (!model || allSourcesFailed || dogsLoadError)
    const selectedRecords = model ? model.selectedRecords.map(recordView) : []
    const dogGroups = model ? model.dogGroups.map(groupView) : []

    this.setData({
      activeMonthKey: state.activeMonthKey,
      activeMonthText: activeMonthText(state.activeMonthKey),
      selectedDateKey: state.selectedDateKey,
      selectedDateText: selectedDateText(state.selectedDateKey),
      selectedDateHeading: selectedDateHeading(state.selectedDateKey, selectedRecords.length),
      selectedDateDescription: selectedDateDescription(selectedRecords.length),
      calendarDays: model ? model.calendarDays : [],
      selectedRecords,
      dogGroups,
      dogCount: model ? model.dogCount : 0,
      isSingleDog: Boolean(model && model.isSingleDog),
      monthHasRecords: Boolean(model && model.monthHasRecords),
      monthRecordCount: model ? model.monthRecordCount : 0,
      hasPartialFailure: Boolean(model && model.hasSourceErrors && !hasBlockingError),
      allSourcesFailed,
      dogsLoadError,
      hasBlockingError,
      sourceNoticeText: sourceNoticeText(model),
      errorText: model && dogsLoadError
        ? '狗狗档案暂时无法读取，请重新加载。'
        : model && allSourcesFailed
          ? '吃饭、体重和护理记录暂时无法读取，请重新加载。'
          : state.error && state.error.message
            ? state.error.message
            : '记录暂时无法读取，请重新加载。',
      hasModel: Boolean(model),
      loadStatus: state.status,
      loading: state.status === 'loading'
    })
  },

  async loadMonth(monthKey, selectedDateKey) {
    if (!monthKey) return
    const state = this.ensureTimelineState()
    const request = state.load(monthKey, { selectedDateKey })
    this.syncTimelineView()
    try {
      await request
    } catch (error) {
      // 错误状态由统一时间轴模型保存，页面继续保留当前月份和已加载结果。
    }
    this.syncTimelineView()
  },

  async onShow() {
    const app = typeof getApp === 'function' ? getApp() : null
    if (app && app.globalData && app.globalData.authReady) {
      await app.globalData.authReady
    }

    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null
    if (tabBar) tabBar.setData({ selected: 'records' })
    const state = this.ensureTimelineState().getState()
    const todayKey = shanghaiTodayKey(typeof this.now === 'function' ? this.now() : new Date())
    const selectedDateKey = state.selectedDateKey || todayKey
    await this.loadMonth(state.activeMonthKey || monthKeyFromDateKey(selectedDateKey), selectedDateKey)
  },

  async onCalendarSelect(event) {
    const dateKey = event && event.detail && event.detail.dateKey
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return
    await this.loadMonth(monthKeyFromDateKey(dateKey), dateKey)
  },

  async onCalendarPanelChange(event) {
    const { year, month } = event && event.detail || {}
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return
    const monthKey = `${year}-${pad(month)}`
    await this.loadMonth(monthKey, firstDateKeyOfMonth(monthKey))
  },

  onToggleDog(event) {
    const dogId = String(event && event.currentTarget && event.currentTarget.dataset.dogId || '').trim()
    if (!dogId) return
    const state = this.ensureTimelineState().getState()
    const currentExpanded = state.model
      ? state.model.dogGroups.filter((group) => group.expanded).map((group) => group.dogId)
      : []
    const nextExpanded = currentExpanded.includes(dogId)
      ? currentExpanded.filter((id) => id !== dogId)
      : currentExpanded.concat(dogId)
    state.model && this.ensureTimelineState().setExpandedDogIds(nextExpanded)
    this.syncTimelineView()
  },

  async onRetryTimeline() {
    const state = this.ensureTimelineState()
    const request = state.retry()
    this.syncTimelineView()
    try {
      await request
    } catch (error) {
      // 保留目标月份、选中日期和已有结果，允许用户再次重试。
    }
    this.syncTimelineView()
  },

  async onRetryMonth() {
    return this.onRetryTimeline()
  },

  async onPullDownRefresh() {
    const state = this.ensureTimelineState()
    const request = state.refresh()
    this.syncTimelineView()
    try {
      await request
    } catch (error) {
      // 下拉刷新失败沿用页面内错误提示，不弹出额外瞬时反馈。
    }
    this.syncTimelineView()
    if (typeof wx !== 'undefined' && wx.stopPullDownRefresh) wx.stopPullDownRefresh()
  },

  onOpenRecord(event) {
    const dataset = event && event.currentTarget && event.currentTarget.dataset || {}
    const source = String(dataset.source || '')
    const sourceId = String(dataset.sourceId || '')
    const dogId = String(dataset.dogId || '')
    if (source === 'meal' && sourceId) {
      wx.navigateTo({
        url: `/subpackages/shared-meal/record-detail/index?recordId=${encodeURIComponent(sourceId)}`
      })
    } else if (source === 'weight' && dogId) {
      wx.navigateTo({
        url: `/subpackages/dog-profile/weight/index?dogId=${encodeURIComponent(dogId)}`
      })
    } else if (source === 'care' && dogId) {
      wx.navigateTo({
        url: `/subpackages/dog-profile/care-record/index?dogId=${encodeURIComponent(dogId)}`
      })
    }
  },

  onAddDog() {
    wx.navigateTo({ url: '/subpackages/dog-profile/dog-edit/index' })
  },

  onCreateMeal() {
    return sharedMealEntryService.startSharedMeal()
  }
})

module.exports = {
  shanghaiTodayKey,
  monthKeyFromDateKey,
  firstDateKeyOfMonth,
  selectedDateText,
  activeMonthText,
  selectedDateHeading,
  selectedDateDescription,
  sourceNoticeText,
  recordView,
  groupView
}
