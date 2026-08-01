const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function loadHomePage({ dogService, recordService, authState = 'guest' }) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'pages/home/index.js'), 'utf8')
  const getAuthState = typeof authState === 'function' ? authState : () => authState
  const dependencies = {
    '../../services/dogService': dogService,
    '../../services/authService': { getAuthState },
    '../../services/sharedMealRecordService': recordService,
    '../../services/sharedMealEntryService': { startSharedMeal: async () => ({ status: 'flow-started' }) },
    '../../services/homeStateModel': {
      recordView(record) {
        if (!record) return null
        return {
          id: record.id,
          dogName: record.dogSnapshot && record.dogSnapshot.name || '狗狗',
          menuText: (record.humanMenu || []).map((item) => item.title).filter(Boolean).join('、') || '这一顿',
          ingredientCount: (record.dogMealItems || []).length
        }
      }
    },
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
    module: { exports: {} },
    exports: {},
    Date,
    Promise,
    console
  }
  vm.runInNewContext(`(function () { ${source}\n })()`, context, { filename: 'pages/home/index.js' })
  return definition
}

test('游客主页不请求档案或记录，仍可看到本餐主入口', async () => {
  const definition = loadHomePage({
    dogService: { listDogs: async () => { throw new Error('游客不应请求档案') } },
    recordService: { list: async () => { throw new Error('游客不应请求记录') } }
  })
  let viewData
  await definition.onShow.call({
    getTabBar: () => ({ setData() {} }),
    setData(data) { viewData = data }
  })
  assert.equal(viewData.authState, 'guest')
  assert.equal(viewData.dogs.length, 0)
  assert.equal(viewData.latestRecord, null)
})

test('已登录主页在记录服务失败时仍保留主流程', async () => {
  const definition = loadHomePage({
    authState: 'logged-in',
    dogService: { listDogs: async () => [] },
    recordService: { list: async () => { throw new Error('network') } }
  })
  let viewData
  await definition.onShow.call({
    getTabBar: () => ({ setData() {} }),
    setData(data) { viewData = data }
  })
  assert.equal(viewData.authState, 'logged-in')
  assert.equal(viewData.latestRecord, null)
})

test('主页使用拉取档案后的最新登录状态并展示最近记录', async () => {
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
        items: [{
          id: 'record-1',
          dogSnapshot: { name: '布丁' },
          humanMenu: [{ title: '番茄炒蛋' }],
          dogMealItems: [{ name: '鸡蛋' }]
        }]
      })
    }
  })
  let viewData
  await definition.onShow.call({
    getTabBar: () => ({ setData() {} }),
    setData(data) { viewData = data }
  })
  assert.equal(viewData.authState, 'has-profile')
  assert.equal(viewData.latestRecord.dogName, '布丁')
  assert.equal(viewData.latestRecord.menuText, '番茄炒蛋')
})
