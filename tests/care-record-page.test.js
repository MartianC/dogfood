const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '..')

function loadPage(relativePath, dependencies, wx = {}) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
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
    Promise,
    console
  }
  vm.runInNewContext(`(function () { ${source}\n })()`, context, { filename: relativePath })
  return definition
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function createPageInstance(definition) {
  const page = {
    data: clone(definition.data),
    setData(nextData) {
      Object.entries(nextData).forEach(([key, value]) => {
        const parts = key.split('.')
        let target = this.data
        parts.slice(0, -1).forEach((part) => {
          if (!target[part] || typeof target[part] !== 'object') target[part] = {}
          target = target[part]
        })
        target[parts[parts.length - 1]] = value
      })
    }
  }
  Object.entries(definition).forEach(([key, value]) => {
    if (typeof value === 'function') page[key] = value
  })
  return page
}

function pageDependencies({ dogs, careRecordService }) {
  return {
    '../../../services/dogService': { listDogs: async () => dogs },
    '../services/careRecordService': careRecordService,
    '../services/careRecordPageModel': require('../subpackages/dog-profile/services/careRecordPageModel')
  }
}

function record(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'care-1',
    dogId: 'dog-2',
    type: 'vaccine',
    name: '狂犬病疫苗',
    occurredOn: '2026-08-01',
    nextDate: null,
    notes: '社区动物医院\n保留长备注',
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
    ...overrides
  }
}

test('护理列表页按请求狗狗加载、筛选和稳定分页，不混合多狗记录', async () => {
  const dogs = [{ id: 'dog-1', name: '布丁' }, { id: 'dog-2', name: '年糕' }]
  const calls = []
  const service = {
    async list(options) {
      calls.push(options)
      return {
        items: [record({ id: options.cursor ? 'care-2' : 'care-1', dogId: options.dogId })],
        nextCursor: options.cursor ? null : 'cursor-1'
      }
    },
    async delete() {}
  }
  const definition = loadPage(
    'subpackages/dog-profile/care-record/index.js',
    pageDependencies({ dogs, careRecordService: service })
  )
  const page = createPageInstance(definition)

  await definition.onLoad.call(page, { dogId: 'dog-2' })
  assert.equal(page.data.dogId, 'dog-2')
  assert.equal(page.data.dogName, '年糕')
  assert.equal(page.data.records[0].id, 'care-1')
  assert.equal(page.data.records[0].nextDateText, '未填写下次')

  await definition.onFilter.call(page, { currentTarget: { dataset: { value: 'vaccine' } } })
  assert.equal(calls.at(-1).dogId, 'dog-2')
  assert.equal(calls.at(-1).type, 'vaccine')

  await definition.loadMore.call(page)
  assert.equal(page.data.records.length, 2)
  assert.equal(calls.at(-1).cursor, 'cursor-1')
  assert.ok(page.data.records.every((item) => item.dogId === 'dog-2'))
})

test('护理列表页的空狗状态提供档案入口，编辑和新增使用任务型路由', async () => {
  const navigations = []
  const wx = { navigateTo(options) { navigations.push(options.url) } }
  const definition = loadPage(
    'subpackages/dog-profile/care-record/index.js',
    pageDependencies({ dogs: [], careRecordService: { list: async () => ({ items: [] }) } }),
    wx
  )
  const page = createPageInstance(definition)
  await definition.onLoad.call(page, {})
  assert.equal(page.data.errorCode, 'NO_DOG')
  definition.onAddDog.call(page)
  assert.equal(navigations[0], '/subpackages/dog-profile/dog-edit/index')

  page.setData({ dogId: 'dog-2' })
  definition.onAdd.call(page)
  definition.onEdit.call(page, { currentTarget: { dataset: { id: 'care-1' } } })
  assert.deepEqual(navigations.slice(1), [
    '/subpackages/dog-profile/care-edit/index?dogId=dog-2',
    '/subpackages/dog-profile/care-edit/index?id=care-1&dogId=dog-2'
  ])
})

