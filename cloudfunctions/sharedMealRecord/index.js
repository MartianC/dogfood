const {
  canonicalizeIngredients,
  fingerprint
} = require('./sharedMealContract')
const { canAddIngredient } = require('./ingredientOperationRules')
const { isIngredientAllergen } = require('./dogIngredientPolicy')

const MAX_PAGE_SIZE = 20
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

function fail(code, message) {
  const error = new Error(message)
  error.code = code
  throw error
}

function normalizeRecord(document) {
  return {
    ...document,
    id: String(document.id || document._id || ''),
    revision: Number(document.revision) || 1,
    updatedAt: document.updatedAt || document.createdAt || null
  }
}

function shanghaiDateKey(value) {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return ''
  const date = new Date(timestamp + SHANGHAI_OFFSET_MS)
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0')
  ].join('-')
}

function isEditableToday(record, now = new Date()) {
  return Boolean(
    record
    && shanghaiDateKey(record.mealTime)
    && shanghaiDateKey(record.mealTime) === shanghaiDateKey(now)
  )
}

function validateSourceRefs(candidate, ingredients) {
  const menus = new Map((candidate.humanMenu || []).map((menu) => [String(menu.id || ''), menu]))
  ingredients.forEach((ingredient) => {
    ingredient.sourceRefs.forEach((ref) => {
      const menu = menus.get(ref.humanMenuId)
      if (!menu || !(menu.ingredients || []).some((item) => Number(item.position) === ref.ingredientPosition)) {
        fail('INVALID_SOURCE_REF', '食材来源与人饭快照不一致')
      }
    })
  })
}

function validateSaveIntent(saveIntent) {
  if (!saveIntent || saveIntent.schemaVersion !== 1) fail('INVALID_PAYLOAD', '保存数据格式无效')
  if (!saveIntent.idempotencyKey || !saveIntent.requestFingerprint) {
    fail('INVALID_PAYLOAD', '保存幂等字段缺失')
  }
  const candidate = saveIntent.candidate
  if (!candidate || !candidate.targetDogId || !candidate.mealTime) {
    fail('INVALID_PAYLOAD', '本餐快照字段缺失')
  }
  if (!Array.isArray(candidate.photoFileIds) || candidate.photoFileIds.length > 0) {
    fail('INVALID_PAYLOAD', '当前版本暂不支持照片')
  }
  if (!Array.isArray(candidate.dogMealItems) || !candidate.dogMealItems.length) {
    fail('INVALID_PAYLOAD', '本餐食材不能为空')
  }
  const ingredients = canonicalizeIngredients(candidate.dogMealItems)
  ingredients.forEach((ingredient) => {
    if (!ingredient.ingredientId || ingredient.ingredientId !== ingredient.foodId) {
      fail('INVALID_INGREDIENT', '食材营养身份无效')
    }
    if (!ingredient.conceptId || !ingredient.variantId || !(ingredient.perMealAmountGram > 0)) {
      fail('INVALID_INGREDIENT', '食材目录身份或克重无效')
    }
    if (!canAddIngredient(ingredient)) fail('BLOCKED_INGREDIENT', '被阻止食材不可保存')
    const versions = ingredient.dataVersions
    if (!versions.runtimeReleaseId || !versions.catalogVersion || !versions.policyVersion || !versions.nutritionSourceReleaseId) {
      fail('INVALID_VERSION', '食材版本字段不完整')
    }
  })
  validateSourceRefs(candidate, ingredients)
  const normalizedCandidate = { ...candidate, dogMealItems: ingredients }
  if (fingerprint(normalizedCandidate) !== saveIntent.requestFingerprint) {
    fail('FINGERPRINT_MISMATCH', '保存内容校验失败')
  }
  return { saveIntent, candidate: normalizedCandidate, ingredients }
}

async function loadActiveRelease(database) {
  const result = await database.collection('data_releases')
    .where({ status: 'active' })
    .orderBy('generated_at', 'desc')
    .orderBy('_id', 'desc')
    .limit(1)
    .get()
  const release = result.data && result.data[0]
  if (!release) fail('ACTIVE_RELEASE_MISSING', '当前活动数据版本不可用')
  return release
}

function assertActiveVersions(candidate, release) {
  const versions = candidate.versions || {}
  const mappings = [
    ['runtimeReleaseId', 'release_id'],
    ['recipeVersion', 'recipe_version'],
    ['mappingVersion', 'mapping_version'],
    ['catalogVersion', 'catalog_version'],
    ['policyVersion', 'policy_version']
  ]
  mappings.forEach(([clientKey, serverKey]) => {
    if (versions[clientKey] != null && release[serverKey] != null && String(versions[clientKey]) !== String(release[serverKey])) {
      fail('VERSION_CONFLICT', '保存数据版本已失效，请重新评估')
    }
  })
}

