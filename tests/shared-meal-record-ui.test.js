const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

function read(file) {
  return fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
}

test('记录列表与详情只展示单餐不可变快照和责任边界', () => {
  const listJs = read('pages/records/index.js')
  const listWxml = read('pages/records/index.wxml')
  const detailJs = read('subpackages/shared-meal/record-detail/index.js')
  const detailWxml = read('subpackages/shared-meal/record-detail/index.wxml')
  assert.match(listJs, /sharedMealRecordService\.createUnifiedRecordTimelineState/)
  assert.match(listJs, /onOpenRecord/)
  assert.match(listWxml, /ui-tag/)
  assert.match(listWxml, /records-dog-group/)
  assert.match(detailJs, /sharedMealRecordService\.get/)
  assert.match(detailWxml, /保存时的本餐评估/)
  assert.match(detailWxml, /不会随标准更新而重算/)
  assert.doesNotMatch(`${listWxml}${detailWxml}`, /连续打卡|长期完整|每日趋势/)
})
