const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const servicePath = path.join(__dirname, '..', 'services/sharedMealEntryService.js')

function loadEntryService({ authState = 'guest', login = async () => true, dogs = [], authReady = null } = {}) {
  const source = fs.readFileSync(servicePath, 'utf8')
  const navigations = []
  let listDogsCalls = 0
  const dependencies = {
    './authService': {
      getAuthState: () => authState,
      login
    },
    './dogService': {
      async listDogs() {
        listDogsCalls += 1
        return typeof dogs === 'function' ? dogs() : dogs
      }
    }
  }
  const context = {
    require(request) {
      if (!Object.prototype.hasOwnProperty.call(dependencies, request)) {
        throw new Error(`测试未提供依赖：${request}`)
      }
      return dependencies[request]
    },
    getApp: () => ({ globalData: { authReady } }),
    wx: {
      navigateTo(options) {
        navigations.push(options.url)
      }
    },
    module: { exports: {} },
    exports: {},
    Promise,
    encodeURIComponent
  }
  vm.runInNewContext(`(function () { ${source}\n })()`, context, { filename: servicePath })
  return {
    service: context.module.exports,
    navigations,
    getListDogsCalls: () => listDogsCalls
  }
}

test('游客登录成功后恢复原记餐意图并进入现有流程', async () => {
  let loginCalls = 0
  const { service, navigations } = loadEntryService({
    login: async () => {
      loginCalls += 1
      return true
    },
    dogs: [{ id: 'dog-1' }, { id: 'dog-2' }]
  })

  const result = await service.startSharedMeal()

  assert.equal(loginCalls, 1)
  assert.equal(result.status, 'flow-started')
  assert.deepEqual(navigations, ['/subpackages/shared-meal/dog-select/index'])
})

test('登录失败时停留在原页面且不读取档案', async () => {
  const { service, navigations, getListDogsCalls } = loadEntryService({
    login: async () => false
  })

  const result = await service.startSharedMeal()

  assert.equal(result.status, 'login-failed')
  assert.equal(result.navigated, false)
  assert.equal(getListDogsCalls(), 0)
  assert.deepEqual(navigations, [])
})

test('单只狗狗直接进入选菜页并传递狗狗 ID', async () => {
  const { service, navigations } = loadEntryService({
    authState: 'has-profile',
    dogs: [{ id: 'dog-1' }]
  })

  const result = await service.startSharedMeal()

  assert.equal(result.status, 'menu-started')
  assert.equal(result.url, '/subpackages/shared-meal/menu-search/index?dogId=dog-1')
  assert.deepEqual(navigations, [result.url])
})

test('单只狗狗的档案分支由选菜分包继续处理', async () => {
  const { service, navigations } = loadEntryService({
    authState: 'has-profile',
    dogs: [{ id: 'dog-1', eligibility: { status: 'incomplete', reasonCodes: [] } }]
  })

  const result = await service.startSharedMeal()

  assert.equal(result.status, 'menu-started')
  assert.deepEqual(navigations, ['/subpackages/shared-meal/menu-search/index?dogId=dog-1'])
})

test('已登录但无档案时进入快速建档并保留记餐返回地址', async () => {
  const { service, navigations } = loadEntryService({ authState: 'logged-in', dogs: [] })

  const result = await service.startSharedMeal()

  assert.equal(result.status, 'profile-required')
  assert.equal(
    decodeURIComponent(navigations[0]),
    '/subpackages/dog-profile/dog-quick-create/index?redirect=/subpackages/shared-meal/dog-select/index'
  )
})

test('多只已有档案时统一交给选狗页显式选择', async () => {
  const { service, navigations } = loadEntryService({
    authState: 'has-profile',
    dogs: [{ id: 'dog-1' }, { id: 'dog-2' }]
  })

  await service.startSharedMeal()

  assert.deepEqual(navigations, ['/subpackages/shared-meal/dog-select/index'])
})

test('底部圆形入口跳过人饭菜单并由选狗页直接创建狗饭', async () => {
  const { service, navigations } = loadEntryService({
    authState: 'has-profile',
    dogs: [{ id: 'dog-1' }]
  })

  const result = await service.startSharedMeal({ skipHumanMenu: true })

  assert.equal(result.status, 'flow-started')
  assert.equal(result.url, '/subpackages/shared-meal/dog-select/index?skipHumanMenu=1')
  assert.deepEqual(navigations, [result.url])
})

test('底部圆形入口在无档案时保留跳过人饭菜单的返回意图', async () => {
  const { service, navigations } = loadEntryService({ authState: 'logged-in', dogs: [] })

  await service.startSharedMeal({ skipHumanMenu: true })

  assert.equal(
    decodeURIComponent(navigations[0]),
    '/subpackages/dog-profile/dog-quick-create/index?redirect=/subpackages/shared-meal/dog-select/index?skipHumanMenu=1'
  )
})

test('连续点击复用同一次入口请求，避免重复登录和重复导航', async () => {
  let resolveLogin
  let loginCalls = 0
  const login = () => {
    loginCalls += 1
    return new Promise((resolve) => { resolveLogin = resolve })
  }
  const { service, navigations } = loadEntryService({ login, dogs: [{ id: 'dog-1' }, { id: 'dog-2' }] })

  const first = service.startSharedMeal()
  const second = service.startSharedMeal()
  resolveLogin(true)
  const [firstResult, secondResult] = await Promise.all([first, second])

  assert.equal(loginCalls, 1)
  assert.equal(firstResult.status, 'flow-started')
  assert.equal(secondResult.status, 'flow-started')
  assert.deepEqual(navigations, ['/subpackages/shared-meal/dog-select/index'])
})

test('首页和记录页只调用同一个入口服务，不复制守卫与草稿判断', () => {
  for (const relativePath of ['pages/home/index.js', 'pages/records/index.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8')
    assert.match(source, /sharedMealEntryService\.startSharedMeal\(\)/, relativePath)
    assert.doesNotMatch(source, /shared-meal\/dog-select|sharedMealDogEligibility|sharedMealDraftService/, relativePath)
  }
})

test('只有底部圆形入口传入跳过人饭菜单选项', () => {
  const tabBar = fs.readFileSync(path.join(__dirname, '..', 'custom-tab-bar/index.js'), 'utf8')

  assert.match(tabBar, /startSharedMeal\(\{ skipHumanMenu: true \}\)/)
})
