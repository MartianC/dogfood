const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  createUnifiedRecordTimelineService,
  createUnifiedRecordTimelineState,
  readAllPages,
  monthDateRange
} = require('../services/unifiedRecordTimelineService')

const dogs = [
  { id: 'dog-1', name: '布丁' },
  { id: 'dog-2', name: '奶糖' }
]

test('统一记录时间轴的默认数据源不直接依赖狗狗分包 service', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'services/unifiedRecordTimelineService.js'),
    'utf8'
  )
  assert.doesNotMatch(source, /subpackages\/dog-profile\/services\/(?:weight|care)(?:Record)?Service/)
  assert.match(source, /dogRecordQueryService/)
})

test('统一记录来源查询使用当月左闭右开日期范围', () => {
  assert.deepEqual(monthDateRange('2026-08'), {
    startDate: '2026-08-01',
    endDate: '2026-09-01'
  })
  assert.deepEqual(monthDateRange('2026-12'), {
    startDate: '2026-12-01',
    endDate: '2027-01-01'
  })
})

test('R2.1 按月份读取三类独立服务，分页后过滤月份并保留来源状态', async () => {
  const calls = { meal: [], weight: [], care: [] }
  const service = createUnifiedRecordTimelineService({
    listDogs: async () => dogs,
    listMeals: async (options) => {
      calls.meal.push(options)
      if (!options.cursor) {
        return {
          items: [{
            id: 'meal-aug',
            targetDogId: 'dog-1',
            mealTime: '2026-08-05T02:00:00.000Z',
            dogSnapshot: { id: 'dog-1', name: '布丁' },
            humanMenu: [{ title: '鸡胸' }],
            dogMealItems: [{}]
          }, {
            id: 'meal-jul',
            targetDogId: 'dog-1',
            mealTime: '2026-07-31T15:00:00.000Z',
            dogSnapshot: { id: 'dog-1', name: '布丁' },
            humanMenu: [{ title: '旧记录' }],
            dogMealItems: [{}]
          }],
          nextCursor: 'meal-next'
        }
      }
      return { items: [{ id: 'meal-duplicate', mealTime: null }], nextCursor: null }
    },
    listWeights: async (options) => {
      calls.weight.push(options)
      if (options.dogId === 'dog-2') return { items: [], nextCursor: null }
      if (!options.cursor) {
        return {
          items: [{
            id: 'weight-aug',
            dogId: 'dog-1',
            weightKg: 8.2,
            measuredOn: '2026-08-05',
            createdAt: '2026-08-05T03:00:00.000Z'
          }, {
            id: 'weight-jul',
            dogId: 'dog-1',
            weightKg: 8,
            measuredOn: '2026-07-01',
            createdAt: '2026-07-01T03:00:00.000Z'
          }],
          nextCursor: 'weight-next'
        }
      }
      return { items: [], nextCursor: null }
    },
    listCare: async (options) => {
      calls.care.push(options)
      return {
        items: options.dogId === 'dog-2'
          ? [{
            id: 'care-aug',
            dogId: 'dog-2',
            type: 'other',
            name: '洗澡',
            occurredOn: '2026-08-04',
            nextDate: null,
            createdAt: '2026-08-04T03:00:00.000Z'
          }]
          : [],
        nextCursor: null
      }
    }
  })

  const model = await service.query({
    monthKey: '2026-08',
    selectedDateKey: '2026-08-05'
  })

  assert.equal(model.status, 'success')
  assert.equal(model.sources.meal.status, 'success')
  assert.equal(model.sources.weight.status, 'success')
  assert.equal(model.sources.care.status, 'success')
  assert.deepEqual(model.records.map((record) => record.id), [
    'meal:meal-aug',
    'weight:weight-aug',
    'care:care-aug'
  ])
  assert.deepEqual(calls.meal.map((call) => call.cursor || ''), [''])
  assert.deepEqual(calls.weight.filter((call) => call.dogId === 'dog-1').map((call) => call.cursor || ''), [
    '',
    'weight-next'
  ])
  assert.deepEqual(calls.weight.map((call) => call.dogId).sort(), ['dog-1', 'dog-1', 'dog-2'])
  assert.deepEqual(calls.care.map((call) => call.dogId).sort(), ['dog-1', 'dog-2'])
  assert.deepEqual(calls.weight[0], {
    dogId: 'dog-1',
    limit: 20,
    startDate: '2026-08-01',
    endDate: '2026-09-01',
    cursor: null
  })
  assert.equal(calls.care[0].startDate, '2026-08-01')
  assert.equal(calls.care[0].endDate, '2026-09-01')
})

test('单个狗狗来源失败时保留成功狗狗记录并返回 partial 状态', async () => {
  const service = createUnifiedRecordTimelineService({
    listDogs: async () => dogs,
    listMeals: async () => ({ items: [], nextCursor: null }),
    listWeights: async ({ dogId }) => {
      if (dogId === 'dog-2') throw Object.assign(new Error('体重网络失败'), {
        code: 'NETWORK_ERROR',
        retryable: true
      })
      return {
        items: [{
          id: 'weight-1',
          dogId: 'dog-1',
          weightKg: 8,
          measuredOn: '2026-08-05',
          createdAt: '2026-08-05T03:00:00.000Z'
        }],
        nextCursor: null
      }
    },
    listCare: async () => ({ items: [], nextCursor: null })
  })

  const model = await service.query({ monthKey: '2026-08', selectedDateKey: '2026-08-05' })
  assert.equal(model.status, 'partial')
  assert.equal(model.sources.weight.status, 'partial')
  assert.deepEqual(model.sources.weight.failedDogIds, ['dog-2'])
  assert.equal(model.sources.weight.items[0].id, 'weight:weight-1')
  assert.deepEqual(model.sources.weight.error, {
    code: 'NETWORK_ERROR',
    message: '体重网络失败',
    retryable: true
  })
})

