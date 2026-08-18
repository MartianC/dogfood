const test = require('node:test')
const assert = require('node:assert/strict')
const fixture = require('./fixtures/shared-meal-ingredient-v1.json')
const storage = require('../utils/storage')
const recordService = require('../services/sharedMealRecordService')
const dataInvalidationService = require('../services/dataInvalidationService')
const { fingerprint } = require('../subpackages/shared-meal/services/sharedMealContract')

function intent() {
  const candidate = {
    targetDogId: 'dog-1',
    mealTime: '2026-07-27T12:00:00.000Z',
    dogSnapshot: { id: 'dog-1', name: '布丁' },
    humanMenu: [{ id: 'human_recipe_chicken', title: '清蒸鸡胸', ingredients: [{ position: 0 }] }],
    sourceIngredientSelections: [],
    dogMealItems: [{ ...fixture, perMealAmountGram: 100 }],
    assessment: { energy: { statusLabel: '能量接近估算目标' } },
    note: '',
    photoFileIds: [],
    versions: fixture.dataVersions
  }
  const requestFingerprint = fingerprint(candidate)
  return {
    schemaVersion: 1,
    idempotencyKey: `draft-1:${requestFingerprint}`,
    requestFingerprint,
    warningConfirmation: 'not_required',
    draftVersion: 1,
    candidate
  }
}

test('Mock 记录保存幂等、同 key 异内容冲突并可稳定回看快照', async () => {
  storage.removeSync('mockSharedMealRecords')
  const saveIntent = intent()
  const before = dataInvalidationService.getSnapshot()
  const first = await recordService.save(saveIntent)
  const after = dataInvalidationService.getSnapshot()
  assert.equal(after.meals, before.meals + 1)
  assert.equal(after.profile, before.profile)
  const repeated = await recordService.save(saveIntent)
  assert.equal(repeated.id, first.id)
  assert.equal((await recordService.list()).items.length, 1)

  const changed = { ...saveIntent, requestFingerprint: 'fnv1a32:different' }
  await assert.rejects(() => recordService.save(changed), /相同保存请求包含不同内容/)

  const detail = await recordService.get(first.id)
  detail.dogSnapshot.name = '篡改'
  assert.equal((await recordService.get(first.id)).dogSnapshot.name, '布丁')
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
    name: '索引未就绪',
    raw: { errMsg: 'cloud.callFunction:fail query requires an index' },
    code: 'STORAGE_NOT_READY',
    retryable: false
  },
  {
    name: '未登录',
    raw: { errMsg: 'cloud.callFunction:fail Error: 请先登录' },
    code: 'UNAUTHENTICATED',
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
  },
  {
    name: '记录不存在',
    raw: { errMsg: 'cloud.callFunction:fail Error: 未找到本餐记录' },
    code: 'RECORD_NOT_FOUND',
    retryable: false
  }
]

errorCases.forEach(({ name, raw, code, retryable }) => {
  test(`记录服务稳定分类${name}错误`, async () => {
    await withCloudFailure(raw, async () => {
      await assert.rejects(
        () => recordService.list(),
        (error) => {
          assert.equal(error.name, 'SharedMealRecordError')
          assert.equal(error.code, code)
          assert.equal(error.retryable, retryable)
          assert.equal(error.operation, 'list')
          assert.equal(error.cause, raw)
          return true
        }
      )
    })
  })
})

test('记录服务把未知云错误收口且不暴露底层文案', async () => {
  const raw = new Error('internal stack and sensitive detail')
  await withCloudFailure(raw, async () => {
    await assert.rejects(
      () => recordService.get('record-1'),
      (error) => {
        assert.equal(error.code, 'UNKNOWN')
        assert.equal(error.retryable, false)
        assert.equal(error.operation, 'get')
        assert.equal(error.message, '记录服务暂时不可用')
        assert.equal(error.message.includes(raw.message), false)
        return true
      }
    )
  })
})
