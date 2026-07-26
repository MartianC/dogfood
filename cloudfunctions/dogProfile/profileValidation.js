const SUPPORTED_BREEDS = [
  'shiba-inu',
  'labrador-retriever',
  'mixed-or-unknown'
]
const BREEDS = new Set(SUPPORTED_BREEDS)
const BODY_CONDITIONS = new Set(['thin', 'ideal', 'overweight'])
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function shanghaiDateText(now = new Date()) {
  const instant = now instanceof Date ? now : new Date(now)
  if (!Number.isFinite(instant.getTime())) return ''

  const date = new Date(instant.getTime() + SHANGHAI_OFFSET_MS)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateText(value) {
  const match = String(value || '').match(DATE_PATTERN)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const stamp = Date.UTC(year, month - 1, day)
  const checked = new Date(stamp)
  if (
    checked.getUTCFullYear() !== year
    || checked.getUTCMonth() !== month - 1
    || checked.getUTCDate() !== day
  ) return null
  return { stamp }
}

function deriveActivityLevel(hours) {
  if (!Number.isFinite(hours) || hours < 0 || hours > 6) return ''
  if (hours < 1) return 'low'
  if (hours < 2) return 'moderateLowImpact'
  if (hours < 3) return 'moderateHighImpact'
  return 'high'
}

function normalizedFields(payload = {}) {
  const hasActivityHours = payload.dailyActivityHours !== ''
    && payload.dailyActivityHours !== null
    && payload.dailyActivityHours !== undefined
  const dailyActivityHours = hasActivityHours ? Number(payload.dailyActivityHours) : null

  return {
    name: String(payload.name || '').trim(),
    birthDate: String(payload.birthDate || '').trim(),
    breed: String(payload.breed || '').trim(),
    weightKg: Number(payload.weightKg || 0),
    dailyMeals: Number(payload.dailyMeals || 0),
    dailyActivityHours,
    activityLevel: deriveActivityLevel(dailyActivityHours),
    bodyCondition: String(payload.bodyCondition || '').trim(),
    avatarUrl: payload.avatarUrl || '',
    neutered: Boolean(payload.neutered),
    dietGoal: payload.dietGoal || 'daily',
    healthNotes: payload.healthNotes || ''
  }
}

function normalizeProfileDocument(doc = {}) {
  return {
    id: doc._id,
    userId: doc._openid,
    name: doc.name,
    birthDate: doc.birthDate || '',
    ageStage: doc.ageStage,
    weightKg: doc.weightKg,
    dailyMeals: doc.dailyMeals,
    dailyActivityHours: doc.dailyActivityHours,
    avatarUrl: doc.avatarUrl || '',
    breed: doc.breed || '',
    neutered: Boolean(doc.neutered),
    ...(hasOwn(doc, 'activityLevel') ? { activityLevel: doc.activityLevel } : {}),
    bodyCondition: doc.bodyCondition || '',
    dietGoal: doc.dietGoal || 'daily',
    allergens: doc.allergens || [],
    avoidIngredients: doc.avoidIngredients || [],
    healthNotes: doc.healthNotes || '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  }
}

function validateProfilePayload(profile, { today, now } = {}) {
  if (!profile.name) throw new Error('请填写狗狗名字')

  const birth = parseDateText(profile.birthDate)
  const current = parseDateText(today || shanghaiDateText(now))
  if (!birth || !current) throw new Error('请填写正确的出生日期')
  if (birth.stamp > current.stamp) throw new Error('出生日期不能晚于今天')

  if (!BREEDS.has(profile.breed)) throw new Error('请选择狗狗品种')
  if (!(profile.weightKg > 0)) throw new Error('请填写狗狗体重')
  if (!(profile.dailyMeals > 0)) throw new Error('请填写每日餐数')
  if (
    !Number.isFinite(profile.dailyActivityHours)
    || profile.dailyActivityHours < 0
    || profile.dailyActivityHours > 6
    || !Number.isInteger(profile.dailyActivityHours * 2)
  ) throw new Error('请选择 0–6 小时的日均活动时长')
  if (!BODY_CONDITIONS.has(profile.bodyCondition)) throw new Error('请选择体况')
}

function fieldsForWrite(payload = {}, options = {}) {
  const fields = normalizedFields(payload)
  validateProfilePayload(fields, options)

  if (hasOwn(payload, 'allergens')) {
    if (!Array.isArray(payload.allergens)) throw new Error('过敏源数据格式不正确')
    fields.allergens = payload.allergens.slice()
  } else if (options.initializeHiddenFields) {
    fields.allergens = []
  }

  if (hasOwn(payload, 'avoidIngredients')) {
    if (!Array.isArray(payload.avoidIngredients)) throw new Error('忌口数据格式不正确')
    fields.avoidIngredients = payload.avoidIngredients.slice()
  } else if (options.initializeHiddenFields) {
    fields.avoidIngredients = []
  }

  return fields
}

module.exports = {
  SUPPORTED_BREEDS,
  shanghaiDateText,
  normalizeProfileDocument,
  validateProfilePayload,
  fieldsForWrite
}
