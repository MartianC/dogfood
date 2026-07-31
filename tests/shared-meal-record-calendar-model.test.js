const test = require('node:test')
const assert = require('node:assert/strict')

const {
  shanghaiDateKey,
  createRecordCalendarModel
} = require('../services/sharedMealRecordCalendarModel')

test('上海自然日在 UTC 16 点跨日且不依赖运行环境时区', () => {
  assert.equal(shanghaiDateKey('2026-07-30T15:59:59.999Z'), '2026-07-30')
  assert.equal(shanghaiDateKey('2026-07-30T16:00:00.000Z'), '2026-07-31')
  assert.equal(shanghaiDateKey('invalid'), null)
  assert.equal(shanghaiDateKey(null), null)
})

test('日历模型建立日期索引、打卡日期和选中日列表并保持输入顺序', () => {
  const records = [
    { id: 'late', mealTime: '2026-07-30T12:00:00.000Z' },
    { id: 'early', mealTime: '2026-07-30T01:00:00.000Z' },
    { id: 'next-day', mealTime: '2026-07-30T16:00:00.000Z' }
  ]
  const model = createRecordCalendarModel(records, {
    monthKey: '2026-07',
    selectedDateKey: '2026-07-30'
  })

  assert.deepEqual(model.markedDateKeys, ['2026-07-30', '2026-07-31'])
  assert.deepEqual(model.recordsByDate['2026-07-30'].map((item) => item.id), ['late', 'early'])
  assert.deepEqual(model.selectedRecords.map((item) => item.id), ['late', 'early'])
  assert.deepEqual(model.calendarDays, [
    { dateKey: '2026-07-30', hasRecords: true, recordCount: 2, suffix: '已记' },
    { dateKey: '2026-07-31', hasRecords: true, recordCount: 1, suffix: '已记' }
  ])
})

test('选中无记录日期返回空列表，月外记录不生成当前月标记', () => {
  const model = createRecordCalendarModel([
    { id: 'june', mealTime: '2026-06-30T10:00:00.000Z' },
    { id: 'july', mealTime: '2026-07-01T10:00:00.000Z' },
    { id: 'august', mealTime: '2026-08-01T10:00:00.000Z' }
  ], {
    monthKey: '2026-07',
    selectedDateKey: '2026-07-02'
  })

  assert.deepEqual(model.markedDateKeys, ['2026-07-01'])
  assert.deepEqual(model.selectedRecords, [])
  assert.deepEqual(Object.keys(model.recordsByDate), ['2026-07-01'])
})

test('无效时间进入明确降级组且不会污染日历日期', () => {
  const invalidRecords = [
    { id: 'missing' },
    { id: 'broken', mealTime: 'not-a-time' }
  ]
  const model = createRecordCalendarModel(invalidRecords, {
    monthKey: '2026-07',
    selectedDateKey: '2026-07-30'
  })

  assert.deepEqual(model.markedDateKeys, [])
  assert.deepEqual(model.selectedRecords, [])
  assert.deepEqual(model.invalidGroup, {
    dateKey: 'invalid',
    label: '时间无效',
    records: invalidRecords
  })
})
