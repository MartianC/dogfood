const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const homeStateModel = require('../services/homeStateModel')

const FIXED_NOW = new Date('2026-08-02T04:00:00.000Z')

function loadHomePage({
  dogService,
  recordService,
  authState = 'guest',
  draft = null,
  now = FIXED_NOW
}) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'pages/home/index.js'), 'utf8')
  const getAuthState = typeof authState === 'function' ? authState : () => authState
  const dependencies = {
    '../../services/dogService': dogService,
    '../../services/authService': { getAuthState },
    '../../services/sharedMealRecordService': recordService,
    '../../services/sharedMealEntryService': { startSharedMeal: async () => ({ status: 'flow-started' }) },
    '../../services/homeDraftSummaryService': {
      getDraftSummary() { return draft }
    },
    '../../services/homeStateModel': homeStateModel,
    '../../services/navigationMigrationService': {
      MAIN_TABS: [{ value: 'records', pagePath: 'pages/records/index' }]
    }
  }
  let definition
  const context = {
    Page(page) { definition = page },
    getApp() { return { globalData: { authReady: Promise.resolve() } } },
    require(request) {
      if (!Object.prototype.hasOwnProperty.call(dependencies, request)) {
        throw new Error(`测试未提供依赖：${request}`)
      }
      return dependencies[request]
    },
    wx: {
      switchTab() {},
      navigateTo() {}
    },
    module: { exports: {} },
    exports: {},
    Date,
    Promise,
    console
  }
  vm.runInNewContext(`(function () { ${source}\n })()`, context, { filename: 'pages/home/index.js' })
  definition.recordsForToday = context.module.exports.recordsForToday
  definition.now = () => now
  return definition
}

function record({ id = 'record-1', mealTime = FIXED_NOW.toISOString(), menu = '番茄炒蛋' } = {}) {
  return {
    id,
    mealTime,
    dogSnapshot: { id: 'dog-1', name: '布丁' },
    humanMenu: [{ title: menu }],
    dogMealItems: [{ name: '鸡蛋' }]
  }
}

test('游客首页不请求档案、记录或草稿，仍展示登录主任务', async () => {
  const definition = loadHomePage({
    dogService: { listDogs: async () => { throw new Error('游客不应请求档案') } },
    recordService: { list: async () => { throw new Error('游客不应请求记录') } }
  })
  let viewData
  await definition.onShow.call({
    now: definition.now,
    getTabBar: () => ({ setData() {} }),
    setData(data) { viewData = data }
  })
  assert.equal(viewData.authState, 'guest')
  assert.equal(viewData.homeState.status, homeStateModel.HOME_STATUS.GUEST)
  assert.equal(viewData.homeState.primaryTask.label, '登录并继续')
  assert.equal(viewData.latestRecord, null)
})

test('已登录首页在记录服务失败时展示稳定错误降级，仍保留记一顿入口', async () => {
  const definition = loadHomePage({
    authState: 'logged-in',
    dogService: { listDogs: async () => [] },
    recordService: { list: async () => { throw new Error('network') } }
  })
  let viewData
  await definition.onShow.call({
    now: definition.now,
    getTabBar: () => ({ setData() {} }),
    setData(data) { viewData = data }
  })
  assert.equal(viewData.homeState.status, homeStateModel.HOME_STATUS.DATA_ERROR)
  assert.equal(viewData.homeState.primaryTask.label, '记一顿')
  assert.equal(viewData.homeState.recentRecord, null)
})

test('主页把今天记录与最近记录分别交给状态模型', async () => {
  let authState = 'logged-in'
  const definition = loadHomePage({
    authState: () => authState,
    dogService: {
      listDogs: async () => {
        authState = 'has-profile'
        return [{ id: 'dog-1', name: '布丁' }]
      }
    },
    recordService: {
      list: async () => ({
        items: [record({ id: 'record-1' })]
      })
    }
  })
  let viewData
  await definition.onShow.call({
    now: definition.now,
    getTabBar: () => ({ setData() {} }),
    setData(data) { viewData = data }
  })
  assert.equal(viewData.homeState.status, homeStateModel.HOME_STATUS.TODAY_HAS_RECORDS)
  assert.equal(viewData.homeState.todaySummary.count, 1)
  assert.equal(viewData.homeState.recentRecord.dogName, '布丁')
  assert.equal(viewData.homeState.recentRecord.menuText, '番茄炒蛋')
})