test('三类来源全部失败时返回全量失败模型，不把失败伪装成空态', async () => {
  const service = createUnifiedRecordTimelineService({
    listDogs: async () => [{ id: 'dog-1', name: '布丁' }],
    listMeals: async () => { throw Object.assign(new Error('吃饭失败'), { code: 'MEAL_DOWN' }) },
    listWeights: async () => { throw Object.assign(new Error('体重失败'), { code: 'WEIGHT_DOWN' }) },
    listCare: async () => { throw Object.assign(new Error('护理失败'), { code: 'CARE_DOWN' }) }
  })

  const model = await service.query({ monthKey: '2026-08', selectedDateKey: '2026-08-05' })
  assert.equal(model.status, 'error')
  assert.equal(model.allSourcesFailed, true)
  assert.equal(model.monthHasRecords, false)
  assert.equal(model.sources.meal.status, 'error')
  assert.equal(model.sources.weight.status, 'error')
  assert.equal(model.sources.care.status, 'error')
  assert.equal(model.sources.meal.error.message, '吃饭失败')
})

test('部分狗狗请求失败但成功狗狗没有记录时仍标记为 partial', async () => {
  const service = createUnifiedRecordTimelineService({
    listDogs: async () => dogs,
    listMeals: async () => ({ items: [], nextCursor: null }),
    listWeights: async ({ dogId }) => {
      if (dogId === 'dog-2') throw new Error('体重网络失败')
      return { items: [], nextCursor: null }
    },
    listCare: async () => ({ items: [], nextCursor: null })
  })

  const model = await service.query({ monthKey: '2026-08', selectedDateKey: '2026-08-05' })
  assert.equal(model.sources.weight.status, 'partial')
  assert.equal(model.status, 'partial')
})

test('统一记录状态复用月份缓存，切换日期和展开状态不重复请求', async () => {
  let queryCount = 0
  const service = createUnifiedRecordTimelineService({
    listDogs: async () => [{ id: 'dog-1', name: '布丁' }],
    listMeals: async () => {
      queryCount += 1
      return {
        items: [{
          id: 'meal-1',
          targetDogId: 'dog-1',
          mealTime: '2026-08-05T02:00:00.000Z',
          dogSnapshot: { id: 'dog-1', name: '布丁' },
          humanMenu: [{ title: '鸡胸' }],
          dogMealItems: [{}]
        }],
        nextCursor: null
      }
    },
    listWeights: async () => ({ items: [], nextCursor: null }),
    listCare: async () => ({ items: [], nextCursor: null })
  })
  const state = createUnifiedRecordTimelineState({ service })

  await state.load('2026-08', { selectedDateKey: '2026-08-05' })
  state.selectDate('2026-08-01')
  state.setExpandedDogIds(['dog-1'])
  await state.load('2026-08', { selectedDateKey: '2026-08-01' })

  assert.equal(queryCount, 1)
  assert.equal(state.getState().model.selectedDateKey, '2026-08-01')
  assert.equal(state.getState().model.displayRecords.length, 0)
})

test('分页读取遇到重复 cursor 时安全停止', async () => {
  let calls = 0
  const items = await readAllPages(async ({ cursor }) => {
    calls += 1
    return {
      items: [{ id: cursor || 'first' }],
      nextCursor: 'same'
    }
  })
  assert.equal(calls, 2)
  assert.deepEqual(items.map((item) => item.id), ['first', 'same'])
})

test('统一时间轴分页失败时保留已成功读取的前页记录', async () => {
  const service = createUnifiedRecordTimelineService({
    listDogs: async () => [{ id: 'dog-1', name: '布丁' }],
    listMeals: async () => ({ items: [], nextCursor: null }),
    listWeights: async ({ cursor }) => {
      if (!cursor) {
        return {
          items: [{
            id: 'weight-1',
            dogId: 'dog-1',
            weightKg: 8.2,
            measuredOn: '2026-08-05',
            createdAt: '2026-08-05T03:00:00.000Z'
          }],
          nextCursor: 'weight-next'
        }
      }
      throw Object.assign(new Error('体重第二页读取失败'), {
        code: 'NETWORK_ERROR',
        retryable: true
      })
    },
    listCare: async () => ({ items: [], nextCursor: null })
  })

  const model = await service.query({
    monthKey: '2026-08',
    selectedDateKey: '2026-08-05'
  })

  assert.equal(model.status, 'partial')
  assert.equal(model.sources.weight.status, 'error')
  assert.deepEqual(model.sources.weight.items.map((item) => item.id), ['weight:weight-1'])
  assert.equal(model.sources.weight.error.message, '体重第二页读取失败')
})
