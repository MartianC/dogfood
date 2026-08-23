const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createUnifiedRecordTimelineModel } = require('../services/unifiedRecordTimelineModel')
const { createDataInvalidationState, DATA_SCOPE } = require('../services/dataInvalidationService')

const root = path.resolve(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function loadRecordsPage(
  recordService,
  entryService = { startSharedMeal: async () => ({ status: 'flow-started' }) },
  wx = {},
  app = { globalData: { authReady: Promise.resolve() } },
  dataInvalidation = createDataInvalidationState()
) {
  const source = read('pages/records/index.js')
  let definition
  const context = {
    Page(page) { definition = page },
    require(request) {
      if (request === '../../services/sharedMealRecordService') return recordService
      if (request === '../../services/sharedMealEntryService') return entryService
      if (request === '../../services/dataInvalidationService') return dataInvalidation
      throw new Error(`测试未提供依赖：${request}`)
    },
    module: { exports: {} },
    exports: {},
    Date,
    Promise,
    console,
    encodeURIComponent,
    wx,
    getApp() { return app }
  }
  vm.runInNewContext(`(function () { ${source}\n })()`, context, { filename: 'pages/records/index.js' })
  return { definition, moduleExports: context.module.exports }
}

function createPageContext(definition) {
  return {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch, callback) {
      Object.assign(this.data, patch)
      if (callback) callback()
    },
    getTabBar() {
      return { setData() {} }
    }
  }
}

function createTimelineState(monthSources) {
  let current = {
    activeMonthKey: '',
    selectedDateKey: '',
    expandedDogIds: null,
    status: 'idle',
    model: null,
    error: null
  }

  function loadModel(monthKey, selectedDateKey) {
    return createUnifiedRecordTimelineModel({
      dogs: [{ id: 'dog-1', name: '布丁' }],
      sources: monthSources[monthKey] || {},
      monthKey,
      selectedDateKey
    })
  }

  return {
    getState() {
      return { ...current }
    },
    async load(monthKey, options = {}) {
      current = {
        activeMonthKey: monthKey,
        selectedDateKey: options.selectedDateKey,
        expandedDogIds: null,
        status: 'success',
        model: loadModel(monthKey, options.selectedDateKey),
        error: null
      }
      return { model: current.model, applied: true }
    },
    async retry() {
      current = { ...current, status: 'success', error: null }
      return { model: current.model, applied: true }
    },
    async refresh() {
      return this.retry()
    },
    setError(error) {
      current = { ...current, status: 'error', error }
    },
    setExpandedDogIds(expandedDogIds) {
      current = {
        ...current,
        expandedDogIds,
        model: createUnifiedRecordTimelineModel({
          dogs: current.model.dogs,
          sources: current.model.sources,
          monthKey: current.activeMonthKey,
          selectedDateKey: current.selectedDateKey,
          expandedDogIds
        })
      }
      return current.model
    }
  }
}

test('记录日历包装 TDesign Calendar 并只暴露稳定页面事件', () => {
  const json = JSON.parse(read('components/vendor/record-calendar/index.json'))
  const wxml = read('components/vendor/record-calendar/index.wxml')
  const calendarJs = read('components/vendor/record-calendar/index.js')
  const calendarWxss = read('components/vendor/record-calendar/index.wxss')
  const pageJson = JSON.parse(read('pages/records/index.json'))
  const pageWxml = read('pages/records/index.wxml')

  assert.equal(json.styleIsolation, 'shared')
  assert.equal(json.usingComponents['t-calendar'], 'tdesign-miniprogram/calendar/calendar')
  assert.equal(pageJson.usingComponents['record-calendar'], '../../components/vendor/record-calendar/index')
  assert.match(wxml, /use-popup="\{\{false\}\}"/)
  assert.match(wxml, /type="single"/)
  assert.match(wxml, /switch-mode="year-month"/)
  assert.match(wxml, /confirm-btn="\{\{null\}\}"/)
  assert.match(wxml, /bind:select="onSelect"/)
  assert.match(wxml, /bind:panel-change="onPanelChange"/)
  assert.match(calendarJs, /day\.suffix = marked\.has\(localDateKey\(day\.date\)\) \? '•' : ''/)
  assert.match(calendarWxss, /--td-calendar-selected-border-radius: 50%/)
  assert.match(calendarWxss, /--record-calendar-date-size: 88rpx/)
  assert.match(calendarWxss, /height: 560rpx !important/)
  assert.match(calendarWxss, /width: var\(--record-calendar-date-size\) !important/)
  assert.match(calendarWxss, /height: var\(--record-calendar-date-size\) !important/)
  assert.match(calendarWxss, /margin: 0 auto !important/)
  assert.doesNotMatch(pageWxml, /<t-/)
})

