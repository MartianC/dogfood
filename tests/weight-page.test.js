const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '..')

function loadPage({ dogService, weightService, wx = {} } = {}) {
  const source = fs.readFileSync(path.join(root, 'subpackages/dog-profile/weight/index.js'), 'utf8')
  const dependencies = {
    '../../../services/dogService': dogService,
    '../services/weightService': weightService,
    '../../../services/weightContract': {
      dateTextInShanghai: () => '2026-08-05'
    },
    './weightTrendModel': require('../subpackages/dog-profile/weight/weightTrendModel')
  }
  let definition
  const context = {
    Page(page) { definition = page },
    require(request) {
      if (!Object.prototype.hasOwnProperty.call(dependencies, request)) {
        throw new Error(`测试未提供依赖：${request}`)
      }
      return dependencies[request]
    },
    wx,
    console,
    module: { exports: {} },
    exports: {}
  }
  vm.runInNewContext(`(function () { ${source}\n })()`, context, {
    filename: 'subpackages/dog-profile/weight/index.js'
  })
  return definition
}

function mount(definition) {
  const state = { ...definition.data }
  const instance = {
    ...definition,
    data: state,
    setData(next) { Object.assign(state, next) }
  }
  return {
    state,
    instance
  }
}

const dogs = [
  { id: 'dog-1', name: '布丁', weightKg: 8 },
  { id: 'dog-2', name: '年糕', weightKg: null }
]

const records = [
  {
    schemaVersion: 1,
    id: 'm-2',
    dogId: 'dog-1',
    weightKg: 8.2,
    measuredOn: '2026-08-04',
    createdAt: '2026-08-04T08:00:00.000Z'
  },
  {
    schemaVersion: 1,
    id: 'm-1',
    dogId: 'dog-1',
    weightKg: 8,
    measuredOn: '2026-08-01',
    createdAt: '2026-08-01T08:00:00.000Z'
  }
]

test('体重趋势页加载指定狗狗、当前值和历史记录', async () => {
  const calls = []
  const definition = loadPage({
    dogService: { listDogs: async () => dogs },
    weightService: {
      async list(options) {
        calls.push(options)
        return { items: records, nextCursor: null }
      }
    },
    wx: { setNavigationBarTitle() {} }
  })
  const mounted = mount(definition)
  mounted.instance.onLoad({ dogId: 'dog-1' })
  await mounted.instance.onShow()

  assert.equal(mounted.state.loadStatus, 'ready')
  assert.equal(mounted.state.dogName, '布丁')
  assert.equal(mounted.state.currentWeightText, '8.2 kg')
  assert.equal(mounted.state.historyItems.length, 2)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].dogId, 'dog-1')
  assert.equal(calls[0].limit, 50)
})

test('体重趋势页支持切换狗狗、加载更多和进入编辑页', async () => {
  const navigations = []
  const calls = []
  const definition = loadPage({
    dogService: { listDogs: async () => dogs },
    weightService: {
      async list(options) {
        calls.push(options)
        return options.cursor
          ? { items: [records[1]], nextCursor: null }
          : { items: [records[0]], nextCursor: 'cursor-1' }
      }
    },
    wx: {
      setNavigationBarTitle() {},
      navigateTo(options) { navigations.push(options.url) }
    }
  })
  const mounted = mount(definition)
  mounted.instance.onLoad({ dogId: 'dog-1' })
  await mounted.instance.onShow()
  await mounted.instance.onDogChange({ detail: { value: '1' } })
  mounted.state.nextCursor = 'cursor-1'
  mounted.state.dogId = 'dog-1'
  mounted.state.dogIndex = 0
  mounted.state.measurements = [records[0]]
  await mounted.instance.onLoadMore()
  mounted.instance.onAddWeight()
  mounted.instance.onEditWeight({ currentTarget: { dataset: { id: 'm-2' } } })

  assert.equal(calls[1].dogId, 'dog-2')
  assert.equal(calls[2].cursor, 'cursor-1')
  assert.deepEqual(navigations, [
    '/subpackages/dog-profile/weight-edit/index?dogId=dog-1',
    '/subpackages/dog-profile/weight-edit/index?dogId=dog-1&id=m-2'
  ])
})

test('体重趋势页无狗狗档案时展示空态入口，失败时保留重试状态', async () => {
  const navigations = []
  const definition = loadPage({
    dogService: { listDogs: async () => [] },
    weightService: { list: async () => ({ items: [], nextCursor: null }) },
    wx: {
      setNavigationBarTitle() {},
      navigateTo(options) { navigations.push(options.url) }
    }
  })
  const mounted = mount(definition)
  mounted.instance.onLoad({})
  await mounted.instance.onShow()
  mounted.instance.onAddDog()

  assert.equal(mounted.state.loadStatus, 'empty')
  assert.deepEqual(navigations, ['/subpackages/dog-profile/dog-edit/index'])
})

test('体重页面注册任务型分包路由并复用 UI Kernel，不直接使用 TDesign 或底部 TabBar', () => {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  const dogProfile = app.subpackages.find((item) => item.root === 'subpackages/dog-profile')
  const wxml = fs.readFileSync(path.join(root, 'subpackages/dog-profile/weight/index.wxml'), 'utf8')
  const editWxml = fs.readFileSync(path.join(root, 'subpackages/dog-profile/weight-edit/index.wxml'), 'utf8')

  assert.ok(dogProfile.pages.includes('weight/index'))
  assert.ok(dogProfile.pages.includes('weight-edit/index'))
  assert.match(wxml, /weight-chart/)
  assert.match(wxml, /weight-chart-y-axis/)
  assert.match(wxml, /chartAxisMiddleLabel/)
  assert.match(wxml, /ui-empty|ui-notice|ui-card/)
  assert.match(editWxml, /删除这次测量|回退规则/)
  assert.doesNotMatch(`${wxml}\n${editWxml}`, /<t-[a-z-]+/)
  assert.doesNotMatch(`${wxml}\n${editWxml}`, /with-tab-bar|custom-tab-bar/)
})
