// 此文件由 scripts/sync-weight-contract.js 自动生成，请修改 services/weightContract.js 后重新同步。
const WEIGHT_MEASUREMENT_CONTRACT = 'weightMeasurement/v1'
const WEIGHT_MEASUREMENT_SCHEMA_VERSION = 1
const WEIGHT_MEASUREMENT_KEYS = Object.freeze([
  'schemaVersion',
  'id',
  'dogId',
  'weightKg',
  'measuredOn',
  'createdAt'
])
const WEIGHT_MEASUREMENT_WRITE_KEYS = Object.freeze([
  'schemaVersion',
  'dogId',
  'weightKg',
  'measuredOn'
])

const WEIGHT_CURRENT_WEIGHT_SOURCES = Object.freeze({
  MEASUREMENT: 'measurement',
  LEGACY_PROFILE: 'legacy-profile',
  NONE: 'none'
})

const WEIGHT_DELETE_OUTCOMES = Object.freeze({
  FALLBACK_TO_PREVIOUS: 'fallback-to-previous-measurement',
  UNRECORDED: 'unrecorded',
  CURRENT_UNCHANGED: 'current-unchanged'
})

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const actual = Object.keys(value).sort()
  const expected = expectedKeys.slice().sort()
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0
}

function dateTextInShanghai(now = new Date()) {
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

function isValidTimestamp(value) {
  return ISO_TIMESTAMP_PATTERN.test(String(value || ''))
    && Number.isFinite(new Date(value).getTime())
}

function isAtMostTwoDecimalPlaces(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return false
  return Math.abs(number * 100 - Math.round(number * 100)) <= 1e-8
}

function validateWeightKg(value, { allowLegacyPrecision = false } = {}) {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error('体重必须大于 0')
  }
  if (!allowLegacyPrecision && !isAtMostTwoDecimalPlaces(number)) {
    throw new Error('体重最多保留两位小数')
  }
  return number
}

function normalizeLegacyWeightKg(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return null
  return number
}

function validateWeightMeasurement(measurement, { today, now } = {}) {
  if (!hasExactKeys(measurement, WEIGHT_MEASUREMENT_KEYS)) {
    throw new Error('体重测量记录字段不完整')
  }
  if (measurement.schemaVersion !== WEIGHT_MEASUREMENT_SCHEMA_VERSION) {
    throw new Error('体重测量记录版本无效')
  }
  if (!isNonEmptyString(measurement.id) || !isNonEmptyString(measurement.dogId)) {
    throw new Error('体重测量记录身份字段无效')
  }

  validateWeightKg(measurement.weightKg)

  const measuredDate = parseDateText(measurement.measuredOn)
  if (!measuredDate) throw new Error('体重测量日期无效')
  const currentDate = parseDateText(today || dateTextInShanghai(now))
  if (!currentDate) throw new Error('当前自然日无效')
  if (measuredDate.stamp > currentDate.stamp) {
    throw new Error('体重测量日期不能晚于今天')
  }
  if (!isValidTimestamp(measurement.createdAt)) {
    throw new Error('体重测量创建时间无效')
  }
  return measurement
}

function normalizeWeightMeasurementInput(payload = {}, options = {}) {
  if (!hasExactKeys(payload, WEIGHT_MEASUREMENT_WRITE_KEYS)) {
    throw new Error('体重测量写入字段不完整')
  }
  if (payload.schemaVersion !== WEIGHT_MEASUREMENT_SCHEMA_VERSION) {
    throw new Error('体重测量写入版本无效')
  }

  const input = {
    schemaVersion: WEIGHT_MEASUREMENT_SCHEMA_VERSION,
    dogId: String(payload.dogId || '').trim(),
    weightKg: Number(payload.weightKg),
    measuredOn: String(payload.measuredOn || '').trim()
  }
  if (!input.dogId) throw new Error('体重测量写入缺少目标狗狗')
  validateWeightKg(input.weightKg)
  const measuredDate = parseDateText(input.measuredOn)
  if (!measuredDate) throw new Error('体重测量日期无效')
  const currentDate = parseDateText(options.today || dateTextInShanghai(options.now))
  if (!currentDate) throw new Error('当前自然日无效')
  if (measuredDate.stamp > currentDate.stamp) {
    throw new Error('体重测量日期不能晚于今天')
  }
  return input
}

function normalizeWeightMeasurement(payload = {}, options = {}) {
  const normalized = {
    schemaVersion: WEIGHT_MEASUREMENT_SCHEMA_VERSION,
    id: String(payload.id || payload._id || '').trim(),
    dogId: String(payload.dogId || '').trim(),
    weightKg: Number(payload.weightKg),
    measuredOn: String(payload.measuredOn || '').trim(),
    createdAt: String(payload.createdAt || '').trim()
  }
  return validateWeightMeasurement(normalized, options)
}