test('记录页结构覆盖 L01–L06 的有记录、当天空、加载、失败、整月空和长列表', () => {
  const wxml = read('pages/records/index.wxml')
  const wxss = read('pages/records/index.wxss')

  assert.match(wxml, /calendarDays="\{\{calendarDays\}\}"/)
  assert.match(wxml, /loading="\{\{loading\}\}"/)
  assert.match(wxml, /bind:tap="onRetryTimeline"/)
  assert.match(wxml, /这一天还没有记录/)
  assert.match(wxml, /这个月还没有记录/)
  assert.match(wxml, /records-entry__chevron/)
  assert.match(wxml, /记录第一顿/)
  assert.match(wxml, /wx:for="\{\{selectedRecords\}\}"/)
  assert.match(wxml, /ui-tag/)
  assert.match(wxml, /records-dog-group__header/)
  assert.match(wxml, /bindtap="onToggleDog"/)
  assert.doesNotMatch(wxml, /recordCountText|records-dog-group__count/)
  assert.match(wxss, /overflow-wrap: anywhere/)
  assert.doesNotMatch(`${wxml}${read('components/vendor/record-calendar/index.js')}`, /已记/)
  assert.doesNotMatch(wxml, /连续打卡|每日趋势|营养完整|狗狗筛选|来源筛选/)
})

test('F1.5 保留记录页确认文案并通过统一记餐入口启动', async () => {
  const pageJson = JSON.parse(read('pages/records/index.json'))
  const pageWxml = read('pages/records/index.wxml')
  let entryCalls = 0
  const entryService = {
    async startSharedMeal() {
      entryCalls += 1
      return { status: 'flow-started' }
    }
  }
  const { definition } = loadRecordsPage({}, entryService)

  assert.equal(pageJson.navigationBarTitleText, '记录')
  assert.match(pageWxml, /先添加爱宠档案/)
  assert.match(pageWxml, /保存第一顿后，日历会显示每天的记录/)
  assert.match(pageWxml, /<ui-button bind:tap="onCreateMeal">记录第一顿<\/ui-button>/)
  assert.doesNotMatch(pageWxml, /subpackages\/shared-meal\/dog-select\/index/)

  const result = await definition.onCreateMeal()
  assert.deepEqual(result, { status: 'flow-started' })
  assert.equal(entryCalls, 1)
})

test('日历日期与时间展示使用上海自然日并保持长文案字段', () => {
  const { moduleExports } = loadRecordsPage({})
  assert.equal(moduleExports.shanghaiTodayKey(new Date('2026-07-30T16:30:00.000Z')), '2026-07-31')
  assert.equal(moduleExports.monthKeyFromDateKey('2026-07-31'), '2026-07')
  assert.equal(moduleExports.firstDateKeyOfMonth('2026-08'), '2026-08-01')
  assert.equal(moduleExports.activeMonthText('2026-08'), '8 月')
  assert.equal(moduleExports.selectedDateHeading('2026-07-30', 2), '7月30日 · 2条记录')
  assert.equal(moduleExports.selectedDateDescription(4), '当天记录按时间倒序，可继续向下查看')

  const view = moduleExports.recordView({
    id: 'record-1',
    mealTime: '2026-07-30T16:05:00.000Z',
    dogSnapshot: { name: '一只名字很长的狗狗' },
    humanMenu: [{ title: '一份名字很长的人饭菜单' }],
    dogMealItems: [{}, {}]
  })
  assert.equal(view.timeText, '00:05')
  assert.equal(view.dogName, '一只名字很长的狗狗')
  assert.equal(view.menuText, '一份名字很长的人饭菜单')
  assert.equal(view.ingredientCount, 2)
})