async function validateOwnershipAndCatalog(database, openId, validated) {
  const dogResult = await database.collection('dogs').doc(validated.candidate.targetDogId).get()
  if (!dogResult.data || dogResult.data._openid !== openId) fail('FORBIDDEN_DOG', '无权使用该狗狗档案')
  const dog = dogResult.data
  const release = await loadActiveRelease(database)
  assertActiveVersions(validated.candidate, release)
  await Promise.all(validated.ingredients.map(async (ingredient) => {
    const result = await database.collection('ingredient_catalog').where({
      concept_id: ingredient.conceptId,
      variant_id: ingredient.variantId,
      catalog_version: ingredient.dataVersions.catalogVersion,
      policy_version: ingredient.dataVersions.policyVersion
    }).limit(1).get()
    const current = result.data && result.data[0]
    if (!current || String(current.food_id || '') !== ingredient.foodId) {
      fail('INGREDIENT_NOT_FOUND', '食材目录身份已失效')
    }
    if (!canAddIngredient(current)) {
      fail('BLOCKED_INGREDIENT', '被阻止食材不可保存')
    }
    if (isIngredientAllergen({ ...current, name: ingredient.name }, dog)) {
      fail('DOG_ALLERGEN', `${dog.name || '狗狗'}对此食材过敏，不能保存`)
    }
  }))
}

async function findIdempotent(collection, openId, key) {
  const result = await collection.where({ _openid: openId, idempotencyKey: key }).limit(1).get()
  return result.data && result.data[0] || null
}

function assertSameRequest(existed, saveIntent) {
  if (existed.requestFingerprint !== saveIntent.requestFingerprint) {
    fail('IDEMPOTENCY_CONFLICT', '相同保存请求包含不同内容')
  }
  return normalizeRecord(existed)
}

function validateUpdateIntent(updateIntent) {
  if (!updateIntent || updateIntent.schemaVersion !== 1) {
    fail('INVALID_PAYLOAD', '更新数据格式无效')
  }
  const recordId = String(updateIntent.recordId || '').trim()
  const expectedRevision = Number(updateIntent.expectedRevision)
  if (!recordId) fail('INVALID_PAYLOAD', '更新记录 ID 缺失')
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    fail('INVALID_PAYLOAD', '更新版本字段无效')
  }
  if (!updateIntent.updateKey || !updateIntent.updateFingerprint) {
    fail('INVALID_PAYLOAD', '更新幂等字段缺失')
  }
  const validated = validateSaveIntent({
    schemaVersion: 1,
    idempotencyKey: updateIntent.updateKey,
    requestFingerprint: updateIntent.updateFingerprint,
    candidate: updateIntent.candidate
  })
  return {
    ...validated,
    recordId,
    expectedRevision,
    updateKey: String(updateIntent.updateKey),
    updateFingerprint: String(updateIntent.updateFingerprint)
  }
}

function decodeCursor(value) {
  if (!value) return null
  try {
    const cursor = JSON.parse(decodeURIComponent(String(value)))
    if (!cursor.mealTime || !cursor.id) throw new Error('invalid')
    return cursor
  } catch (error) {
    fail('INVALID_CURSOR', '记录分页游标无效')
  }
}

function encodeCursor(record) {
  return encodeURIComponent(JSON.stringify({ mealTime: record.mealTime, id: record._id || record.id }))
}

function normalizeTimeBoundary(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const timestamp = new Date(text).getTime()
  if (!Number.isFinite(timestamp)) fail('INVALID_DATE_RANGE', '本餐记录查询时间范围无效')
  return new Date(timestamp).toISOString()
}

function appendMealTimeRangeConditions(database, event, conditions) {
  const startTime = normalizeTimeBoundary(event.startTime)
  const endTime = normalizeTimeBoundary(event.endTime)
  if (startTime && endTime && startTime >= endTime) {
    fail('INVALID_DATE_RANGE', '本餐记录查询时间范围无效')
  }
  if (startTime) conditions.push({ mealTime: database.command.gte(startTime) })
  if (endTime) conditions.push({ mealTime: database.command.lt(endTime) })
}

async function runAtomic(database, operation) {
  if (typeof database.runTransaction === 'function') {
    return database.runTransaction(operation)
  }
  if (typeof database.startTransaction !== 'function') {
    throw new Error('本餐记录服务缺少事务能力')
  }
  const transaction = await database.startTransaction()
  try {
    const result = await operation(transaction)
    await transaction.commit()
    return result
  } catch (error) {
    await transaction.rollback()
    throw error
  }
}

function buildUpdatedRecord(current, candidate, updateIntent, updatedAt) {
  return normalizeRecord({
    ...current,
    ...candidate,
    _openid: current._openid,
    _id: current._id,
    id: current.id,
    targetDogId: current.targetDogId,
    mealTime: current.mealTime,
    createdAt: current.createdAt,
    updatedAt,
    revision: (Number(current.revision) || 1) + 1,
    lastUpdateKey: updateIntent.updateKey,
    lastUpdateFingerprint: updateIntent.updateFingerprint
  })
}

