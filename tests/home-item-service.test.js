const test = require('node:test')
const assert = require('node:assert/strict')

const homeItemService = require('../services/homeItemService')

const NOW = new Date('2026-08-05T04:00:00.000Z')

function measurement(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'weight-1',
    dogId: 'dog-1',
    weightKg: 10.2,
    measuredOn: '2026-08-04',
    createdAt: '2026-08-04T04:00:00.000Z',
    ...overrides
  }
}

function careRecord(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'care-1',
    dogId: 'dog-1',
    type: 'vaccine',
    name: '狂犬病疫苗',
    occurredOn: '2026-08-01',
    nextDate: '2026-08-08',
    notes: '',
    createdAt: '2026-08-01T04:00:00.000Z',
    updatedAt: '2026-08-01T04:00:00.000Z',
    ...overrides
  }
}

test.afterEach(() => {
  homeItemService.__resetAdapterForTest()
})

test('首页事项只读取真实体重和用户填写的护理日期，并支持护理分页', async () => {
  const calls = []
  homeItemService.__setAdapterForTest({
    async listWeightMeasurements(options) {
      calls.push({ kind: 'weight', options })
      return { items: [measurement()] }
    },
    async listCareRecords(options) {
      calls.push({ kind: 'care', options })
      if (options.cursor) {
        return {
          items: [careRecord({ id: 'care-2', name: '', nextDate: '2026-08-06' })],
          nextCursor: null
        }
      }
      return {
        items: [
          careRecord({ id: 'care-1', nextDate: '2026-08-08' }),
          careRecord({ id: 'care-no-date', nextDate: null })
        ],
        nextCursor: 'care-page-2'
      }
    }
  })

  const items = await homeItemService.listForDogs([
    { id: 'dog-1', name: '布丁' },
    { id: 'dog-2', name: '可乐', weightKg: 8.5 }
  ], { now: NOW })

  assert.deepEqual(items.map((item) => item.key), [
    'care:dog-1:care-2',
    'care:dog-1:care-1',
    'weight:dog-1:weight-1'
  ])
  assert.equal(items[0].title, '疫苗')
  assert.match(items[0].description, /你填写的下次日期：2026年8月6日/)
  assert.equal(items[2].description, '上次记录于 1 天前')
  assert.equal(
    calls.filter((call) => call.kind === 'care' && call.options.dogId === 'dog-1').length,
    2
  )
  assert.deepEqual(calls.find((call) => call.kind === 'weight').options, {
    dogId: 'dog-1',
    limit: 1
  })
})

test('体重事项使用上海自然日计算相对时间，不把旧档案体重伪造成测量记录', () => {
  assert.equal(
    homeItemService.formatWeightAge('2026-08-05', new Date('2026-08-05T15:59:59.000Z')),
    '上次记录于今天'
  )
  assert.equal(
    homeItemService.formatWeightAge('2026-08-05', new Date('2026-08-05T16:00:00.000Z')),
    '上次记录于 1 天前'
  )
  assert.equal(homeItemService.formatWeightAge('2026-08-06', NOW), '')
})
