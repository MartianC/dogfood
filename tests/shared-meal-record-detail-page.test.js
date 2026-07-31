const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

function loadPage({ recordService, viewModel }) {
  const source = read('subpackages/shared-meal/record-detail/index.js')
  let definition
  const context = {
    Page(page) { definition = page },
    require(request) {
      if (request === '../../../services/sharedMealRecordService') return recordService
      if (request === './viewModel') return viewModel
      throw new Error(`测试未提供依赖：${request}`)
    },
    module: { exports: {} },
    exports: {},
    String,
    Promise,
    console
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

test('详情页结构覆盖 R01–R04 且不提供照片或重算入口', () => {
  const js = read('subpackages/shared-meal/record-detail/index.js')
  const wxml = read('subpackages/shared-meal/record-detail/index.wxml')
  const wxss = read('subpackages/shared-meal/record-detail/index.wxss')

  assert.match(js, /createSharedMealRecordDetailModel/)
  assert.match(wxml, /保存时的本餐评估/)
  assert.match(wxml, /当时的人饭菜单/)
  assert.match(wxml, /狗狗这顿吃了什么/)
  assert.match(wxml, /保存快照/)
  assert.match(wxml, /wx:if="\{\{record\.hasNote\}\}"/)
  assert.match(wxml, /record\.assessment\.energy\.tone/)
  assert.match(wxml, /record\.assessment\.nutrition\.tone/)
  assert.match(wxss, /overflow-wrap: anywhere/)
  assert.doesNotMatch(`${js}\n${wxml}`, /photo|照片|上传|重新计算|连续打卡|每日趋势/i)
  assert.doesNotMatch(wxml, /<t-/)
})
