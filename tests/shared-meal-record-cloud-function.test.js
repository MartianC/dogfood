const test = require('node:test')
const assert = require('node:assert/strict')
const fixture = require('./fixtures/shared-meal-ingredient-v1.json')
const { fingerprint } = require('../subpackages/shared-meal/services/sharedMealContract')
const operationContract = require('../contracts/shared-meal/ingredient-operation-rules-v1.json')
const miniProgramRules = require('../subpackages/shared-meal/services/ingredientOperationRules')
const cloudRules = require('../cloudfunctions/sharedMealRecord/ingredientOperationRules')
const {
  validateSaveIntent,
  validateUpdateIntent,
  createSharedMealRecordGateway,
  isEditableToday
} = require('../cloudfunctions/sharedMealRecord')

function makeIntent(ingredient = { ...fixture, perMealAmountGram: 100 }, mealTime = '2026-07-27T12:00:00.000Z') {
  const candidate = {
    targetDogId: 'dog-1',
    mealTime,
    dogSnapshot: { id: 'dog-1' },
    humanMenu: [{ id: 'human_recipe_chicken', ingredients: [{ position: 0 }] }],
    sourceIngredientSelections: [],
    dogMealItems: [ingredient],
    assessment: {},
    note: '',
    photoFileIds: [],
    versions: fixture.dataVersions
  }
  return {
    schemaVersion: 1,
    idempotencyKey: 'key-1',
    requestFingerprint: fingerprint(candidate),
    candidate
  }
}

function makeUpdateIntent(record, overrides = {}) {
  const candidate = {
    ...record,
    ...overrides,
    targetDogId: record.targetDogId,
    mealTime: record.mealTime
  }
  const updateFingerprint = fingerprint(candidate)
  return {
    schemaVersion: 1,
    operation: 'update',
    recordId: record.id,
    expectedRevision: Number(record.revision) || 1,
    updateKey: `${record.id}:${Number(record.revision) || 1}:${updateFingerprint}`,
    updateFingerprint,
    candidate
  }
}

test('云端逐字段消费 canonical 食材并与客户端指纹一致', () => {
  const saveIntent = makeIntent()
  assert.equal(validateSaveIntent(saveIntent).saveIntent.requestFingerprint, saveIntent.requestFingerprint)
  assert.throws(() => validateSaveIntent(makeIntent({ ...fixture, perMealAmountGram: 100, foodId: 'split' })), /食材营养身份无效/)
  assert.throws(() => validateSaveIntent(makeIntent({ ...fixture, perMealAmountGram: 100, policyStatus: 'blocked' })), /被阻止食材不可保存/)
})

test('照片字段只兼容空数组', () => {
  const saveIntent = makeIntent()
  saveIntent.candidate.photoFileIds = ['cloud://unexpected-photo']
  saveIntent.requestFingerprint = fingerprint(saveIntent.candidate)
  assert.throws(() => validateSaveIntent(saveIntent), /暂不支持照片/)
})

test('当天判定使用上海自然日，跨过零点后立即冻结', () => {
  const record = { mealTime: '2026-08-22T15:59:59.000Z' }
  assert.equal(isEditableToday(record, new Date('2026-08-22T15:59:59.999Z')), true)
  assert.equal(isEditableToday(record, new Date('2026-08-22T16:00:00.000Z')), false)
  assert.equal(isEditableToday({ mealTime: 'invalid' }, new Date('2026-08-22T15:59:59.999Z')), false)
})

test('更新意图复用保存校验并要求记录版本', () => {
  const saveIntent = makeIntent({ ...fixture, perMealAmountGram: 100 }, '2026-08-22T12:00:00.000Z')
  const updateIntent = makeUpdateIntent({
    id: 'record-1',
    revision: 2,
    ...saveIntent.candidate
  }, { note: '修改后的备注' })
  assert.equal(validateUpdateIntent(updateIntent).expectedRevision, 2)
  assert.throws(
    () => validateUpdateIntent({ ...updateIntent, expectedRevision: 0 }),
    /更新版本字段无效/
  )
})

test('云函数包内规则与小程序分包规则对四态保持契约一致', () => {
  assert.deepEqual(cloudRules.KNOWN_POLICY_STATUSES, operationContract.knownStatuses)
  operationContract.knownStatuses.forEach((policyStatus) => {
    assert.equal(
      cloudRules.canAddIngredient({ policy_status: policyStatus }),
      miniProgramRules.canAddIngredient({ policyStatus }),
      policyStatus
    )
  })
})

