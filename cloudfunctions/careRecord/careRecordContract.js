// 此文件由 scripts/sync-care-record-contract.js 自动生成，请修改 contracts/care/careRecordContract.js 后同步。

const CARE_RECORD_CONTRACT = 'careRecord/v1'
const CARE_RECORD_SCHEMA_VERSION = 1

const CARE_RECORD_TYPES = Object.freeze([
  'vaccine',
  'internal_deworming',
  'external_deworming',
  'other'
])

const CARE_RECORD_KEYS = Object.freeze([
  'schemaVersion',
  'id',
  'dogId',
  'type',
  'name',
  'occurredOn',
  'nextDate',
  'notes',
  'createdAt',
  'updatedAt'
])

const CARE_RECORD_WRITE_KEYS = Object.freeze([
  'schemaVersion',
  'dogId',
  'type',
  'name',
  'occurredOn',
  'nextDate',
  'notes'
])

const CARE_RECORD_TYPE_LABELS = Object.freeze({
  vaccine: '疫苗',
  internal_deworming: '体内驱虫',
  external_deworming: '体外驱虫',
  other: '其他护理'
})

const CARE_RECORD_NAME_MAX_LENGTH = 120
const CARE_RECORD_NOTES_MAX_LENGTH = 2000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/
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
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return null

  const [year, month, day] = value.split('-').map(Number)
  const stamp = Date.UTC(year, month - 1, day)
  const checked = new Date(stamp)
  if (
    checked.getUTCFullYear() !== year
    || checked.getUTCMonth() !== month - 1
    || checked.getUTCDate() !== day
  ) return null
  return { stamp }
}

function normalizeOptionalDate(value) {
  const text = String(value == null ? '' : value).trim()
  return text ? text : null
}

function normalizeCareRecordFields(payload = {}) {
  return {
    type: String(payload.type || '').trim(),
    name: String(payload.name || '').trim(),
    occurredOn: String(payload.occurredOn || '').trim(),
    nextDate: normalizeOptionalDate(payload.nextDate),
    notes: String(payload.notes || '').trim()
  }
}

function assertTextLength(value, maxLength, label) {
  if (Array.from(value).length > maxLength) {
    throw new Error(`${label}不能超过${maxLength}个字`)
  }
}

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const actual = Object.keys(value).sort()
  const expected = expectedKeys.slice().sort()
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
}

function isValidTimestamp(value) {
  return ISO_TIMESTAMP_PATTERN.test(String(value || ''))
    && Number.isFinite(new Date(value).getTime())
}

function resolveToday(options = {}) {
  const todayText = options.today || shanghaiDateText(options.now)
  const today = parseDateText(String(todayText))
  if (!today) throw new Error('护理日期校验参考日期无效')
  return today
}

function validateCareRecordFields(payload = {}, options = {}) {
  const fields = normalizeCareRecordFields(payload)
  if (!CARE_RECORD_TYPES.includes(fields.type)) throw new Error('护理类型无效')

  assertTextLength(fields.name, CARE_RECORD_NAME_MAX_LENGTH, '护理名称')
  assertTextLength(fields.notes, CARE_RECORD_NOTES_MAX_LENGTH, '护理备注')

  const occurred = parseDateText(fields.occurredOn)
  if (!occurred) throw new Error('请填写正确的护理发生日期')

  const today = resolveToday(options)
  if (occurred.stamp > today.stamp) throw new Error('护理发生日期不能晚于今天')

  if (fields.nextDate !== null) {
    const next = parseDateText(fields.nextDate)
    if (!next) throw new Error('请填写正确的下次护理日期')
    if (next.stamp < occurred.stamp) throw new Error('下次护理日期不能早于发生日期')
  }

  return fields
}

function normalizeCareRecordInput(payload = {}) {
  const fields = normalizeCareRecordFields(payload)
  return {
    schemaVersion: CARE_RECORD_SCHEMA_VERSION,
    dogId: String(payload.dogId || '').trim(),
    ...fields
  }
}

function validateCareRecordInput(payload = {}, options = {}) {
  if (
    !payload
    || typeof payload !== 'object'
    || Array.isArray(payload)
    || Object.keys(payload).some((key) => !CARE_RECORD_WRITE_KEYS.includes(key))
  ) throw new Error('护理记录写入字段不完整')
  if (hasOwn(payload, 'schemaVersion') && payload.schemaVersion !== CARE_RECORD_SCHEMA_VERSION) {
    throw new Error('护理记录版本无效')
  }
  const input = normalizeCareRecordInput(payload)
  if (!input.dogId) throw new Error('护理记录缺少目标狗狗')
  return {
    ...input,
    ...validateCareRecordFields(input, options)
  }
}

function normalizeCareRecord(record = {}) {
  return {
    schemaVersion: CARE_RECORD_SCHEMA_VERSION,
    id: String(record.id || record._id || '').trim(),
    dogId: String(record.dogId || '').trim(),
    ...normalizeCareRecordFields(record),
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null
  }
}

function validateCareRecord(record = {}, options = {}) {
  const normalized = normalizeCareRecord(record)
  if (!hasExactKeys(normalized, CARE_RECORD_KEYS)) {
    throw new Error('护理记录字段不完整')
  }
  if (!normalized.id) throw new Error('护理记录缺少记录标识')
  if (!normalized.dogId) throw new Error('护理记录缺少目标狗狗')
  if (record.schemaVersion !== CARE_RECORD_SCHEMA_VERSION) {
    throw new Error('护理记录版本无效')
  }
  if (!isValidTimestamp(normalized.createdAt) || !isValidTimestamp(normalized.updatedAt)) {
    throw new Error('护理记录缺少审计时间')
  }
  return {
    ...normalized,
    ...validateCareRecordFields(normalized, options)
  }
}

function assertCareRecordServiceContract(contract) {
  if (
    !contract
    || contract.contract !== CARE_RECORD_CONTRACT
    || contract.schemaVersion !== CARE_RECORD_SCHEMA_VERSION
    || contract.supportedTypes !== CARE_RECORD_TYPES.join(',')
  ) throw new Error('护理服务版本过旧，请更新 careRecord 云函数后重试')
  return contract
}

module.exports = {
  CARE_RECORD_CONTRACT,
  CARE_RECORD_SCHEMA_VERSION,
  CARE_RECORD_TYPES,
  CARE_RECORD_KEYS,
  CARE_RECORD_WRITE_KEYS,
  CARE_RECORD_TYPE_LABELS,
  CARE_RECORD_NAME_MAX_LENGTH,
  CARE_RECORD_NOTES_MAX_LENGTH,
  shanghaiDateText,
  parseDateText,
  isValidTimestamp,
  normalizeCareRecordFields,
  validateCareRecordFields,
  normalizeCareRecordInput,
  validateCareRecordInput,
  normalizeCareRecord,
  validateCareRecord,
  assertCareRecordServiceContract,
  hasOwn
}
