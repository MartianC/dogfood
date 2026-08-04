const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '..')

function loadDogsPage({
  authService,
  dogService,
  assets = { defaultDogAvatar: '/assets/dogs/default-dog.jpg' },
  wx = { navigateTo() {} }
}) {
  const source = fs.readFileSync(path.join(root, 'pages/dogs/index.js'), 'utf8')
  const dependencies = {
    '../../services/authService': authService,
    '../../services/dogService': dogService,
    '../../utils/risk': { dietGoalLabels: { daily: '日常' } },
    '../../utils/assets': assets
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
    wx,
    Promise,
    console
  }
  vm.runInNewContext(`(function () { ${source}\n })()`, context, { filename: 'pages/dogs/index.js' })
  return definition
}

test('狗狗页显示时加载最新档案并同步狗狗 Tab 选中态', async () => {
  const authService = { getAuthState: () => 'authenticated' }
  const dogs = [{ id: 'dog-1', name: '布丁' }]
  const dogService = { listDogs: async () => dogs }
  const definition = loadDogsPage({ authService, dogService })
  let viewData
  let selected

  await definition.onShow.call({
    getTabBar: () => ({ setData(data) { selected = data.selected } }),
    setData(data) { viewData = data }
  })

  assert.equal(selected, 'dogs')
  assert.equal(viewData.authState, 'authenticated')
  assert.deepEqual(viewData.dogs, dogs)
})

test('狗狗页的游客登录、添加、体重和护理入口都进入对应页面', async () => {
  const navigations = []
  const authService = {
    getAuthState: () => 'guest',
    login: async () => true
  }
  const definition = loadDogsPage({
    authService,
    dogService: { listDogs: async () => [] },
    wx: { navigateTo(options) { navigations.push(options.url) } }
  })

  await definition.onLogin.call({ setData() {} })
  definition.onAddDog.call({ setData() {} })
  definition.onEditDogPanel.call({ setData() {} }, { currentTarget: { dataset: { id: 'dog-1' } } })
  definition.onViewWeight.call({ setData() {} }, { currentTarget: { dataset: { id: 'dog-1' } } })
  definition.onViewCare.call({ setData() {} }, { currentTarget: { dataset: { id: 'dog-1' } } })

  assert.deepEqual(navigations, [
    '/subpackages/dog-profile/dog-edit/index',
    '/subpackages/dog-profile/dog-edit/index',
    '/subpackages/dog-profile/dog-edit/index?id=dog-1',
    '/subpackages/dog-profile/weight/index?dogId=dog-1',
    '/subpackages/dog-profile/care-record/index?dogId=dog-1'
  ])
})

test('狗狗页提供体重和护理入口，但不提前接入统一时间轴', () => {
  const wxml = fs.readFileSync(path.join(root, 'pages/dogs/index.wxml'), 'utf8')
  const js = fs.readFileSync(path.join(root, 'pages/dogs/index.js'), 'utf8')

  assert.match(wxml, /登录后管理狗狗档案/)
  assert.match(wxml, /狗狗档案/)
  assert.match(wxml, /还没有狗狗档案/)
  assert.match(wxml, /wx:for="\{\{dogs\}\}"/)
  assert.match(`${js}\n${wxml}`, /体重趋势|记录第一次体重/)
  assert.match(`${js}\n${wxml}`, /护理记录|care-record/)
  assert.doesNotMatch(`${js}\n${wxml}`, /疫苗|驱虫|统一时间轴/)
  assert.doesNotMatch(wxml, /navigator[^>]+pages\/dogs|bind:tap="onViewDog"/)
})
