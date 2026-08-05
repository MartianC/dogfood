const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createCareRecordGateway,
  validateWritePayload,
  decodeCursor
} = require('../cloudfunctions/careRecord')
const { CARE_RECORD_KEYS } = require('../contracts/care/careRecordContract')

function payload(overrides = {}) {
  return {
    schemaVersion: 1,
    dogId: 'dog-1',
    type: 'vaccine',
    name: '狂犬病疫苗',
    occurredOn: '2026-07-01',
    nextDate: '2027-07-01',
    notes: '社区动物医院',
    ...overrides
  }
}

function fakeDatabase({ rejectMissingDocs = false } = {}) {
  const collections = {
    dogs: [
      { _id: 'dog-1', _openid: 'owner-1' },
      { _id: 'dog-2', _openid: 'owner-2' }
    ],
    care_records: []
  }

  function matches(document, condition) {
    if (!condition) return true
    if (condition.$and) return condition.$and.every((item) => matches(document, item))
    if (condition.$or) return condition.$or.some((item) => matches(document, item))
    return Object.entries(condition).every(([key, expected]) => {
      if (expected && typeof expected === 'object' && '$lt' in expected) {
        return document[key] < expected.$lt
      }
      return document[key] === expected
    })
  }

  function buildQuery(name, condition = null, orders = [], max = Infinity) {
    return {
      where(next) { return buildQuery(name, next, orders, max) },
      orderBy(field, direction) {
        return buildQuery(name, condition, orders.concat([[field, direction]]), max)
      },
      limit(next) { return buildQuery(name, condition, orders, next) },
      async get() {
        const rows = collections[name].filter((item) => matches(item, condition)).slice()
        rows.sort((left, right) => {
          for (const [field, direction] of orders) {
            if (left[field] === right[field]) continue
            const compared = left[field] < right[field] ? -1 : 1
            return direction === 'desc' ? -compared : compared
          }
          return 0
        })
        return { data: rows.slice(0, max) }
      }
    }
  }

  function collection(name) {
    return {
      where(condition) { return buildQuery(name, condition) },
      async add({ data }) {
        const _id = `care-${collections[name].length + 1}`
        collections[name].push({ ...data, _id })
        return { _id }
      },
      doc(id) {
        return {
          async get() {
            const data = collections[name].find((item) => item._id === id) || null
            if (!data && rejectMissingDocs) throw new Error('document does not exist')
            return { data }
          },
          async update({ data }) {
            const index = collections[name].findIndex((item) => item._id === id)
            if (index < 0) throw new Error('document not found')
            collections[name][index] = { ...collections[name][index], ...data }
          },
          async remove() {
            const index = collections[name].findIndex((item) => item._id === id)
            if (index >= 0) collections[name].splice(index, 1)
          }
        }
      }
    }
  }

  return {
    collections,
    collection,
    command: {
      and: (items) => ({ $and: items }),
      or: (items) => ({ $or: items }),
      lt: (value) => ({ $lt: value })
    }
  }
}

test('护理云函数创建、列表筛选、游标分页、更新和删除遵守实体合同', async () => {
  const database = fakeDatabase()
  const gateway = createCareRecordGateway({ database, openId: 'owner-1' })

  const first = await gateway({ action: 'create', payload: payload() })
  const second = await gateway({
    action: 'create',
    payload: payload({
      type: 'internal_deworming',
      name: '体内驱虫',
      occurredOn: '2026-07-01',
      nextDate: null
    })
  })
  await gateway({
    action: 'create',
    payload: payload({
      type: 'other',
      name: '护理洗澡',
      occurredOn: '2026-06-01',
      nextDate: null
    })
  })

  assert.deepEqual(Object.keys(first), CARE_RECORD_KEYS)
  assert.equal(first.id, 'care-1')
  assert.equal(first.dogId, 'dog-1')

  const firstPage = await gateway({ action: 'list', dogId: 'dog-1', limit: 2 })
  assert.deepEqual(firstPage.items.map((item) => item.id), ['care-2', 'care-1'])
  assert.ok(firstPage.nextCursor)
  const secondPage = await gateway({
    action: 'list',
    dogId: 'dog-1',
    limit: 2,
    cursor: firstPage.nextCursor
  })
  assert.deepEqual(secondPage.items.map((item) => item.id), ['care-3'])
  assert.equal(secondPage.nextCursor, null)

  const filtered = await gateway({ action: 'list', dogId: 'dog-1', type: 'vaccine' })
  assert.deepEqual(filtered.items.map((item) => item.id), ['care-1'])

  const updated = await gateway({
    action: 'update',
    recordId: first.id,
    payload: payload({ name: '狂犬病疫苗（修正）', notes: '更新后的事实备注' })
  })
  assert.equal(updated.name, '狂犬病疫苗（修正）')
  assert.equal(updated.notes, '更新后的事实备注')
  assert.equal(updated.dogId, 'dog-1')

  const deleted = await gateway({ action: 'delete', recordId: second.id })
  assert.deepEqual(deleted, { deleted: true, id: second.id })
  await assert.rejects(
    () => gateway({ action: 'get', recordId: second.id }),
    /未找到护理记录/
  )
})

test('护理云函数拒绝跨用户、跨狗更新和无效查询，不泄漏记录存在性', async () => {
  const database = fakeDatabase()
  const ownerGateway = createCareRecordGateway({ database, openId: 'owner-1' })
  const outsiderGateway = createCareRecordGateway({ database, openId: 'owner-2' })
  const first = await ownerGateway({ action: 'create', payload: payload() })

  await assert.rejects(
    () => outsiderGateway({ action: 'get', recordId: first.id }),
    /未找到护理记录/
  )
  await assert.rejects(
    () => outsiderGateway({ action: 'create', payload: payload() }),
    /无权使用该狗狗档案/
  )
  await assert.rejects(
    () => ownerGateway({
      action: 'update',
      recordId: first.id,
      payload: payload({ dogId: 'dog-2' })
    }),
    /不能更换狗狗/
  )
  await assert.rejects(
    () => ownerGateway({ action: 'list', dogId: 'dog-1', type: 'unknown' }),
    /护理类型无效/
  )
  await assert.rejects(
    () => ownerGateway({ action: 'list', dogId: '' }),
    /缺少目标狗狗/
  )
  assert.throws(() => decodeCursor('not-a-cursor'), /分页游标无效/)
})

test('护理云函数将 CloudBase 缺失文档异常归一化为业务错误', async () => {
  const database = fakeDatabase({ rejectMissingDocs: true })
  const gateway = createCareRecordGateway({ database, openId: 'owner-1' })

  await assert.rejects(
    () => gateway({ action: 'get', recordId: 'missing-record' }),
    /未找到护理记录/
  )
  await assert.rejects(
    () => gateway({ action: 'list', dogId: 'missing-dog' }),
    /无权使用该狗狗档案/
  )
})

test('护理云函数写入边界拒绝客户端伪造实体字段', () => {
  assert.throws(
    () => validateWritePayload({ ...payload(), id: 'client-id' }),
    /写入字段不完整/
  )
  assert.throws(
    () => validateWritePayload({ ...payload(), occurredOn: '2099-08-05' }),
    /发生日期不能晚于今天/
  )
})
