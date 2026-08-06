const test = require('node:test')
const assert = require('node:assert/strict')

const storage = require('../utils/storage')
const careRecordService = require('../care/careRecordService')

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

test.beforeEach(() => {
  storage.removeSync('mockCareRecords')
  storage.setSync('mockDogs', [{ id: 'dog-1', userId: 'mock_user' }])
})

test('护理 service 在 Mock fallback 下提供单狗 CRUD、类型筛选和稳定分页', async () => {
  const first = await careRecordService.create(payload())
  await careRecordService.create(payload({
    type: 'internal_deworming',
    name: '体内驱虫',
    occurredOn: '2026-06-01',
    nextDate: null
  }))
  await careRecordService.create(payload({
    type: 'other',
    name: '护理洗澡',
    occurredOn: '2026-05-01',
    nextDate: null
  }))

  const firstPage = await careRecordService.list({ dogId: 'dog-1', limit: 2 })
  assert.equal(firstPage.items.length, 2)
  assert.ok(firstPage.nextCursor)
  const secondPage = await careRecordService.list({
    dogId: 'dog-1',
    limit: 2,
    cursor: firstPage.nextCursor
  })
  assert.equal(secondPage.items.length, 1)

  const filtered = await careRecordService.list({ dogId: 'dog-1', type: 'vaccine' })
  assert.deepEqual(filtered.items.map((item) => item.id), [first.id])

  const updated = await careRecordService.update(first.id, payload({
    name: '狂犬病疫苗（修正）',
    notes: '备注已修正'
  }))
  assert.equal(updated.name, '狂犬病疫苗（修正）')
  assert.equal((await careRecordService.get(first.id)).notes, '备注已修正')

  assert.deepEqual(await careRecordService.delete(first.id), { deleted: true, id: first.id })
  await assert.rejects(() => careRecordService.get(first.id), /未找到护理记录/)
})

test('护理 service 在写入前拒绝无效字段，并保持狗狗归属不可变', async () => {
  const record = await careRecordService.create(payload())
  await assert.rejects(
    () => careRecordService.create(payload({ type: 'invalid' })),
    (error) => {
      assert.equal(error.name, 'CareRecordError')
      assert.equal(error.code, 'VALIDATION_ERROR')
      assert.equal(error.retryable, false)
      return true
    }
  )
  await assert.rejects(
    () => careRecordService.update(record.id, payload({ dogId: 'dog-2' })),
    /不能更换狗狗/
  )
  await assert.rejects(
    () => careRecordService.list({ dogId: 'dog-2' }),
    (error) => {
      assert.equal(error.name, 'CareRecordError')
      assert.equal(error.code, 'FORBIDDEN')
      assert.equal(error.message, '无权执行该护理操作')
      return true
    }
  )
})

async function withCloudFailure(rawError, run) {
  const originalWx = global.wx
  global.wx = {
    cloud: {
      async callFunction() {
        throw rawError
      }
    }
  }
  try {
    await run()
  } finally {
    global.wx = originalWx
  }
}

const errorCases = [
  {
    name: '函数未部署',
    raw: { errCode: -501000, errMsg: 'cloud.callFunction:fail FUNCTION_NOT_FOUND' },
    code: 'FUNCTION_NOT_DEPLOYED',
    retryable: false
  },
  {
    name: '集合未就绪',
    raw: { errMsg: 'cloud.callFunction:fail NamespaceNotFound: Db or Table not exist' },
    code: 'STORAGE_NOT_READY',
    retryable: false
  },
  {
    name: '无权限',
    raw: { errMsg: 'cloud.callFunction:fail FORBIDDEN_DOG: 无权使用该狗狗档案' },
    code: 'FORBIDDEN',
    retryable: false
  },
  {
    name: '网络失败',
    raw: { errMsg: 'cloud.callFunction:fail request:fail timeout' },
    code: 'NETWORK_ERROR',
    retryable: true
  }
]

errorCases.forEach(({ name, raw, code, retryable }) => {
  test(`护理 service 稳定分类${name}错误`, async () => {
    await withCloudFailure(raw, async () => {
      await assert.rejects(
        () => careRecordService.list({ dogId: 'dog-1' }),
        (error) => {
          assert.equal(error.name, 'CareRecordError')
          assert.equal(error.code, code)
          assert.equal(error.retryable, retryable)
          assert.equal(error.operation, 'list')
          return true
        }
      )
    })
  })
})

test('护理 service 对未知云错误收口且不暴露底层文案', async () => {
  const raw = new Error('internal stack and sensitive detail')
  await withCloudFailure(raw, async () => {
    await assert.rejects(
      () => careRecordService.get('care-1'),
      (error) => {
        assert.equal(error.code, 'UNKNOWN')
        assert.equal(error.retryable, false)
        assert.equal(error.operation, 'get')
        assert.equal(error.message, '护理服务暂时不可用')
        assert.equal(error.message.includes(raw.message), false)
        return true
      }
    )
  })
})
