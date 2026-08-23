const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createUnifiedRecordTimelineModel,
  selectUnifiedRecordTimelineModel,
  sortUnifiedRecords,
  shanghaiDateKey,
  defaultSelectedDateKey
} = require('../services/unifiedRecordTimelineModel')

const dogs = [
  { id: 'dog-1', name: '布丁' },
  { id: 'dog-2', name: '奶糖' }
]

const sourceItems = {
  meal: [
    {
      id: 'meal-late',
      targetDogId: 'dog-1',
      mealTime: '2026-08-05T02:10:00.000Z',
      dogSnapshot: { id: 'dog-1', name: '布丁' },
      humanMenu: [{ title: '鸡胸南瓜' }],
      dogMealItems: [{}, {}]
    },
    {
      id: 'meal-early',
      targetDogId: 'dog-2',
      mealTime: '2026-08-05T00:10:00.000Z',
      dogSnapshot: { id: 'dog-2', name: '奶糖' },
      humanMenu: [{ title: '牛肉胡萝卜' }],
      dogMealItems: [{}]
    }
  ],
  weight: [{
    id: 'weight-1',
    dogId: 'dog-1',
    weightKg: 8.2,
    measuredOn: '2026-08-05',
    createdAt: '2026-08-05T03:00:00.000Z'
  }],
  care: [{
    id: 'care-1',
    dogId: 'dog-1',
    type: 'vaccine',
    name: '',
    occurredOn: '2026-08-05',
    nextDate: '2027-08-05',
    createdAt: '2026-08-05T04:00:00.000Z'
  }]
}

test('统一记录模型按上海自然日和来源规则排序，并把三类记录规范化', () => {
  assert.equal(shanghaiDateKey('2026-08-04T16:00:00.000Z'), '2026-08-05')
  assert.equal(defaultSelectedDateKey('2026-08', new Date('2026-08-04T16:00:00.000Z')), '2026-08-05')
  assert.equal(defaultSelectedDateKey('2026-07', new Date('2026-08-04T16:00:00.000Z')), '2026-07-01')

  const model = createUnifiedRecordTimelineModel({
    dogs,
    sources: {
      meal: { status: 'success', items: sourceItems.meal },
      weight: { status: 'success', items: sourceItems.weight },
      care: { status: 'success', items: sourceItems.care }
    },
    monthKey: '2026-08',
    selectedDateKey: '2026-08-05'
  })

  assert.equal(model.status, 'success')
  assert.deepEqual(model.records.map((record) => record.id), [
    'meal:meal-late',
    'meal:meal-early',
    'weight:weight-1',
    'care:care-1'
  ])
  assert.deepEqual(model.records.map((record) => record.precision), [
    'datetime',
    'datetime',
    'date',
    'date'
  ])
  assert.equal(model.records[0].title, '10:10 · 布丁')
  assert.equal(model.records[2].summary, '8.2 kg · 2026年8月5日')
  assert.equal(model.records[3].title, '疫苗')
  assert.equal(model.records[3].summary, '2026年8月5日 · 下次 2027年8月5日')
  assert.deepEqual(model.calendarDays, [{
    dateKey: '2026-08-05',
    hasRecords: true,
    recordCount: 4,
    marker: 'dot',
    showDot: true,
    suffix: ''
  }])
  assert.equal(JSON.stringify(model.records).includes('dogSnapshot'), false)
})

test('多狗只生成有记录的分组并默认展开第一组，单狗直接返回记录列表', () => {
  const multiDog = createUnifiedRecordTimelineModel({
    dogs: [...dogs, { id: 'dog-3', name: '阿福' }],
    sources: { meal: sourceItems.meal },
    monthKey: '2026-08',
    selectedDateKey: '2026-08-05'
  })
  assert.deepEqual(multiDog.dogGroups.map((group) => ({
    dogId: group.dogId,
    recordCount: group.recordCount,
    expanded: group.expanded
  })), [
    { dogId: 'dog-1', recordCount: 1, expanded: true },
    { dogId: 'dog-2', recordCount: 1, expanded: false }
  ])
  assert.equal(multiDog.dogGroups.some((group) => group.dogId === 'dog-3'), false)
  assert.equal('recordCountText' in multiDog.dogGroups[0], false)

  const emptyDate = selectUnifiedRecordTimelineModel(multiDog, {
    selectedDateKey: '2026-08-06'
  })
  assert.deepEqual(emptyDate.dogGroups, [])

  const singleDog = createUnifiedRecordTimelineModel({
    dogs: [dogs[0]],
    sources: { weight: sourceItems.weight },
    monthKey: '2026-08',
    selectedDateKey: '2026-08-05'
  })
  assert.equal(singleDog.layout, 'single-dog')
  assert.deepEqual(singleDog.dogGroups, [])
  assert.deepEqual(singleDog.displayRecords.map((record) => record.id), ['weight:weight-1'])
})

test('显式展开状态只影响狗狗分组，不改变记录排序', () => {
  const model = createUnifiedRecordTimelineModel({
    dogs,
    sources: { meal: sourceItems.meal },
    monthKey: '2026-08',
    selectedDateKey: '2026-08-05'
  })
  const selected = selectUnifiedRecordTimelineModel(model, {
    expandedDogIds: ['dog-2']
  })
  assert.deepEqual(selected.dogGroups.map((group) => group.expanded), [false, true])
  assert.deepEqual(selected.records.map((record) => record.id), [
    'meal:meal-late',
    'meal:meal-early'
  ])
})

test('明确全部收起后切换日期仍保留收起意图，空日期不生成狗狗分组', () => {
  const model = createUnifiedRecordTimelineModel({
    dogs,
    sources: { meal: sourceItems.meal },
    monthKey: '2026-08',
    selectedDateKey: '2026-08-05'
  })
  assert.equal(model.expandedDogIds, null)
  const collapsed = selectUnifiedRecordTimelineModel(model, { expandedDogIds: [] })
  const nextDate = selectUnifiedRecordTimelineModel(collapsed, { selectedDateKey: '2026-08-04' })
  assert.deepEqual(nextDate.dogGroups, [])
  assert.deepEqual(nextDate.expandedDogIds, [])
})

test('排序函数对同源同日记录使用稳定 ID 作为最终排序键', () => {
  const records = [
    { id: 'weight:b', source: 'weight', dateKey: '2026-08-05', sortKey: '2026-08-05T00:00:00.000+08:00', tieKey: 'same' },
    { id: 'weight:a', source: 'weight', dateKey: '2026-08-05', sortKey: '2026-08-05T00:00:00.000+08:00', tieKey: 'same' }
  ]
  assert.deepEqual(sortUnifiedRecords(records).map((record) => record.id), ['weight:b', 'weight:a'])
})