test('护理表单页新增时保留狗狗、类型、日期和长备注，并调用 create', async () => {
  const calls = []
  const service = {
    async create(payload) { calls.push(payload); return record(payload) },
    async get() { throw new Error('不应读取编辑记录') },
    async delete() {}
  }
  const wx = {
    showToast() {},
    navigateBack() {},
    setNavigationBarTitle() {}
  }
  const definition = loadPage(
    'subpackages/dog-profile/care-edit/index.js',
    pageDependencies({ dogs: [{ id: 'dog-2', name: '年糕' }], careRecordService: service }),
    wx
  )
  const page = createPageInstance(definition)
  await definition.onLoad.call(page, { dogId: 'dog-2' })
  definition.onTypeChange.call(page, { detail: { value: 3 } })
  definition.onTextInput.call(page, {
    currentTarget: { dataset: { key: 'name' } },
    detail: { value: '洗澡' }
  })
  definition.onOccurredDate.call(page, { detail: { value: '2026-08-01' } })
  definition.onNextDate.call(page, { detail: { value: '2026-09-01' } })
  definition.onTextInput.call(page, {
    currentTarget: { dataset: { key: 'notes' } },
    detail: { value: '很长的事实备注\n第二行' }
  })
  await definition.onSave.call(page)

  assert.deepEqual(calls[0], {
    schemaVersion: 1,
    dogId: 'dog-2',
    type: 'other',
    name: '洗澡',
    occurredOn: '2026-08-01',
    nextDate: '2026-09-01',
    notes: '很长的事实备注\n第二行'
  })
})

test('护理表单页编辑读取记录并禁止更换狗狗，保存失败显示日期字段错误', async () => {
  const calls = []
  const service = {
    async get(id) { assert.equal(id, 'care-1'); return record() },
    async update(id, payload) {
      calls.push({ id, payload })
      throw new Error('下次护理日期不能早于发生日期')
    },
    async create() { throw new Error('不应创建编辑记录') },
    async delete() {}
  }
  const wx = { showToast() {}, navigateBack() {}, setNavigationBarTitle() {} }
  const definition = loadPage(
    'subpackages/dog-profile/care-edit/index.js',
    pageDependencies({ dogs: [{ id: 'dog-1', name: '布丁' }, { id: 'dog-2', name: '年糕' }], careRecordService: service }),
    wx
  )
  const page = createPageInstance(definition)
  await definition.onLoad.call(page, { id: 'care-1', dogId: 'dog-1' })
  assert.equal(page.data.dogId, 'dog-2')
  assert.equal(page.data.form.name, '狂犬病疫苗')
  definition.onDogChange.call(page, { detail: { value: 0 } })
  assert.equal(page.data.dogId, 'dog-2')

  await definition.onSave.call(page)
  assert.equal(calls[0].id, 'care-1')
  assert.equal(page.data.occurredOnError, '')
  assert.equal(page.data.nextDateError, '下次护理日期不能早于发生日期')
  assert.equal(page.data.formError, '')
})

test('护理页面文件注册任务型路由并复用 UI Kernel，不直接使用 TDesign 标签或底部 TabBar', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
  const dogProfile = config.subpackages.find((item) => item.root === 'subpackages/dog-profile')
  assert.ok(dogProfile.pages.includes('care-record/index'))
  assert.ok(dogProfile.pages.includes('care-edit/index'))

  const files = [
    'subpackages/dog-profile/care-record/index',
    'subpackages/dog-profile/care-edit/index'
  ]
  files.forEach((base) => {
    const wxml = fs.readFileSync(path.join(root, `${base}.wxml`), 'utf8')
    const json = JSON.parse(fs.readFileSync(path.join(root, `${base}.json`), 'utf8'))
    assert.match(wxml, /class="page [^"]+"/)
    assert.doesNotMatch(wxml, /with-tab-bar/)
    assert.doesNotMatch(wxml, /<t-[a-z]/)
    assert.ok(Object.keys(json.usingComponents).some((name) => name.startsWith('ui-')))
  })
})
