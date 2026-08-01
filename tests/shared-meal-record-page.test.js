const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function loadRecordsPage(recordService, entryService = { startSharedMeal: async () => ({ status: 'flow-started' }) }) {
  const source = read('pages/records/index.js')
  let definition
  const context = {
    Page(page) { definition = page },
    require(request) {
      if (request === '../../services/sharedMealRecordService') return recordService
      if (request === '../../services/sharedMealEntryService') return entryService
      throw new Error(`测试未提供依赖：${request}`)
    },
    module: { exports: {} },
    exports: {},
    Date,
    Promise,
    console,
    encodeURIComponent
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

test('记录日历包装 TDesign Calendar 并只暴露稳定页面事件', () => {
  const json = JSON.parse(read('components/vendor/record-calendar/index.json'))
  const wxml = read('components/vendor/record-calendar/index.wxml')
  const pageJson = JSON.parse(read('pages/records/index.json'))
  const pageWxml = read('pages/records/index.wxml')

  assert.equal(json.styleIsolation, 'isolated')
  assert.equal(json.usingComponents['t-calendar'], 'tdesign-miniprogram/calendar/calendar')
  assert.equal(pageJson.usingComponents['record-calendar'], '../../components/vendor/record-calendar/index')
  assert.match(wxml, /use-popup="\{\{false\}\}"/)
  assert.match(wxml, /type="single"/)
  assert.match(wxml, /switch-mode="year-month"/)
  assert.match(wxml, /confirm-btn="\{\{null\}\}"/)
  assert.match(wxml, /bind:select="onSelect"/)
  assert.match(wxml, /bind:panel-change="onPanelChange"/)
  assert.doesNotMatch(pageWxml, /<t-/)
})

test('记录页结构覆盖 L01–L06 的有记录、当天空、加载、失败、整月空和长列表', () => {
  const wxml = read('pages/records/index.wxml')
  const wxss = read('pages/records/index.wxss')

  assert.match(wxml, /calendarDays="\{\{calendarDays\}\}"/)
  assert.match(wxml, /loading="\{\{loading\}\}"/)
  assert.match(wxml, /bind:tap="onRetryMonth"/)
  assert.match(wxml, /这一天还没有喂食记录/)
  assert.match(wxml, /还没有喂食记录/)
  assert.match(wxml, /records-entry__chevron/)
  assert.match(wxml, /记录第一顿/)
  assert.match(wxml, /wx:for="\{\{selectedRecords\}\}"/)
  assert.match(wxss, /overflow-wrap: anywhere/)
  assert.doesNotMatch(wxml, /连续打卡|每日趋势|营养完整/)
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

  assert.equal(pageJson.navigationBarTitleText, '本餐记录')
  assert.match(pageWxml, /还没有喂食记录/)
  assert.match(pageWxml, /保存第一顿后，日历会显示每天的打卡情况/)
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
  assert.equal(moduleExports.selectedDateHeading('2026-07-30', 2), '7月30日 · 2次喂食')
  assert.equal(moduleExports.selectedDateDescription(4), '当天记录按时间倒序，可继续向下滚动')

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
    '2026-07': [{ id: 'jul-31', mealTime: '2026-07-30T17:00:00.000Z' }],
    '2026-08': [{ id: 'aug-1', mealTime: '2026-08-01T01:00:00.000Z' }]
  }
  let current = { activeMonthKey: '', selectedDateKey: '', status: 'idle', items: [], error: null }
  const calls = []
  const monthState = {
    getState: () => current,
    async load(monthKey, options = {}) {
      calls.push({ monthKey, selectedDateKey: options.selectedDateKey })
      current = {
        activeMonthKey: monthKey,
        selectedDateKey: options.selectedDateKey,
        status: 'success',
        items: states[monthKey] || [],
        error: null
      }
      return { applied: true }
    },
    async retry() { return { applied: true } },
    async refresh() { return { applied: true } }
  }
  const actualModel = require('../services/sharedMealRecordCalendarModel').createRecordCalendarModel
  const { definition } = loadRecordsPage({
    createMonthState: () => monthState,
    createCalendarModel: actualModel
  })
  const page = createPageContext(definition)
  page.now = () => new Date('2026-07-30T16:30:00.000Z')

  await page.onShow()
  assert.deepEqual(calls[0], { monthKey: '2026-07', selectedDateKey: '2026-07-31' })
  assert.equal(page.data.selectedDateKey, '2026-07-31')
  assert.deepEqual(page.data.selectedRecords.map((item) => item.id), ['jul-31'])

  await page.onCalendarPanelChange({ detail: { year: 2026, month: 8 } })
  assert.deepEqual(calls[1], { monthKey: '2026-08', selectedDateKey: '2026-08-01' })
  assert.equal(page.data.selectedDateKey, '2026-08-01')
  assert.deepEqual(page.data.selectedRecords.map((item) => item.id), ['aug-1'])
})

test('选中无记录日期保留月份数据，失败后可从当前月份重试', async () => {
  const items = [{ id: 'record-1', mealTime: '2026-07-30T10:00:00.000Z' }]
  let current = {
    activeMonthKey: '2026-07',
    selectedDateKey: '2026-07-30',
    status: 'success',
    items,
    error: null
  }
  let retried = 0
  const monthState = {
    getState: () => current,
    async load(monthKey, options) {
      current = { ...current, activeMonthKey: monthKey, selectedDateKey: options.selectedDateKey }
      return { applied: true }
    },
    async retry() {
      retried += 1
      current = { ...current, status: 'success', error: null }
      return { applied: true }
    },
    async refresh() { return { applied: true } }
  }
  const actualModel = require('../services/sharedMealRecordCalendarModel').createRecordCalendarModel
  const { definition } = loadRecordsPage({
    createMonthState: () => monthState,
    createCalendarModel: actualModel
  })
  const page = createPageContext(definition)
  page.recordMonthState = monthState

  await page.onCalendarSelect({ detail: { dateKey: '2026-07-29' } })
  assert.equal(page.data.selectedDateKey, '2026-07-29')
  assert.deepEqual(page.data.selectedRecords, [])
  assert.equal(page.data.monthHasRecords, true)

  current = { ...current, status: 'error', error: new Error('network') }
  page.syncRecordView()
  assert.equal(page.data.loadStatus, 'error')
  assert.equal(page.data.errorText, '请检查网络后重试，当前选择不会丢失')
  await page.onRetryMonth()
  assert.equal(retried, 1)
  assert.equal(page.data.loadStatus, 'success')
})
