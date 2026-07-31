const sharedMealRecordService = require('../../services/sharedMealRecordService')

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

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
  if (!match) return '当天喂食'
  return `${Number(match[1])}月${Number(match[2])}日`
}

function activeMonthText(monthKey) {
  const match = /^\d{4}-(\d{2})$/.exec(String(monthKey || ''))
  return match ? `${Number(match[1])} 月` : '本月'
}

function selectedDateHeading(dateKey, recordCount) {
  return `${selectedDateText(dateKey)} · ${recordCount ? `${recordCount}次喂食` : '暂无喂食'}`
}

function selectedDateDescription(recordCount) {
  return recordCount > 3 ? '当天记录按时间倒序，可继续向下滚动' : '绿色“已记”表示当天有记录'
}

function recordView(record) {
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

Page({
  data: {
    activeMonthKey: '',
    activeMonthText: '本月',
    selectedDateKey: '',
    selectedDateText: '当天喂食',
    selectedDateHeading: '当天喂食 · 暂无喂食',
    selectedDateDescription: '绿色“已记”表示当天有记录',
    calendarDays: [],
    selectedRecords: [],
    monthHasRecords: false,
    loadStatus: 'idle',
    loading: true,
    errorText: ''
  },

  ensureRecordMonthState() {
    if (!this.recordMonthState) {
      this.recordMonthState = sharedMealRecordService.createMonthState()
    }
    return this.recordMonthState
  },

  syncRecordView() {
    const state = this.ensureRecordMonthState().getState()
    if (!state.activeMonthKey) return
    const calendar = sharedMealRecordService.createCalendarModel(state.items, {
      monthKey: state.activeMonthKey,
      selectedDateKey: state.selectedDateKey
    })
    const selectedRecords = calendar.selectedRecords.map(recordView)
    this.setData({
      activeMonthKey: state.activeMonthKey,
      activeMonthText: activeMonthText(state.activeMonthKey),
      selectedDateKey: state.selectedDateKey,
      selectedDateText: selectedDateText(state.selectedDateKey),
      selectedDateHeading: selectedDateHeading(state.selectedDateKey, selectedRecords.length),
      selectedDateDescription: selectedDateDescription(selectedRecords.length),
      calendarDays: calendar.calendarDays,
      selectedRecords,
      monthHasRecords: calendar.markedDateKeys.length > 0,
      loadStatus: state.status,
      loading: state.status === 'loading',
      errorText: state.status === 'error'
        ? '请检查网络后重试，当前选择不会丢失'
        : ''
    })
  },

  async loadMonth(monthKey, selectedDateKey) {
    const state = this.ensureRecordMonthState()
    const request = state.load(monthKey, { selectedDateKey })
    this.syncRecordView()
    try {
      await request
    } catch (error) {
      // 错误状态由月份模型保存，页面统一从模型同步，避免丢失旧数据。
    }
    this.syncRecordView()
  },

  async onShow() {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null
    if (tabBar) tabBar.setData({ selected: 'records' })
    const state = this.ensureRecordMonthState().getState()
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

  async onRetryMonth() {
    const state = this.ensureRecordMonthState()
    const request = state.retry()
    this.syncRecordView()
    try {
      await request
    } catch (error) {
      // 保留目标月份、选中日期和已加载记录，供用户再次重试。
    }
    this.syncRecordView()
  },

  async onPullDownRefresh() {
    const state = this.ensureRecordMonthState()
    const request = state.refresh()
    this.syncRecordView()
    try {
      await request
    } catch (error) {
      // 下拉刷新失败沿用页面内错误提示，不弹出额外瞬时反馈。
    }
    this.syncRecordView()
    if (typeof wx !== 'undefined' && wx.stopPullDownRefresh) wx.stopPullDownRefresh()
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

module.exports = {
  shanghaiTodayKey,
  monthKeyFromDateKey,
  firstDateKeyOfMonth,
  selectedDateText,
  activeMonthText,
  selectedDateHeading,
  selectedDateDescription,
  recordView
}
