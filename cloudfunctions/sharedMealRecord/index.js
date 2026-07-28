const {
  canonicalizeIngredients,
  fingerprint
} = require('./sharedMealContract')

const MAX_PAGE_SIZE = 20

function fail(code, message) {
  const error = new Error(message)
  error.code = code
  throw error
}

function normalizeRecord(document) {
  return { ...document, id: String(document.id || document._id || '') }
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
    if (ingredient.policyStatus === 'blocked') fail('BLOCKED_INGREDIENT', '被阻止食材不可保存')
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
    if (String(current.policy_status || 'unknown') === 'blocked') {
      fail('BLOCKED_INGREDIENT', '被阻止食材不可保存')
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

function createSharedMealRecordGateway({ database, openId }) {
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
        createdAt: new Date()
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
    if (event.action === 'list') {
      const limit = Math.min(Math.max(Number(event.limit) || 20, 1), MAX_PAGE_SIZE)
      const cursor = decodeCursor(event.cursor)
      const conditions = [{ _openid: openId }]
      if (event.targetDogId) conditions.push({ targetDogId: String(event.targetDogId) })
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
  encodeCursor,
  decodeCursor
}
