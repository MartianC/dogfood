const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createShanghaiMonthRange,
  readMonthRecords,
  createSharedMealRecordMonthState
} = require('../services/sharedMealRecordMonthState')
const sharedMealRecordService = require('../services/sharedMealRecordService')

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

test('上海月份范围使用左闭右开 UTC 边界并支持跨年', () => {
  assert.deepEqual(createShanghaiMonthRange('2026-07'), {
    monthKey: '2026-07',
    startTime: '2026-06-30T16:00:00.000Z',
    endTime: '2026-07-31T16:00:00.000Z'
  })
  assert.deepEqual(createShanghaiMonthRange('2026-12'), {
    monthKey: '2026-12',
    startTime: '2026-11-30T16:00:00.000Z',
    endTime: '2026-12-31T16:00:00.000Z'
  })
  assert.throws(() => createShanghaiMonthRange('2026-13'), /月份无效/)
})

test('月份读取消费稳定 cursor、去重并在越过月份下界后停止', async () => {
  const calls = []
  const pages = {
    '': {
      items: [
        { id: 'aug-1', mealTime: '2026-08-02T10:00:00.000Z' },
        { id: 'jul-2', mealTime: '2026-07-31T10:00:00.000Z' }
      ],
      nextCursor: 'page-2'
    },
    'page-2': {
      items: [
        { id: 'jul-2', mealTime: '2026-07-31T10:00:00.000Z' },
        { id: 'jul-1', mealTime: '2026-07-01T00:00:00.000Z' }
      ],
      nextCursor: 'page-3'
    },
    'page-3': {
      items: [
        { id: 'jun-1', mealTime: '2026-06-29T10:00:00.000Z' }
      ],
      nextCursor: 'page-4'
    }
  }
  const result = await readMonthRecords('2026-07', async (options) => {
    calls.push(options)
    return pages[options.cursor || '']
  })

  assert.deepEqual(result.items.map((item) => item.id), ['jul-2', 'jul-1'])
  assert.deepEqual(calls.map((call) => call.cursor || ''), ['', 'page-2', 'page-3'])
  assert.equal(calls.every((call) => call.limit === 20), true)
})

test('缺失时间不会被当成 1970 年并提前终止月份扫描', async () => {
  const calls = []
  const result = await readMonthRecords('2026-07', async ({ cursor }) => {
    calls.push(cursor)
    if (!cursor) {
      return {
        items: [
          { id: 'aug-1', mealTime: '2026-08-02T10:00:00.000Z' },
          { id: 'missing-time', mealTime: null }
        ],
        nextCursor: 'page-2'
      }
    }
    return {
      items: [{ id: 'jul-1', mealTime: '2026-07-30T10:00:00.000Z' }],
      nextCursor: null
    }
  })

  assert.deepEqual(calls, [null, 'page-2'])
  assert.deepEqual(result.items.map((item) => item.id), ['jul-1'])
})

test('同月并发请求合并且成功结果进入缓存', async () => {
  const pending = deferred()
  let callCount = 0
  const state = createSharedMealRecordMonthState({
    listRecords: async () => {
      callCount += 1
      return pending.promise
    }
  })

  const first = state.load('2026-07', { selectedDateKey: '2026-07-30' })
  const second = state.load('2026-07', { selectedDateKey: '2026-07-30' })
  assert.equal(callCount, 1)
  assert.equal(state.getState().status, 'loading')

  pending.resolve({
    items: [{ id: 'jul-1', mealTime: '2026-07-30T10:00:00.000Z' }],
    nextCursor: null
  })
  await Promise.all([first, second])

  assert.equal(state.getState().status, 'success')
  assert.deepEqual(state.getState().items.map((item) => item.id), ['jul-1'])
  await state.load('2026-07')
  assert.equal(callCount, 1)
})

test('较早月份的迟到响应只写缓存，不覆盖当前月份', async () => {
  const july = deferred()
  const august = deferred()
  const state = createSharedMealRecordMonthState({
    listRecords: ({ cursor, monthKey }) => {
      assert.equal(cursor, null)
      return monthKey === '2026-07' ? july.promise : august.promise
    }
  })

  const julyRequest = state.load('2026-07', { selectedDateKey: '2026-07-30' })
  const augustRequest = state.load('2026-08', { selectedDateKey: '2026-08-01' })
  august.resolve({ items: [{ id: 'aug-1', mealTime: '2026-08-01T10:00:00.000Z' }], nextCursor: null })
  await augustRequest
  july.resolve({ items: [{ id: 'jul-1', mealTime: '2026-07-30T10:00:00.000Z' }], nextCursor: null })
  await julyRequest

  assert.equal(state.getState().activeMonthKey, '2026-08')
  assert.equal(state.getState().selectedDateKey, '2026-08-01')
  assert.deepEqual(state.getState().items.map((item) => item.id), ['aug-1'])
  await state.load('2026-07')
  assert.deepEqual(state.getState().items.map((item) => item.id), ['jul-1'])
})

test('刷新失败保留月份、选中日期和旧数据，重试可恢复', async () => {
  let mode = 'success'
  const state = createSharedMealRecordMonthState({
    listRecords: async () => {
      if (mode === 'failure') throw new Error('network')
      return {
        items: [{ id: mode, mealTime: '2026-07-30T10:00:00.000Z' }],
        nextCursor: null
      }
    }
  })

  await state.load('2026-07', { selectedDateKey: '2026-07-30' })
  mode = 'failure'
  await assert.rejects(() => state.refresh(), /network/)
  assert.deepEqual(state.getState(), {
    activeMonthKey: '2026-07',
    selectedDateKey: '2026-07-30',
    status: 'error',
    items: [{ id: 'success', mealTime: '2026-07-30T10:00:00.000Z' }],
    error: state.getState().error
  })

  mode = 'recovered'
  await state.retry()
  assert.equal(state.getState().status, 'success')
  assert.deepEqual(state.getState().items.map((item) => item.id), ['recovered'])
})

test('记录 service 通过稳定门面提供月份状态和日历模型', async () => {
  const state = sharedMealRecordService.createMonthState({
    listRecords: async () => ({
      items: [{ id: 'record-1', mealTime: '2026-07-30T10:00:00.000Z' }],
      nextCursor: null
    })
  })
  await state.load('2026-07', { selectedDateKey: '2026-07-30' })
  const calendar = sharedMealRecordService.createCalendarModel(state.getState().items, {
    monthKey: '2026-07',
    selectedDateKey: '2026-07-30'
  })

  assert.deepEqual(calendar.markedDateKeys, ['2026-07-30'])
  assert.deepEqual(calendar.selectedRecords.map((item) => item.id), ['record-1'])
})
