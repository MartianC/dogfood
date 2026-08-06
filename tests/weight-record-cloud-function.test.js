const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  createWeightRecordGateway
} = require('../cloudfunctions/weightRecord')
const {
  checkGeneratedFile
} = require('../scripts/sync-weight-contract')

const root = path.resolve(__dirname, '..')

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function comparable(value) {
  if (value instanceof Date) return value.getTime()
  return value
}

function matchValue(actual, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if (Object.hasOwn(expected, '$lt')) return comparable(actual) < comparable(expected.$lt)
    if (Object.hasOwn(expected, '$gt')) return comparable(actual) > comparable(expected.$gt)
    if (Object.hasOwn(expected, '$eq')) return comparable(actual) === comparable(expected.$eq)
  }
  return comparable(actual) === comparable(expected)
}

function matches(document, condition) {
  if (!condition) return true
  if (condition.$and) return condition.$and.every((item) => matches(document, item))
  if (condition.$or) return condition.$or.some((item) => matches(document, item))
  return Object.entries(condition).every(([key, value]) => matchValue(document[key], value))
}

function fakeDatabase(initial = {}, { rejectMissingDocs = false } = {}) {
  const state = {
    dogs: clone(initial.dogs || []),
    weight_measurements: clone(initial.weight_measurements || [])
  }
  let nextId = 1
  let failDogUpdate = false

  function apiFor(target) {
    function collection(name) {
      return {
        where(condition) {
          let query = {
            condition,
            orders: [],
            limitValue: Infinity
          }
          const chain = {
            where(next) {
              query = { ...query, condition: next }
              return chain
            },
            orderBy(field, direction) {
              query = { ...query, orders: query.orders.concat({ field, direction }) }
              return chain
            },
            limit(value) {
              query = { ...query, limitValue: value }
              return chain
            },
            async get() {
              let rows = target[name].filter((item) => matches(item, query.condition))
              query.orders.slice().reverse().forEach(({ field, direction }) => {
                rows.sort((left, right) => {
                  const leftValue = comparable(left[field])
                  const rightValue = comparable(right[field])
                  if (leftValue === rightValue) return 0
                  const result = leftValue < rightValue ? -1 : 1
                  return direction === 'desc' ? -result : result
                })
              })
              return { data: rows.slice(0, query.limitValue).map(clone) }
            }
          }
          return chain
        },
        doc(id) {
          return {
            async get() {
              const item = target[name].find((candidate) => candidate._id === id)
              if (!item && rejectMissingDocs) throw new Error('document does not exist')
              return { data: item ? clone(item) : null }
            },
            async update({ data }) {
              if (name === 'dogs' && failDogUpdate) throw new Error('模拟档案同步失败')
              const index = target[name].findIndex((candidate) => candidate._id === id)
              if (index < 0) throw new Error('文档不存在')
              target[name][index] = { ...target[name][index], ...clone(data) }
            },
            async remove() {
              const index = target[name].findIndex((candidate) => candidate._id === id)
              if (index >= 0) target[name].splice(index, 1)
            }
          }
        },
        async add({ data }) {
          const item = { ...clone(data), _id: `weight-${nextId++}` }
          target[name].push(item)
          return { _id: item._id }
        }
      }
    }

    return {
      collection,
      command: {
        lt(value) { return { $lt: value } },
        gt(value) { return { $gt: value } },
        and(items) { return { $and: items } },
        or(items) { return { $or: items } }
      }
    }
  }

  const database = apiFor(state)
  database.runTransaction = async (operation) => {
    const draft = clone(state)
    const result = await operation(apiFor(draft))
    Object.keys(state).forEach((key) => {
      state[key] = draft[key]
    })
    return result
  }
  database.state = state
  database.setFailDogUpdate = (value) => { failDogUpdate = value }
  return database
}

function fixedNow() {
  return new Date('2026-08-04T12:00:00.000Z')
}

function writePayload(overrides = {}) {
  return {
    schemaVersion: 1,
    dogId: 'dog-1',
    weightKg: 10.25,
    measuredOn: '2026-08-03',
    ...overrides
  }
}

function seedDatabase() {
  return fakeDatabase({
    dogs: [
      { _id: 'dog-1', _openid: 'owner-1', name: '布丁', weightKg: 10 },
      { _id: 'dog-2', _openid: 'owner-1', name: '奶糖', weightKg: 8 },
      { _id: 'dog-outsider', _openid: 'owner-2', name: '别人的狗', weightKg: 12 }
    ]
  })
}

test('weightRecord schema、权限、索引和云函数合同副本保持一致', () => {
  const recordSchema = require('../cloudfunctions/weightRecord/schema/record.schema.json')
  const access = require('../cloudfunctions/weightRecord/schema/access.json')
  const indexes = require('../cloudfunctions/weightRecord/schema/indexes.json')
  const writeSchema = require('../contracts/weight/weight-measurement-write-v1.schema.json')

  assert.equal(recordSchema.$id, 'weightMeasurementStorage/v1')
  assert.equal(writeSchema.$id, 'weightMeasurementWrite/v1')
  assert.equal(access.clientRead, false)
  assert.equal(access.clientWrite, false)
  assert.deepEqual(indexes.indexes[0].fields.map((field) => field.field), [
    '_openid',
    'dogId',
    'measuredOn',
    'createdAt',
    '_id'
  ])
  assert.equal(checkGeneratedFile(), true)
  assert.equal(
    fs.existsSync(path.join(root, 'cloudfunctions/weightRecord/package.json')),
    true
  )
})