test('记录页默认读取今天月份，切换月份后选择首日并展示当天列表', async () => {
  const states = {
    '2026-07': { meal: { items: [{
      id: 'jul-31',
      targetDogId: 'dog-1',
      mealTime: '2026-07-30T17:00:00.000Z',
      dogSnapshot: { id: 'dog-1', name: '布丁' },
      humanMenu: [{ title: '鸡胸' }],
      dogMealItems: [{}]
    }] } },
    '2026-08': { meal: { items: [{
      id: 'aug-1',
      targetDogId: 'dog-1',
      mealTime: '2026-08-01T01:00:00.000Z',
      dogSnapshot: { id: 'dog-1', name: '布丁' },
      humanMenu: [{ title: '南瓜' }],
      dogMealItems: [{}]
    }] } }
  }
  const calls = []
  const timelineState = createTimelineState(states)
  const originalLoad = timelineState.load
  timelineState.load = async (monthKey, options = {}) => {
    calls.push({ monthKey, selectedDateKey: options.selectedDateKey })
    return originalLoad(monthKey, options)
  }
  const { definition } = loadRecordsPage({ createUnifiedRecordTimelineState: () => timelineState })
  const page = createPageContext(definition)
  page.now = () => new Date('2026-07-30T16:30:00.000Z')

  await page.onShow()
  assert.deepEqual(calls[0], { monthKey: '2026-07', selectedDateKey: '2026-07-31' })
  assert.equal(page.data.selectedDateKey, '2026-07-31')
  assert.deepEqual(page.data.selectedRecords.map((item) => item.id), ['meal:jul-31'])

  await page.onCalendarPanelChange({ detail: { year: 2026, month: 8 } })
  assert.deepEqual(calls[1], { monthKey: '2026-08', selectedDateKey: '2026-08-01' })
  assert.equal(page.data.selectedDateKey, '2026-08-01')
  assert.deepEqual(page.data.selectedRecords.map((item) => item.id), ['meal:aug-1'])
})

test('记录页等待应用认证初始化后再开始查询记录', async () => {
  let resolveAuth
  const authReady = new Promise((resolve) => {
    resolveAuth = resolve
  })
  let loadCalls = 0
  const timelineState = {
    getState: () => ({
      activeMonthKey: '',
      selectedDateKey: '',
      expandedDogIds: null,
      status: 'idle',
      model: null,
      error: null
    }),
    load: async () => {
      loadCalls += 1
    }
  }
  const { definition } = loadRecordsPage(
    { createUnifiedRecordTimelineState: () => timelineState },
    undefined,
    {},
    { globalData: { authReady } }
  )
  const page = createPageContext(definition)
  const request = page.onShow()

  await Promise.resolve()
  assert.equal(loadCalls, 0)

  resolveAuth()
  await request
  assert.equal(loadCalls, 1)
})

test('记录页数据版本变化时强制刷新当前月份', async () => {
  const timelineState = createTimelineState({
    '2026-08': { meal: { items: [] } }
  })
  const calls = []
  const originalLoad = timelineState.load
  timelineState.load = async (monthKey, options = {}) => {
    calls.push({ monthKey, ...options })
    return originalLoad(monthKey, options)
  }
  const dataInvalidation = createDataInvalidationState()
  const { definition } = loadRecordsPage(
    { createUnifiedRecordTimelineState: () => timelineState },
    undefined,
    { navigateTo() {} },
    undefined,
    dataInvalidation
  )
  const page = createPageContext(definition)
  page.now = () => new Date('2026-08-05T04:00:00.000Z')

  await page.onShow()
  dataInvalidation.markDirty(DATA_SCOPE.PROFILE)
  await page.onShow()

  assert.equal(calls.length, 2)
  assert.equal(calls[0].force, false)
  assert.equal(calls[1].force, true)
  assert.equal(calls[1].selectedDateKey, '2026-08-05')
})

test('记录页普通 Tab 往返时复用当前月份，不重复刷新', async () => {
  const timelineState = createTimelineState({
    '2026-08': { meal: { items: [] } }
  })
  const calls = []
  const originalLoad = timelineState.load
  timelineState.load = async (monthKey, options = {}) => {
    calls.push({ monthKey, ...options })
    return originalLoad(monthKey, options)
  }
  const { definition } = loadRecordsPage({ createUnifiedRecordTimelineState: () => timelineState })
  const page = createPageContext(definition)
  page.now = () => new Date('2026-08-05T04:00:00.000Z')

  await page.onShow()
  await page.onShow()

  assert.equal(calls.length, 1)
})

test('记录页首次进入复用应用启动的预取状态，不强制刷新', async () => {
  const timelineState = createTimelineState({
    '2026-08': { meal: { items: [] } }
  })
  await timelineState.load('2026-08', { selectedDateKey: '2026-08-05' })
  const calls = []
  const originalLoad = timelineState.load
  timelineState.load = async (monthKey, options = {}) => {
    calls.push({ monthKey, ...options })
    return originalLoad(monthKey, options)
  }
  const app = {
    globalData: {
      authReady: Promise.resolve(),
      recordTimelineState: timelineState
    }
  }
  const { definition } = loadRecordsPage({}, undefined, {}, app)
  const page = createPageContext(definition)
  page.now = () => new Date('2026-08-05T04:00:00.000Z')

  await page.onShow()

  assert.deepEqual(calls[0], {
    monthKey: '2026-08',
    selectedDateKey: '2026-08-05',
    force: false
  })
})