function fakeDatabase() {
  const collections = {
    dogs: [{ _id: 'dog-1', _openid: 'owner-1' }],
    data_releases: [{
      _id: 'release-1',
      status: 'active',
      release_id: fixture.dataVersions.runtimeReleaseId,
      recipe_version: fixture.dataVersions.recipeVersion,
      mapping_version: fixture.dataVersions.mappingVersion,
      catalog_version: fixture.dataVersions.catalogVersion,
      policy_version: fixture.dataVersions.policyVersion
    }],
    ingredient_catalog: [{
      _id: 'catalog-1',
      concept_id: fixture.conceptId,
      variant_id: fixture.variantId,
      food_id: fixture.foodId,
      catalog_version: fixture.dataVersions.catalogVersion,
      policy_version: fixture.dataVersions.policyVersion,
      policy_status: 'allowed'
    }],
    shared_meal_records: []
  }

  function matches(document, condition) {
    return Object.entries(condition || {}).every(([key, value]) => document[key] === value)
  }

  function query(name, condition = null, limit = Infinity) {
    return {
      where(next) { return query(name, next, limit) },
      orderBy() { return this },
      limit(next) { return query(name, condition, next) },
      async get() { return { data: collections[name].filter((item) => matches(item, condition)).slice(0, limit) } },
      async add({ data }) {
        if (name === 'shared_meal_records' && collections[name].some((item) => (
          item._openid === data._openid && item.idempotencyKey === data.idempotencyKey
        ))) throw new Error('duplicate key')
        const _id = `record-${collections[name].length + 1}`
        collections[name].push({ ...data, _id })
        return { _id }
      },
      async update({ data }) {
        const item = collections[name].find((candidate) => candidate._id === condition)
        if (!item) throw new Error('not found')
        Object.assign(item, data)
        return { stats: { updated: 1 } }
      },
      doc(id) {
        return {
          async get() { return { data: collections[name].find((item) => item._id === id) || null } },
          async update({ data }) {
            const item = collections[name].find((candidate) => candidate._id === id)
            if (!item) throw new Error('not found')
            Object.assign(item, data)
            return { stats: { updated: 1 } }
          }
        }
      }
    }
  }

  const database = {
    collections,
    collection(name) { return query(name) },
    command: {
      and: (items) => items.reduce((result, item) => ({ ...result, ...item }), {}),
      or: (items) => ({ $or: items }),
      lt: (value) => ({ $lt: value })
    },
    runTransaction: async (operation) => operation(database)
  }
  return database
}

test('隔离数据库验证原子幂等、归属隔离和单记录回看', async () => {
  const database = fakeDatabase()
  const gateway = createSharedMealRecordGateway({ database, openId: 'owner-1' })
  const saveIntent = makeIntent()
  const [first, repeated] = await Promise.all([
    gateway({ action: 'save', payload: saveIntent }),
    gateway({ action: 'save', payload: saveIntent })
  ])
  assert.equal(first.id, repeated.id)
  assert.equal(database.collections.shared_meal_records.length, 1)
  assert.equal((await gateway({ action: 'list' })).items.length, 1)
  assert.equal((await gateway({ action: 'get', recordId: first.id })).targetDogId, 'dog-1')

  const changed = makeIntent({ ...fixture, perMealAmountGram: 120 })
  changed.idempotencyKey = saveIntent.idempotencyKey
  await assert.rejects(() => gateway({ action: 'save', payload: changed }), /相同保存请求包含不同内容/)

  const outsider = createSharedMealRecordGateway({ database, openId: 'owner-2' })
  const outsiderIntent = makeIntent()
  outsiderIntent.idempotencyKey = 'owner-2-key'
  await assert.rejects(() => outsider({ action: 'save', payload: outsiderIntent }), /无权使用该狗狗档案/)
  await assert.rejects(() => outsider({ action: 'get', recordId: first.id }), /未找到本餐记录/)
})

test('当天更新原记录、重复更新幂等，历史记录和过期版本均拒绝', async () => {
  const now = new Date('2026-08-22T15:59:59.000Z')
  const database = fakeDatabase()
  const gateway = createSharedMealRecordGateway({
    database,
    openId: 'owner-1',
    now: () => now
  })
  const currentSave = makeIntent({ ...fixture, perMealAmountGram: 100 }, '2026-08-22T10:00:00.000Z')
  const current = await gateway({ action: 'save', payload: currentSave })
  const updateIntent = makeUpdateIntent({
    ...currentSave.candidate,
    id: current.id,
    revision: current.revision
  }, { note: '修改后的备注' })

  const updated = await gateway({ action: 'update', payload: updateIntent })
  assert.equal(updated.id, current.id)
  assert.equal(updated.revision, 2)
  assert.equal(updated.note, '修改后的备注')
  assert.equal(updated.createdAt, current.createdAt)
  assert.equal(updated.updatedAt.toISOString(), now.toISOString())
  const repeated = await gateway({ action: 'update', payload: updateIntent })
  assert.equal(repeated.revision, 2)

  const stale = makeUpdateIntent({
    ...currentSave.candidate,
    id: current.id,
    revision: current.revision
  }, { note: '旧草稿覆盖' })
  await assert.rejects(
    () => gateway({ action: 'update', payload: stale }),
    /这顿饭已被更新/
  )

  const historicalSave = makeIntent({ ...fixture, perMealAmountGram: 100 })
  historicalSave.idempotencyKey = 'historical-key'
  const historical = await gateway({ action: 'save', payload: historicalSave })
  const historicalUpdate = makeUpdateIntent({
    ...historicalSave.candidate,
    id: historical.id,
    revision: historical.revision
  }, { note: '历史修改' })
  await assert.rejects(
    () => gateway({ action: 'update', payload: historicalUpdate }),
    /这顿饭已进入历史/
  )
})

test('云端活动目录复核拒绝伪造为 blocked 的保存请求', async () => {
  const database = fakeDatabase()
  database.collections.ingredient_catalog[0].policy_status = 'blocked'
  const gateway = createSharedMealRecordGateway({ database, openId: 'owner-1' })

  await assert.rejects(
    () => gateway({ action: 'save', payload: makeIntent() }),
    /被阻止食材不可保存/
  )
  assert.equal(database.collections.shared_meal_records.length, 0)
})