function validateWeightMeasurementList(measurements, options = {}) {
  if (!Array.isArray(measurements)) throw new Error('体重测量记录列表无效')
  return measurements.map((measurement) => validateWeightMeasurement(measurement, options))
}

function compareNewestFirst(left, right) {
  if (left.measuredOn !== right.measuredOn) {
    return right.measuredOn.localeCompare(left.measuredOn)
  }
  const createdAtDifference = new Date(right.createdAt).getTime()
    - new Date(left.createdAt).getTime()
  if (createdAtDifference !== 0) return createdAtDifference
  return right.id.localeCompare(left.id)
}

function sortWeightMeasurements(measurements) {
  if (!Array.isArray(measurements)) throw new Error('体重测量记录列表无效')
  return measurements.slice().sort(compareNewestFirst)
}

function selectLatestValidWeightMeasurement(measurements, options = {}) {
  if (!Array.isArray(measurements)) throw new Error('体重测量记录列表无效')
  return measurements
    .filter((measurement) => {
      try {
        validateWeightMeasurement(measurement, options)
        return true
      } catch (error) {
        return false
      }
    })
    .sort((left, right) => compareNewestFirst(left, right))[0] || null
}

function currentWeightFromMeasurement(measurement) {
  if (!measurement) {
    return {
      source: WEIGHT_CURRENT_WEIGHT_SOURCES.NONE,
      weightKg: null,
      measuredOn: null,
      measurementId: null
    }
  }
  return {
    source: WEIGHT_CURRENT_WEIGHT_SOURCES.MEASUREMENT,
    weightKg: measurement.weightKg,
    measuredOn: measurement.measuredOn,
    measurementId: measurement.id
  }
}

function resolveCurrentWeight({ profileWeightKg, measurements = [], today, now } = {}) {
  if (!Array.isArray(measurements)) throw new Error('体重测量记录列表无效')
  const options = { today, now }
  const latest = selectLatestValidWeightMeasurement(measurements, options)
  if (latest) return currentWeightFromMeasurement(latest)

  // 只在尚未产生任何历史记录时兼容旧档案字段；不能用旧字段替代带日期的测量事实。
  if (measurements.length === 0) {
    const legacyWeightKg = normalizeLegacyWeightKg(profileWeightKg)
    if (legacyWeightKg !== null) {
      return {
        source: WEIGHT_CURRENT_WEIGHT_SOURCES.LEGACY_PROFILE,
        weightKg: legacyWeightKg,
        measuredOn: null,
        measurementId: null
      }
    }
  }
  return currentWeightFromMeasurement(null)
}

function planDeleteWeightMeasurement(measurements, measurementId, options = {}) {
  const validMeasurements = validateWeightMeasurementList(measurements, options)
  const target = validMeasurements.find((measurement) => measurement.id === measurementId)
  if (!target) throw new Error('体重测量记录不存在')

  const latestBefore = selectLatestValidWeightMeasurement(validMeasurements, options)
  const remainingMeasurements = validMeasurements.filter((measurement) => measurement.id !== measurementId)
  const latestAfter = selectLatestValidWeightMeasurement(remainingMeasurements, options)
  const deletedLatest = latestBefore && latestBefore.id === measurementId

  return {
    deletedMeasurementId: measurementId,
    remainingMeasurements,
    latestMeasurement: latestAfter,
    currentWeight: currentWeightFromMeasurement(latestAfter),
    outcome: deletedLatest
      ? latestAfter
        ? WEIGHT_DELETE_OUTCOMES.FALLBACK_TO_PREVIOUS
        : WEIGHT_DELETE_OUTCOMES.UNRECORDED
      : WEIGHT_DELETE_OUTCOMES.CURRENT_UNCHANGED
  }
}

module.exports = {
  WEIGHT_MEASUREMENT_CONTRACT,
  WEIGHT_MEASUREMENT_SCHEMA_VERSION,
  WEIGHT_MEASUREMENT_KEYS,
  WEIGHT_MEASUREMENT_WRITE_KEYS,
  WEIGHT_CURRENT_WEIGHT_SOURCES,
  WEIGHT_DELETE_OUTCOMES,
  dateTextInShanghai,
  parseDateText,
  validateWeightKg,
  normalizeLegacyWeightKg,
  isValidTimestamp,
  validateWeightMeasurement,
  normalizeWeightMeasurementInput,
  normalizeWeightMeasurement,
  validateWeightMeasurementList,
  sortWeightMeasurements,
  selectLatestValidWeightMeasurement,
  resolveCurrentWeight,
  currentWeightFromMeasurement,
  planDeleteWeightMeasurement
}