test('主页显示可恢复草稿状态且不自动导航', async () => {
  const definition = loadHomePage({
    authState: 'has-profile',
    dogService: { listDogs: async () => [{ id: 'dog-1', name: '布丁' }] },
    recordService: { list: async () => ({ items: [] }) },
    draft: {
      id: 'draft-1',
      dog: { id: 'dog-1', name: '布丁' },
      humanMenus: [{ title: '鸡肉饭' }],
      mealTime: FIXED_NOW.toISOString()
    }
  })
  let viewData
  await definition.onShow.call({
    now: definition.now,
    getTabBar: () => ({ setData() {} }),
    setData(data) { viewData = data }
  })
  assert.equal(viewData.homeState.status, homeStateModel.HOME_STATUS.DRAFT)
  assert.equal(viewData.homeState.draft.dogName, '布丁')
  assert.equal(viewData.homeState.primaryTask.label, '查看草稿')
})

test('今天有记录时主任务打开记录页，而不是重复启动记餐流程', async () => {
  let switchedTo = ''
  const definition = loadHomePage({
    authState: 'has-profile',
    dogService: { listDogs: async () => [{ id: 'dog-1', name: '布丁' }] },
    recordService: { list: async () => ({ items: [record()] }) }
  })
  let viewData
  await definition.onShow.call({
    now: definition.now,
    getTabBar: () => ({ setData() {} }),
    setData(data) { viewData = data }
  })
  definition.onOpenRecords = () => { switchedTo = 'records' }
  await definition.onPrimaryTask.call({
    data: viewData,
    onOpenRecords: definition.onOpenRecords,
    onCreateMeal: definition.onCreateMeal
  })
  assert.equal(switchedTo, 'records')
})

test('上海自然日边界稳定区分今天记录', () => {
  const definition = loadHomePage({
    dogService: { listDogs: async () => [] },
    recordService: { list: async () => ({ items: [] }) }
  })
  const records = [
    record({ id: 'before-boundary', mealTime: '2026-08-01T15:59:59.000Z' }),
    record({ id: 'at-boundary', mealTime: '2026-08-01T16:00:00.000Z' })
  ]
  assert.deepEqual(
    definition.recordsForToday(records, new Date('2026-08-02T00:00:00.000Z')).map((item) => item.id),
    ['at-boundary']
  )
})

test('首页 WXML 覆盖六类模型状态并保留 UI Kernel 与底部安全区约束', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/home/index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages/home/index.wxss'), 'utf8')

  assert.match(wxml, /homeState\.status/)
  assert.match(wxml, /homeState\.primaryTask/)
  assert.match(wxml, /homeState\.todaySummary/)
  assert.match(wxml, /homeState\.draft/)
  assert.match(wxml, /homeState\.profileIssues/)
  assert.match(wxml, /homeState\.recentRecord/)
  assert.match(wxml, /class="page with-tab-bar home-page"/)
  assert.match(wxml, /<ui-card\s+variant="plain"\s+padding="large"/)
  assert.doesNotMatch(wxml, /homeState\.status === 'data-error' \? 'plain' : 'primary'/)
  assert.match(wxml, /<ui-button/)
  assert.match(wxml, /<ui-empty/)
  assert.match(wxml, /<ui-notice/)
  assert.doesNotMatch(wxml, /<t-[a-z0-9-]+/)
  assert.match(wxss, /overflow-wrap: anywhere/)
  assert.match(wxss, /var\(--df-color-/)
  assert.match(wxss, /\.home-primary__eyebrow\s*\{[\s\S]*color: var\(--df-color-primary\)/)
  assert.match(wxss, /\.home-primary__title\s*\{[\s\S]*color: var\(--df-color-text\)/)
  assert.match(wxss, /\.home-primary__description\s*\{[\s\S]*color: var\(--df-color-muted\)/)
})
