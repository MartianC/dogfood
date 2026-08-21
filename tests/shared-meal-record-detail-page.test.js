const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function loadPage({ recordService, viewModel, draftService = {}, editableToday = false, wx = {} }) {
  const source = read('subpackages/shared-meal/record-detail/index.js')
  let definition
  const context = {
    Page(page) { definition = page },
    require(request) {
      if (request === '../../../services/sharedMealRecordService') return recordService
      if (request === '../../../services/sharedMealRecordEditability') {
        return { isSharedMealRecordEditableToday: () => editableToday }
      }
      if (request === '../services/sharedMealDraftService') return draftService
      if (request === './viewModel') return viewModel
      throw new Error(`测试未提供依赖：${request}`)
    },
    module: { exports: {} },
    exports: {},
    String,
    Promise,
    console,
    wx
  }
  vm.runInNewContext(`(function () { ${source}\n })()`, context, {
    filename: 'subpackages/shared-meal/record-detail/index.js'
  })
  return { definition, moduleExports: context.module.exports }
}

test('详情页只读取保存记录并通过纯 view model 生成页面数据', async () => {
  const calls = []
  const record = { id: 'record-1' }
  const model = { dog: { heading: '布丁的一顿饭' } }
  const { definition } = loadPage({
    recordService: {
      async get(id) {
        calls.push(id)
        return record
      }
    },
    viewModel: {
      createSharedMealRecordDetailModel(value) {
        assert.equal(value, record)
        return model
      }
    }
  })
  const data = {}
  await definition.onLoad.call({ setData(patch) { Object.assign(data, patch) } }, { recordId: 'record-1' })

  assert.deepEqual(calls, ['record-1'])
  assert.equal(data.record, model)
  assert.equal(data.loading, false)
})

test('当天详情页可以创建编辑草稿并进入 compose，历史详情不提供编辑入口', async () => {
  const calls = []
  const record = { id: 'record-today' }
  const draft = { id: 'draft-edit' }
  const { definition } = loadPage({
    recordService: { async get() { return record } },
    viewModel: { createSharedMealRecordDetailModel() { return {} } },
    draftService: {
      createDraftFromRecord(value) {
        assert.equal(value, record)
        return draft
      },
      saveDraft(value) { calls.push(['saveDraft', value]) }
    },
    editableToday: true,
    wx: {
      navigateTo(options) { calls.push(['navigateTo', options.url]) },
      showToast() {}
    }
  })
  const data = {}
  const page = {
    data,
    setData(patch) { Object.assign(data, patch) }
  }
  await definition.onLoad.call(page, { recordId: record.id })
  definition.onEdit.call(page)
  assert.deepEqual(calls, [
    ['saveDraft', draft],
    ['navigateTo', '/subpackages/shared-meal/compose/index?draftId=draft-edit']
  ])
})

test('详情页按指定顺序复用本餐评估，并不提供照片或重算入口', () => {
  const js = read('subpackages/shared-meal/record-detail/index.js')
  const json = JSON.parse(read('subpackages/shared-meal/record-detail/index.json'))
  const wxml = read('subpackages/shared-meal/record-detail/index.wxml')
  const wxss = read('subpackages/shared-meal/record-detail/index.wxss')

  assert.match(js, /createSharedMealRecordDetailModel/)
  assert.equal(json.usingComponents['ui-button'], '../../../components/ui/ui-button/index')
  assert.equal(json.usingComponents['nutrition-assessment'], '../../../components/nutrition-assessment/index')
  assert.match(wxml, /nutrition-assessment/)
  assert.match(wxml, /assessment="\{\{record\.assessmentSnapshot\}\}"/)
  assert.match(wxml, /expanded="\{\{assessmentExpanded\}\}"/)
  assert.match(wxml, /bind:toggle="onAssessmentToggle"/)
  assert.match(wxml, /compact="\{\{true\}\}"/)
  assert.match(wxml, /爱宠这顿吃了什么/)
  assert.match(wxml, /当时的人饭菜单/)
  assert.ok(wxml.indexOf('爱宠这顿吃了什么') < wxml.indexOf('当时的人饭菜单'))
  assert.ok(wxml.indexOf('当时的人饭菜单') < wxml.indexOf('nutrition-assessment'))
  assert.doesNotMatch(wxml, /保存快照/)
  assert.doesNotMatch(wxml, /保存时的本餐评估/)
  assert.doesNotMatch(wxml, /不会随标准更新而重算/)
  assert.match(wxml, /wx:if="\{\{record\.hasNote\}\}"/)
  assert.match(wxml, /shared-meal-detail-heading-row/)
  assert.match(wxml, /variant="outline"/)
  assert.match(wxml, /size="small"/)
  assert.match(wxml, /block="\{\{false\}\}"/)
  assert.doesNotMatch(wxml, /今天的狗饭可以修改，修改后会更新这条记录。/)
  assert.match(js, /assessmentExpanded: false/)
  assert.match(js, /onAssessmentToggle\(event\)/)
  assert.match(wxss, /overflow-wrap: anywhere/)
  assert.doesNotMatch(`${js}\n${wxml}`, /photo|照片|上传|重新计算|连续打卡|每日趋势/i)
  assert.doesNotMatch(wxml, /<t-/)
  assert.match(wxss, /\.shared-meal-detail-page\s*\{[\s\S]*align-content:\s*start/)
})
