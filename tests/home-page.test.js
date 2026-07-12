const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

function loadHomePage({ dogService, mealPlanService, authState = 'guest' }) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'pages/home/index.js'), 'utf8')
  const getAuthState = typeof authState === 'function' ? authState : () => authState
  const dependencies = {
    '../../services/dogService': dogService,
    '../../utils/recipe': require('../utils/recipe'),
    '../../services/authService': { getAuthState },
    '../../services/mealPlanService': mealPlanService
  }
  let definition

  const context = {
    Page(page) {
      definition = page
    },
    getApp() {
      return {
        globalData: {
          authReady: Promise.resolve(),
          recipes: require('../data/recipes'),
          latestPlan: null
        }
      }
    },
    require(request) {
      if (!Object.prototype.hasOwnProperty.call(dependencies, request)) {
        throw new Error(`测试未提供依赖：${request}`)
      }
      return dependencies[request]
    },
    Promise,
    console
  }

  vm.runInNewContext(`(function () { ${source}\n })()`, context, {
    filename: 'pages/home/index.js'
  })
  return definition
}

test('游客主页不因云端数据不可用而阻断本地推荐食谱', async () => {
  const pageDefinition = loadHomePage({
    dogService: {
      listDogs: async () => {
        throw new Error('游客不应请求狗狗云函数')
      }
    },
    mealPlanService: {
      listHistory: async () => {
        throw new Error('游客不应请求历史清单云函数')
      }
    }
  })
  let viewData
  const page = {
    getTabBar: () => ({ setData() {} }),
    setData(data) {
      viewData = data
    }
  }

  await pageDefinition.onShow.call(page)

  assert.ok(viewData)
  assert.equal(viewData.authState, 'guest')
  assert.ok(viewData.recommendations.length > 0)
  assert.equal(viewData.latestPlan, null)
})

test('已登录主页在历史清单云函数失败时仍显示本地推荐食谱', async () => {
  const pageDefinition = loadHomePage({
    authState: 'logged-in',
    dogService: { listDogs: async () => [] },
    mealPlanService: {
      listHistory: async () => {
        throw new Error('FunctionName parameter could not be found')
      }
    }
  })
  let viewData
  const page = {
    getTabBar: () => ({ setData() {} }),
    setData(data) {
      viewData = data
    }
  }

  await pageDefinition.onShow.call(page)

  assert.ok(viewData)
  assert.equal(viewData.authState, 'logged-in')
  assert.ok(viewData.recommendations.length > 0)
  assert.equal(viewData.latestPlan, null)
})

test('主页使用拉取狗狗档案后的最新登录状态', async () => {
  let authState = 'logged-in'
  const pageDefinition = loadHomePage({
    authState: () => authState,
    dogService: {
      listDogs: async () => {
        authState = 'has-profile'
        return []
      }
    },
    mealPlanService: { listHistory: async () => [] }
  })
  let viewData
  const page = {
    getTabBar: () => ({ setData() {} }),
    setData(data) {
      viewData = data
    }
  }

  await pageDefinition.onShow.call(page)

  assert.equal(viewData.authState, 'has-profile')
})
