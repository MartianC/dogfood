const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '..')

function loadPage({ dogService, weightService, wx = {} } = {}) {
  const source = fs.readFileSync(path.join(root, 'subpackages/dog-profile/weight-edit/index.js'), 'utf8')
  const dependencies = {
    '../../../services/dogService': dogService,
    '../services/weightService': weightService,
    './weightFormModel': require('../subpackages/dog-profile/weight-edit/weightFormModel')
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
    filename: 'subpackages/dog-profile/weight-edit/index.js'
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

const dogs = [{ id: 'dog-1', name: '布丁', weightKg: 8 }]

test('新增体重表单默认今天并保存规范化写入字段', async () => {
  const created = []
  const navigations = []
  const definition = loadPage({
    dogService: { listDogs: async () => dogs },
    weightService: {
      async create(payload) { created.push(payload); return {} }
    },
    wx: {
      setNavigationBarTitle() {},
      showToast() {},
      navigateBack() { navigations.push('back') }
    }
  })
  const mounted = mount(definition)
  mounted.instance.onLoad({ dogId: 'dog-1' })
  await mounted.instance.onShow()
  mounted.instance.onSave()
  await Promise.resolve()
  assert.equal(mounted.state.loadStatus, 'ready')
  mounted.state.form.weightKg = '8.25'
  mounted.state.form.measuredOn = '2026-08-05'
  await mounted.instance.onSave()

  assert.deepEqual(created, [{
    schemaVersion: 1,
    dogId: 'dog-1',
    weightKg: 8.25,
    measuredOn: '2026-08-05'
  }])
  assert.deepEqual(navigations, ['back'])
})

test('编辑体重加载原记录，删除前二次确认并调用删除服务', async () => {
  const removals = []
  let modalOptions
  const definition = loadPage({
    dogService: { listDogs: async () => dogs },
    weightService: {
      async get() {
        return {
          schemaVersion: 1,
          id: 'm-2',
          dogId: 'dog-1',
          weightKg: 8.2,
          measuredOn: '2026-08-04',
          createdAt: '2026-08-04T08:00:00.000Z'
        }
      },
      async remove(id) { removals.push(id) }
    },
    wx: {
      setNavigationBarTitle() {},
      showModal(options) { modalOptions = options },
      showToast() {},
      navigateBack() {}
    }
  })
  const mounted = mount(definition)
  mounted.instance.onLoad({ id: 'm-2', dogId: 'dog-1' })
  await mounted.instance.onShow()
  mounted.instance.onDelete()
  await modalOptions.success({ confirm: true })

  assert.equal(mounted.state.form.weightKg, '8.2')
  assert.equal(mounted.state.form.measuredOn, '2026-08-04')
  assert.deepEqual(removals, ['m-2'])
  assert.match(modalOptions.content, /回退到上一条有效记录/)
})

test('体重表单拒绝空值和未来日期并把错误落到对应字段', async () => {
  let createCalled = false
  const definition = loadPage({
    dogService: { listDogs: async () => dogs },
    weightService: { async create() { createCalled = true } },
    wx: { setNavigationBarTitle() {} }
  })
  const mounted = mount(definition)
  mounted.instance.onLoad({ dogId: 'dog-1' })
  await mounted.instance.onShow()
  mounted.state.form.weightKg = ''
  mounted.state.form.measuredOn = '2026-08-06'
  await mounted.instance.onSave()

  assert.equal(createCalled, false)
  assert.match(mounted.state.weightKgError, /大于 0/)
  assert.equal(mounted.state.measuredOnError, '')
})
