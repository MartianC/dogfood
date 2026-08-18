const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const storage = require('../utils/storage')
const authService = require('../services/authService')
const homeStateModel = require('../services/homeStateModel')
const homeStartupTiming = require('../services/homeStartupTiming')
const { createDataInvalidationState } = require('../services/dataInvalidationService')

const FIXED_NOW = new Date('2026-08-02T04:00:00.000Z')
const HOME_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'pages/home/index.js'), 'utf8')

function loadHomePage({ dogs, authState, records, draft = null, listDogs, listRecords, listHomeItems }) {
  let definition
  const dataInvalidation = createDataInvalidationState()
  const dependencies = {
    '../../services/dogService': { listDogs: listDogs || (async () => dogs) },
    '../../services/authService': { getAuthState: () => authState },
    '../../services/sharedMealRecordService': { list: listRecords || (async () => records) },
    '../../services/sharedMealEntryService': { startSharedMeal: async () => ({ status: 'started' }) },
    '../../services/homeItemService': { listForDogs: listHomeItems || (async () => []) },
    '../../services/dataInvalidationService': dataInvalidation,
    '../../services/homeStartupTiming': homeStartupTiming,
    '../../services/homeDraftSummaryService': { getDraftSummary: () => draft },
    '../../services/homeStateModel': homeStateModel,
    '../../services/navigationMigrationService': {
      MAIN_TABS: [{ value: 'records', pagePath: 'pages/records/index' }]
    }
  }
  const context = {
    Page(page) { definition = page },
    // H2 的缓存快路径通过 globalData 提供认证和狗狗快照。
    getApp() {
      return { globalData: { authReady: Promise.resolve(), authState, dogs } }
    },
    require(request) {
      if (!Object.prototype.hasOwnProperty.call(dependencies, request)) {
        throw new Error(`测试未提供依赖：${request}`)
      }
      return dependencies[request]
    },
    wx: { switchTab() {}, navigateTo() {} },
    module: { exports: {} },
    exports: {},
    Date,
    Promise,
    console
  }
  vm.runInNewContext(`(function () { ${HOME_SOURCE}\n })()`, context, {
    filename: 'pages/home/index.js'
  })
  definition.now = () => FIXED_NOW
  return definition
}

test.afterEach(() => {
  storage.removeSync('access_token')
  storage.removeSync('currentUser')
  storage.removeSync('dogsCache')
})

test('authService.initAuth 返回稳定的认证、用户和狗狗快照结构', async () => {
  assert.deepEqual(await authService.initAuth(), {
    authState: 'guest',
    user: null,
    dogs: []
  })

  storage.setSync('access_token', 'token-h2')
  storage.setSync('currentUser', { id: 'user-h2' })
  storage.setSync('dogsCache', {
    profileSchemaVersion: 3,
    items: [{ id: 'dog-h2', name: '布丁' }],
    updatedAt: new Date().toISOString()
  })
  assert.deepEqual(await authService.initAuth(), {
    authState: 'has-profile',
    user: { id: 'user-h2' },
    dogs: [{ id: 'dog-h2', name: '布丁' }]
  })
})

test('H2：记录接口未返回时，已有狗狗的认证快照先渲染“记一顿”主任务', async () => {
  let releaseRecords
  const pendingRecords = new Promise((resolve) => { releaseRecords = resolve })
  const definition = loadHomePage({
    authState: 'has-profile',
    dogs: [{ id: 'dog-h2', name: '布丁' }],
    records: pendingRecords
  })
  const updates = []
  const pending = definition.onShow.call({
    getTabBar: () => ({ setData() {} }),
    setData(data) { updates.push(data) }
  })

  await new Promise((resolve) => setImmediate(resolve))
  assert.ok(updates.length > 0, '记录接口挂起时应先提交认证快照对应的首页外壳')
  assert.equal(updates[0].authState, 'has-profile')
  assert.equal(updates[0].homeState.primaryTask.label, '记一顿')
  assert.notEqual(updates[0].homeState.status, homeStateModel.HOME_STATUS.GUEST)

  releaseRecords({ items: [] })
  await pending
})

