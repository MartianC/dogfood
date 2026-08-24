const SUPPORTED_BREEDS = [
  'chihuahua',
  'yorkshire-terrier',
  'pomeranian',
  'toy-poodle',
  'maltese',
  'papillon',
  'miniature-pinscher',
  'japanese-chin',
  'havanese',
  'chinese-crested',
  'italian-greyhound',
  'coton-de-tulear',
  'miniature-poodle',
  'bichon-frise',
  'shih-tzu',
  'pug',
  'pekingese',
  'cavalier-king-charles',
  'miniature-schnauzer',
  'cairn-terrier',
  'west-highland-white-terrier',
  'scottish-terrier',
  'boston-terrier',
  'french-bulldog',
  'lhasa-apso',
  'tibetan-spaniel',
  'schipperke',
  'welsh-terrier',
  'border-terrier',
  'norwich-terrier',
  'australian-terrier',
  'silky-terrier',
  'affenpinscher',
  'brussels-griffon',
  'tibetan-terrier',
  'beagle',
  'shiba-inu',
  'corgi',
  'cardigan-welsh-corgi',
  'basenji',
  'bulldog',
  'american-eskimo',
  'samoyed',
  'siberian-husky',
  'border-collie',
  'australian-shepherd',
  'english-springer-spaniel',
  'cocker-spaniel',
  'welsh-springer-spaniel',
  'brittany',
  'shetland-sheepdog',
  'collie',
  'old-english-sheepdog',
  'standard-schnauzer',
  'soft-coated-wheaten-terrier',
  'portuguese-water-dog',
  'vizsla',
  'weimaraner',
  'german-shorthaired-pointer',
  'whippet',
  'shar-pei',
  'chow-chow',
  'dalmatian',
  'staffordshire-bull-terrier',
  'keeshond',
  'airedale-terrier',
  'borzoi',
  'afghan-hound',
  'saluki',
  'ibizan-hound',
  'greyhound',
  'standard-poodle',
  'akita',
  'boxer',
  'doberman-pinscher',
  'rottweiler',
  'german-shepherd',
  'golden-retriever',
  'labrador-retriever',
  'chesapeake-bay-retriever',
  'flat-coated-retriever',
  'nova-scotia-duck-tolling-retriever',
  'irish-setter',
  'english-setter',
  'gordon-setter',
  'giant-schnauzer',
  'bouvier-des-flandres',
  'alaskan-malamute',
  'cane-corso',
  'great-dane',
  'great-pyrenees',
  'bernese-mountain-dog',
  'greater-swiss-mountain-dog',
  'newfoundland',
  'saint-bernard',
  'mastiff',
  'neapolitan-mastiff',
  'irish-wolfhound',
  'komondor',
  'kuvasz',
  'tibetan-mastiff',
  'chinese-rural-dog',
  'mixed-or-unknown'
]
const BREEDS = new Set(SUPPORTED_BREEDS)
const BODY_CONDITIONS = new Set(['thin', 'ideal', 'overweight'])
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
const DOG_PROFILE_SCHEMA_VERSION = 3
const REPRODUCTIVE_STATUSES = new Set(['none', 'pregnant', 'lactating', null])
const THERAPEUTIC_WEIGHT_MANAGEMENT_STATUSES = new Set(['none', 'loss', 'gain', null])

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

function isAtMostTwoDecimalPlaces(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return false
  return Math.abs(number * 100 - Math.round(number * 100)) <= 1e-8
}

function deriveActivityLevel(hours) {
  if (!Number.isFinite(hours) || hours < 0 || hours > 6) return ''
  if (hours < 1) return 'low'
  if (hours < 2) return 'moderateLowImpact'
  if (hours < 3) return 'moderateHighImpact'
  return 'high'
}

function normalizeSpecialNutritionNeeds(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    hasDisease: hasOwn(source, 'hasDisease') ? source.hasDisease : null,
    reproductiveStatus: hasOwn(source, 'reproductiveStatus')
      ? source.reproductiveStatus
      : null,
    therapeuticWeightManagement: hasOwn(source, 'therapeuticWeightManagement')
      ? source.therapeuticWeightManagement
      : null
  }
}

function validateSpecialNutritionNeeds(value) {
  const needs = normalizeSpecialNutritionNeeds(value)
  if (
    ![true, false, null].includes(needs.hasDisease)
    || !REPRODUCTIVE_STATUSES.has(needs.reproductiveStatus)
    || !THERAPEUTIC_WEIGHT_MANAGEMENT_STATUSES.has(needs.therapeuticWeightManagement)
  ) throw new Error('特殊营养需求数据格式不正确')
  return needs
}

function normalizedFields(payload = {}) {
  const hasActivityHours = payload.dailyActivityHours !== ''
    && payload.dailyActivityHours !== null
    && payload.dailyActivityHours !== undefined
  const dailyActivityHours = hasActivityHours ? Number(payload.dailyActivityHours) : null

  return {
    schemaVersion: DOG_PROFILE_SCHEMA_VERSION,
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
    specialNutritionNeeds: normalizeSpecialNutritionNeeds(payload.specialNutritionNeeds),
    healthNotes: payload.healthNotes || ''
  }
}

function normalizeProfileDocument(doc = {}) {
  return {
    schemaVersion: DOG_PROFILE_SCHEMA_VERSION,
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
    specialNutritionNeeds: normalizeSpecialNutritionNeeds(doc.specialNutritionNeeds),
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
  if (!isAtMostTwoDecimalPlaces(profile.weightKg)) throw new Error('体重最多保留两位小数')
  if (!(profile.dailyMeals > 0)) throw new Error('请填写每日餐数')
  if (
    !Number.isFinite(profile.dailyActivityHours)
    || profile.dailyActivityHours < 0
    || profile.dailyActivityHours > 6
    || !Number.isInteger(profile.dailyActivityHours * 2)
  ) throw new Error('请选择 0–6 小时的日均活动时长')
  if (!BODY_CONDITIONS.has(profile.bodyCondition)) throw new Error('请选择体况')
  validateSpecialNutritionNeeds(profile.specialNutritionNeeds)
}

function allergensForWrite(value) {
  if (!Array.isArray(value)) throw new Error('过敏源数据格式不正确')
  if (
    value.some((item) => typeof item !== 'string' || !item.trim() || item.length > 300)
  ) throw new Error('过敏食材数据格式不正确')
  return value.slice()
}

function fieldsForWrite(payload = {}, options = {}) {
  const fields = normalizedFields(payload)
  validateProfilePayload(fields, options)

  if (hasOwn(payload, 'allergens')) {
    fields.allergens = allergensForWrite(payload.allergens)
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
  allergensForWrite,
  fieldsForWrite
}
