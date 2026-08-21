const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
}

test('记录列表与详情展示当天编辑入口，详情复用统一本餐评估', () => {
  const listJs = read('pages/records/index.js')
  const listWxml = read('pages/records/index.wxml')
  const detailJs = read('subpackages/shared-meal/record-detail/index.js')
  const detailWxml = read('subpackages/shared-meal/record-detail/index.wxml')
  assert.match(listJs, /sharedMealRecordService\.createUnifiedRecordTimelineState/)
  assert.match(listJs, /onOpenRecord/)
  assert.match(listWxml, /ui-tag/)
  assert.match(listWxml, /records-dog-group/)
  assert.match(detailJs, /sharedMealRecordService\.get/)
  assert.match(detailWxml, /nutrition-assessment/)
  assert.match(detailWxml, /expanded="\{\{assessmentExpanded\}\}"/)
  assert.match(detailWxml, /修改这顿/)
  assert.doesNotMatch(detailWxml, /今天的狗饭可以修改，修改后会更新这条记录。/)
  assert.doesNotMatch(detailWxml, /保存快照|不会随标准更新而重算/)
  assert.doesNotMatch(`${listWxml}${detailWxml}`, /连续打卡|长期完整|每日趋势/)
})