test('云函数创建体重时校验归属、同步当前体重并支持稳定分页', async () => {
  const database = seedDatabase()
  const gateway = createWeightRecordGateway({
    database,
    openId: 'owner-1',
    now: fixedNow
  })

  const older = await gateway({ action: 'create', payload: writePayload({
    weightKg: 9.8,
    measuredOn: '2026-08-01'
  }) })
  const latest = await gateway({ action: 'create', payload: writePayload() })
  assert.equal(latest.currentWeight.weightKg, 10.25)
  assert.equal(database.state.dogs[0].weightKg, 10.25)

  const firstPage = await gateway({ action: 'list', dogId: 'dog-1', limit: 1 })
  assert.deepEqual(firstPage.items.map((item) => item.id), [latest.measurement.id])
  assert.ok(firstPage.nextCursor)
  const secondPage = await gateway({
    action: 'list',
    dogId: 'dog-1',
    limit: 1,
    cursor: firstPage.nextCursor
  })
  assert.deepEqual(secondPage.items.map((item) => item.id), [older.measurement.id])
  assert.equal(secondPage.nextCursor, null)

  await assert.rejects(
    () => gateway({ action: 'create', payload: writePayload({ dogId: 'dog-outsider' }) }),
    (error) => error.code === 'FORBIDDEN_DOG'
  )
  await assert.rejects(
    () => gateway({ action: 'list', dogId: 'dog-outsider' }),
    (error) => error.code === 'FORBIDDEN_DOG'
  )
})

test('云函数删除最新测量回退上一条，删除最后一条清空档案当前体重', async () => {
  const database = seedDatabase()
  const gateway = createWeightRecordGateway({ database, openId: 'owner-1', now: fixedNow })
  const previous = await gateway({ action: 'create', payload: writePayload({
    weightKg: 9.8,
    measuredOn: '2026-08-01'
  }) })
  const latest = await gateway({ action: 'create', payload: writePayload() })

  const fallback = await gateway({ action: 'delete', recordId: latest.measurement.id })
  assert.equal(fallback.outcome, 'fallback-to-previous-measurement')
  assert.equal(fallback.currentWeight.weightKg, 9.8)
  assert.equal(database.state.dogs[0].weightKg, 9.8)

  const unrecorded = await gateway({ action: 'delete', recordId: previous.measurement.id })
  assert.equal(unrecorded.outcome, 'unrecorded')
  assert.equal(unrecorded.currentWeight.weightKg, null)
  assert.equal(database.state.dogs[0].weightKg, null)
})

test('云函数编辑体重以事务替换旧记录并保持狗狗归属', async () => {
  const database = seedDatabase()
  const gateway = createWeightRecordGateway({ database, openId: 'owner-1', now: fixedNow })
  const original = await gateway({ action: 'create', payload: writePayload({
    weightKg: 9.8,
    measuredOn: '2026-08-01'
  }) })

  const updated = await gateway({
    action: 'replace',
    recordId: original.measurement.id,
    payload: writePayload({ weightKg: 10.1, measuredOn: '2026-08-02' })
  })
  assert.equal(updated.replacedMeasurementId, original.measurement.id)
  assert.notEqual(updated.replacement.id, original.measurement.id)
  assert.equal(database.state.weight_measurements.length, 1)
  assert.equal(database.state.weight_measurements[0].weightKg, 10.1)
  assert.equal(database.state.dogs[0].weightKg, 10.1)

  await assert.rejects(
    () => gateway({
      action: 'replace',
      recordId: updated.replacement.id,
      payload: writePayload({ dogId: 'dog-2' })
    }),
    (error) => error.code === 'INVALID_DOG'
  )
})

test('云函数跨集合同步失败时事务不留下半成品记录', async () => {
  const database = seedDatabase()
  database.setFailDogUpdate(true)
  const gateway = createWeightRecordGateway({ database, openId: 'owner-1', now: fixedNow })

  await assert.rejects(
    () => gateway({ action: 'create', payload: writePayload() }),
    /模拟档案同步失败/
  )
  assert.equal(database.state.weight_measurements.length, 0)
  assert.equal(database.state.dogs[0].weightKg, 10)
})

test('云函数拒绝客户端伪造记录身份和非法游标', async () => {
  const database = seedDatabase()
  const gateway = createWeightRecordGateway({ database, openId: 'owner-1', now: fixedNow })

  await assert.rejects(
    () => gateway({ action: 'create', payload: writePayload({ id: 'fake-id' }) }),
    /写入字段不完整/
  )
  await assert.rejects(
    () => gateway({ action: 'list', dogId: 'dog-1', cursor: 'not-json' }),
    (error) => error.code === 'INVALID_CURSOR'
  )
  await assert.rejects(
    () => gateway({ action: 'get', recordId: 'missing' }),
    (error) => error.code === 'NOT_FOUND'
  )
})

test('云函数将 CloudBase 缺失狗狗和记录异常归一化为稳定业务错误', async () => {
  const database = fakeDatabase({
    dogs: [{ _id: 'dog-1', _openid: 'owner-1', name: '布丁', weightKg: 10 }]
  }, { rejectMissingDocs: true })
  const gateway = createWeightRecordGateway({ database, openId: 'owner-1', now: fixedNow })

  await assert.rejects(
    () => gateway({ action: 'list', dogId: 'missing-dog' }),
    (error) => error.code === 'FORBIDDEN_DOG'
  )
  await assert.rejects(
    () => gateway({ action: 'get', recordId: 'missing-record' }),
    (error) => error.code === 'NOT_FOUND'
  )
  await assert.rejects(
    () => gateway({ action: 'replace', recordId: 'missing-record', payload: writePayload() }),
    (error) => error.code === 'NOT_FOUND'
  )
  await assert.rejects(
    () => gateway({ action: 'delete', recordId: 'missing-record' }),
    (error) => error.code === 'NOT_FOUND'
  )
})