function createSharedMealRecordGateway({ database, openId, now = () => new Date() }) {
  const collection = database.collection('shared_meal_records')
  return async function gateway(event = {}) {
    if (!openId) fail('UNAUTHENTICATED', '请先登录')
    if (event.action === 'save') {
      const validated = validateSaveIntent(event.payload)
      const existed = await findIdempotent(collection, openId, validated.saveIntent.idempotencyKey)
      if (existed) return assertSameRequest(existed, validated.saveIntent)
      await validateOwnershipAndCatalog(database, openId, validated)
      const record = {
        ...validated.candidate,
        _openid: openId,
        idempotencyKey: validated.saveIntent.idempotencyKey,
        requestFingerprint: validated.saveIntent.requestFingerprint,
        createdAt: now(),
        updatedAt: now(),
        revision: 1
      }
      try {
        const result = await collection.add({ data: record })
        return normalizeRecord({ ...record, _id: result._id })
      } catch (error) {
        const raced = await findIdempotent(collection, openId, validated.saveIntent.idempotencyKey)
        if (raced) return assertSameRequest(raced, validated.saveIntent)
        throw error
      }
    }
    if (event.action === 'update') {
      const validated = validateUpdateIntent(event.payload)
      return runAtomic(database, async (transaction) => {
        const currentResult = await transaction.collection('shared_meal_records')
          .doc(validated.recordId)
          .get()
        const current = currentResult && currentResult.data
        if (!current || current._openid !== openId) fail('NOT_FOUND', '未找到本餐记录')

        if (current.lastUpdateKey === validated.updateKey) {
          if (current.lastUpdateFingerprint !== validated.updateFingerprint) {
            fail('IDEMPOTENCY_CONFLICT', '相同更新请求包含不同内容')
          }
          return normalizeRecord(current)
        }
        if (!isEditableToday(current, now())) {
          fail('EDIT_WINDOW_EXPIRED', '这顿饭已进入历史，只能查看')
        }
        if ((Number(current.revision) || 1) !== validated.expectedRevision) {
          fail('REVISION_CONFLICT', '这顿饭已被更新，请重新读取后再修改')
        }
        if (validated.candidate.targetDogId !== current.targetDogId) {
          fail('DOG_IMMUTABLE', '本餐记录不能更换狗狗')
        }
        if (validated.candidate.mealTime !== current.mealTime) {
          fail('MEAL_TIME_IMMUTABLE', '本餐记录不能更改用餐时间')
        }

        await validateOwnershipAndCatalog(transaction, openId, validated)
        const updatedAt = now()
        const updated = buildUpdatedRecord(current, validated.candidate, validated, updatedAt)
        const { _id, _openid, id, ...data } = updated
        await transaction.collection('shared_meal_records').doc(validated.recordId).update({
          data: {
            ...data,
            _openid,
            id
          }
        })
        return normalizeRecord(updated)
      })
    }
    if (event.action === 'list') {
      const limit = Math.min(Math.max(Number(event.limit) || 20, 1), MAX_PAGE_SIZE)
      const cursor = decodeCursor(event.cursor)
      const conditions = [{ _openid: openId }]
      if (event.targetDogId) conditions.push({ targetDogId: String(event.targetDogId) })
      appendMealTimeRangeConditions(database, event, conditions)
      if (cursor) {
        conditions.push(database.command.or([
          { mealTime: database.command.lt(cursor.mealTime) },
          { mealTime: cursor.mealTime, _id: database.command.lt(cursor.id) }
        ]))
      }
      const where = conditions.length === 1 ? conditions[0] : database.command.and(conditions)
      const result = await collection.where(where)
        .orderBy('mealTime', 'desc').orderBy('_id', 'desc').limit(limit + 1).get()
      const rows = result.data || []
      const page = rows.slice(0, limit)
      return {
        items: page.map(normalizeRecord),
        nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null
      }
    }
    if (event.action === 'get') {
      const result = await collection.doc(String(event.recordId || '')).get()
      if (!result.data || result.data._openid !== openId) fail('NOT_FOUND', '未找到本餐记录')
      return normalizeRecord(result.data)
    }
    fail('UNSUPPORTED_ACTION', '不支持的记录操作')
  }
}

async function main(event) {
  const cloud = require('wx-server-sdk')
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
  return createSharedMealRecordGateway({
    database: cloud.database(),
    openId: cloud.getWXContext().OPENID
  })(event)
}

module.exports = {
  main,
  createSharedMealRecordGateway,
  validateSaveIntent,
  validateUpdateIntent,
  isEditableToday,
  shanghaiDateKey,
  runAtomic,
  encodeCursor,
  decodeCursor,
  appendMealTimeRangeConditions
}