test('H2：认证快照无狗狗且存在草稿时，记录接口未返回前先显示可恢复草稿', async () => {
  let releaseRecords
  const pendingRecords = new Promise((resolve) => { releaseRecords = resolve })
  const definition = loadHomePage({
    authState: 'logged-in',
    dogs: [],
    records: pendingRecords,
    draft: {
      id: 'draft-h2',
      dog: { id: 'dog-h2', name: '布丁' },
      humanMenus: [{ title: '鸡肉饭' }],
      updatedAt: '2026-08-02T03:00:00.000Z'
    }
  })
  const updates = []
  const pending = definition.onShow.call({
    getTabBar: () => ({ setData() {} }),
    setData(data) { updates.push(data) }
  })

  await new Promise((resolve) => setImmediate(resolve))
  assert.ok(updates.length > 0, '草稿摘要应随认证快照同步注入首页')
  assert.equal(updates[0].homeState.status, homeStateModel.HOME_STATUS.DRAFT)
  assert.equal(updates[0].homeState.primaryTask.label, '查看草稿')
  assert.equal(updates[0].homeState.draft.id, 'draft-h2')

  releaseRecords({ items: [] })
  await pending
})

test('H3：狗狗档案与本餐记录请求并行启动，任一失败不阻塞另一块读取', async () => {
  let releaseDogs
  let releaseRecords
  let dogsStarted = false
  let recordsStarted = false
  const pendingDogs = new Promise((resolve) => { releaseDogs = resolve })
  const pendingRecords = new Promise((resolve, reject) => { releaseRecords = reject })
  const definition = loadHomePage({
    authState: 'has-profile',
    dogs: [],
    records: [],
    listDogs: async () => {
      dogsStarted = true
      return pendingDogs
    },
    listRecords: async () => {
      recordsStarted = true
      return pendingRecords
    }
  })
  const updates = []
  const page = {
    getTabBar: () => ({ setData() {} }),
    setData(data) { updates.push(data) }
  }
  const pending = definition.onShow.call(page)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(dogsStarted, true)
  assert.equal(recordsStarted, true)

  releaseDogs([{ id: 'dog-h3', name: '布丁' }])
  releaseRecords(new Error('记录读取失败'))
  const result = await pending
  assert.equal(result.status, 'data-error')
  assert.deepEqual(updates.at(-1).dogs, [{ id: 'dog-h3', name: '布丁' }])
})

test('H3：连续 onShow 时旧请求完成不得覆盖较新的首页结果', async () => {
  let resolveFirstDogs
  let resolveFirstRecords
  const firstDogs = new Promise((resolve) => { resolveFirstDogs = resolve })
  const firstRecords = new Promise((resolve) => { resolveFirstRecords = resolve })
  let dogCall = 0
  let recordCall = 0
  const definition = loadHomePage({
    authState: 'has-profile',
    dogs: [],
    records: [],
    listDogs: async () => {
      dogCall += 1
      if (dogCall === 1) return firstDogs
      return [{ id: 'new-dog', name: '新狗' }]
    },
    listRecords: async () => {
      recordCall += 1
      if (recordCall === 1) return firstRecords
      return { items: [] }
    }
  })
  const updates = []
  const page = {
    getTabBar: () => ({ setData() {} }),
    setData(data) { updates.push(data) }
  }
  const first = definition.onShow.call(page)
  await new Promise((resolve) => setImmediate(resolve))
  const second = definition.onShow.call(page)
  await second
  // 第二次结果已提交后，才让第一次请求返回，验证 token 保护最终状态。
  resolveFirstDogs([{ id: 'old-dog', name: '旧狗' }])
  resolveFirstRecords({ items: [] })
  await first

  const finalUpdate = updates.at(-1)
  assert.deepEqual(finalUpdate.dogs, [{ id: 'new-dog', name: '新狗' }])
})