test('选中无记录日期保留月份数据，失败后可从当前月份重试', async () => {
  const timelineState = createTimelineState({
    '2026-07': { meal: { items: [{
      id: 'record-1',
      targetDogId: 'dog-1',
      mealTime: '2026-07-30T10:00:00.000Z',
      dogSnapshot: { id: 'dog-1', name: '布丁' },
      humanMenu: [{ title: '鸡胸' }],
      dogMealItems: [{}]
    }] } }
  })
  let retried = 0
  const originalRetry = timelineState.retry
  timelineState.retry = async () => {
    retried += 1
    return originalRetry()
  }
  const { definition } = loadRecordsPage({ createUnifiedRecordTimelineState: () => timelineState })
  const page = createPageContext(definition)
  page.timelineState = timelineState

  await page.onShow()

  await page.onCalendarSelect({ detail: { dateKey: '2026-07-29' } })
  assert.equal(page.data.selectedDateKey, '2026-07-29')
  assert.deepEqual(page.data.selectedRecords, [])
  assert.equal(page.data.monthHasRecords, true)

  timelineState.setError(new Error('network'))
  page.syncTimelineView()
  assert.equal(page.data.loadStatus, 'error')
  assert.equal(page.data.errorText, 'network')
  await page.onRetryTimeline()
  assert.equal(retried, 1)
  assert.equal(page.data.loadStatus, 'success')
})

test('多狗分组可展开收起，三类记录进入各自详情页', async () => {
  const model = createUnifiedRecordTimelineModel({
    dogs: [{ id: 'dog-1', name: '布丁' }, { id: 'dog-2', name: '奶糖' }],
    sources: {
      meal: { items: [{
        id: 'meal-1', targetDogId: 'dog-1', mealTime: '2026-08-05T01:00:00.000Z',
        dogSnapshot: { id: 'dog-1', name: '布丁' }, humanMenu: [{ title: '鸡胸' }], dogMealItems: [{}]
      }] },
      weight: { items: [{
        id: 'weight-1', dogId: 'dog-2', weightKg: 8, measuredOn: '2026-08-05', createdAt: '2026-08-05T02:00:00.000Z'
      }] },
      care: { items: [{
        id: 'care-1', dogId: 'dog-2', type: 'other', name: '洗澡', occurredOn: '2026-08-05', nextDate: null, createdAt: '2026-08-05T03:00:00.000Z'
      }] }
    },
    monthKey: '2026-08',
    selectedDateKey: '2026-08-05'
  })
  const timelineState = {
    getState: () => ({ activeMonthKey: '2026-08', selectedDateKey: '2026-08-05', expandedDogIds: null, status: 'success', model, error: null }),
    setExpandedDogIds() { return model },
    load: async () => ({ model, applied: true }),
    retry: async () => ({ model, applied: true }),
    refresh: async () => ({ model, applied: true })
  }
  const navigations = []
  const { definition } = loadRecordsPage(
    { createUnifiedRecordTimelineState: () => timelineState },
    undefined,
    { navigateTo(options) { navigations.push(options.url) } }
  )
  const page = createPageContext(definition)
  page.timelineState = timelineState
  page.syncTimelineView()
  assert.equal(page.data.dogGroups.length, 2)
  assert.equal(page.data.dogGroups[0].expanded, true)
  page.onToggleDog({ currentTarget: { dataset: { dogId: 'dog-1' } } })
  page.onOpenRecord({ currentTarget: { dataset: { source: 'meal', sourceId: 'meal-1', dogId: 'dog-1' } } })
  page.onOpenRecord({ currentTarget: { dataset: { source: 'weight', sourceId: 'weight-1', dogId: 'dog-2' } } })
  page.onOpenRecord({ currentTarget: { dataset: { source: 'care', sourceId: 'care-1', dogId: 'dog-2' } } })
  assert.deepEqual(navigations, [
    '/subpackages/shared-meal/record-detail/index?recordId=meal-1',
    '/subpackages/dog-profile/weight/index?dogId=dog-2',
    '/subpackages/dog-profile/care-record/index?dogId=dog-2'
  ])
})
