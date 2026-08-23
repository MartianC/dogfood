const { CARE_RECORD_TYPE_LABELS } = require('../contracts/care/careRecordContract')

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
const SOURCE_ORDER = Object.freeze({ meal: 0, weight: 1, care: 2 })
const SOURCE_NAMES = Object.freeze(['meal', 'weight', 'care'])

function text(value) {
  return String(value == null ? '' : value).trim()
}

function normalizeMonthKey(monthKey) {
  const value = text(monthKey)
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error('记录月份无效')
  return value
}

function parseDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(value))
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
  return { year, month, day, stamp }
}

function shanghaiDateKey(value) {
  if (value == null || value === '') return null
  const stamp = new Date(value).getTime()
  if (!Number.isFinite(stamp)) return null
  const date = new Date(stamp + SHANGHAI_OFFSET_MS)
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0')
  ].join('-')
}

function defaultSelectedDateKey(monthKey, now = new Date()) {
  const normalizedMonthKey = normalizeMonthKey(monthKey)
  const today = shanghaiDateKey(now)
  return today && today.startsWith(`${normalizedMonthKey}-`)
    ? today
    : `${normalizedMonthKey}-01`
}

function dateText(dateKey) {
  const parts = parseDateKey(dateKey)
  return parts ? `${parts.year}年${parts.month}月${parts.day}日` : '日期待确认'
}

function timeText(value) {
  const stamp = new Date(value).getTime()
  if (!Number.isFinite(stamp)) return ''
  const date = new Date(stamp + SHANGHAI_OFFSET_MS)
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

function prefixId(source, value) {
  const id = text(value)
  return id ? `${source}:${id}` : ''
}

function dogIdOf(record) {
  return text(record && (record.dogId || record.targetDogId || record.dogSnapshot && record.dogSnapshot.id))
}

function dogNameOf(record, dogNames = {}) {
  const dogId = dogIdOf(record)
  return text(
    record && (record.dogName || record.dogSnapshot && record.dogSnapshot.name)
  ) || text(dogNames[dogId]) || '狗狗'
}

function normalizeDog(dog, index = 0) {
  const id = text(dog && (dog.id || dog._id))
  if (!id) return null
  return {
    id,
    name: text(dog.name) || '狗狗',
    order: index
  }
}

function normalizeDogs(dogs) {
  const seen = new Set()
  return (Array.isArray(dogs) ? dogs : [])
    .map((dog, index) => normalizeDog(dog, index))
    .filter((dog) => {
      if (!dog || seen.has(dog.id)) return false
      seen.add(dog.id)
      return true
    })
}

function normalizeMealRecord(record, dogNames = {}) {
  const id = text(record && (record.id || record._id))
  const mealTime = text(record && record.mealTime)
  const dateKey = shanghaiDateKey(mealTime)
  const dogId = dogIdOf(record)
  if (!id || !dateKey || !dogId) return null

  const dogName = dogNameOf(record, dogNames)
  const menu = Array.isArray(record.humanMenu) ? record.humanMenu : []
  const menuTitle = text(menu[0] && (menu[0].title || menu[0].name)) || '人饭菜单'
  const ingredientCount = Array.isArray(record.dogMealItems)
    ? record.dogMealItems.length
    : null
  const summary = ingredientCount == null
    ? menuTitle
    : `${menuTitle} · ${ingredientCount}种食材`
  const sortKey = new Date(mealTime).toISOString()

  return {
    id: prefixId('meal', id),
    source: 'meal',
    sourceId: id,
    dogId,
    dogName,
    dateKey,
    precision: 'datetime',
    sortKey,
    tieKey: id,
    typeLabel: '吃饭',
    title: `${timeText(mealTime)} · ${dogName}`,
    summary,
    detailTarget: {
      route: '/subpackages/shared-meal/record-detail/index',
      query: { recordId: id }
    }
  }
}

function numberText(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return ''
  return String(Number(number.toFixed(2)))
}

function normalizeWeightRecord(record, dogNames = {}) {
  const id = text(record && (record.id || record._id))
  const dateKey = text(record && record.measuredOn)
  const weight = numberText(record && record.weightKg)
  const dogId = dogIdOf(record)
  if (!id || !parseDateKey(dateKey) || !weight || !dogId) return null

  const dogName = dogNameOf(record, dogNames)
  return {
    id: prefixId('weight', id),
    source: 'weight',
    sourceId: id,
    dogId,
    dogName,
    dateKey,
    precision: 'date',
    sortKey: `${dateKey}T00:00:00.000+08:00`,
    tieKey: text(record.createdAt) || id,
    typeLabel: '体重',
    title: `体重 · ${dogName}`,
    summary: `${weight} kg · ${dateText(dateKey)}`,
    detailTarget: {
      route: '/subpackages/dog-profile/weight/index',
      query: { dogId }
    }
  }
}

function normalizeCareRecord(record, dogNames = {}) {
  const id = text(record && (record.id || record._id))
  const dateKey = text(record && record.occurredOn)
  const type = text(record && record.type)
  const dogId = dogIdOf(record)
  if (!id || !parseDateKey(dateKey) || !dogId) return null

  const dogName = dogNameOf(record, dogNames)
  const typeLabel = CARE_RECORD_TYPE_LABELS[type] || '其他护理'
  const title = text(record && record.name) || typeLabel
  const nextDate = text(record && record.nextDate)
  const nextDateText = parseDateKey(nextDate) ? ` · 下次 ${dateText(nextDate)}` : ''

  return {
    id: prefixId('care', id),
    source: 'care',
    sourceId: id,
    dogId,
    dogName,
    dateKey,
    precision: 'date',
    sortKey: `${dateKey}T00:00:00.000+08:00`,
    tieKey: text(record.createdAt) || id,
    typeLabel,
    title,
    summary: `${dateText(dateKey)}${nextDateText}`,
    detailTarget: {
      route: '/subpackages/dog-profile/care-record/index',
      query: { dogId }
    }
  }
}

function normalizeSourceItems(source, items, dogNames = {}) {
  const normalizer = source === 'meal'
    ? normalizeMealRecord
    : source === 'weight'
      ? normalizeWeightRecord
      : normalizeCareRecord
  const sourceItems = Array.isArray(items) ? items : []
  const normalized = []
  const seen = new Set()
  sourceItems.forEach((item) => {
    const record = normalizer(item, dogNames)
    if (!record || seen.has(record.id)) return
    seen.add(record.id)
    normalized.push(record)
  })
  return normalized
}

function compareDescending(left, right) {
  return String(right || '').localeCompare(String(left || ''))
}

function sortUnifiedRecords(records) {
  return (Array.isArray(records) ? records : []).slice().sort((left, right) => {
    const dateOrder = compareDescending(left.dateKey, right.dateKey)
    if (dateOrder !== 0) return dateOrder

    if (left.source === 'meal' && right.source === 'meal') {
      const timeOrder = compareDescending(left.sortKey, right.sortKey)
      if (timeOrder !== 0) return timeOrder
    } else if (left.source !== right.source) {
      return SOURCE_ORDER[left.source] - SOURCE_ORDER[right.source]
    }

    const tieOrder = compareDescending(left.tieKey, right.tieKey)
    if (tieOrder !== 0) return tieOrder
    return compareDescending(left.id, right.id)
  })
}

function sourceStatus(input = {}) {
  input = input || {}
  if (Array.isArray(input)) {
    return { status: 'success', error: null, failedDogIds: [], items: input, invalidCount: 0 }
  }
  return {
    status: ['success', 'partial', 'error'].includes(input.status) ? input.status : 'success',
    error: input.error || null,
    failedDogIds: Array.isArray(input.failedDogIds) ? input.failedDogIds.slice() : [],
    items: Array.isArray(input.items) ? input.items : [],
    invalidCount: Number(input.invalidCount) || 0
  }
}

function safeError(error, fallbackMessage = '记录服务暂时不可用') {
  if (!error) return null
  return {
    code: text(error.code) || 'UNKNOWN',
    message: text(error.message) || fallbackMessage,
    retryable: Boolean(error.retryable)
  }
}

function buildDogGroups(dogs, records, selectedDateKey, expandedDogIds) {
  const known = new Map(dogs.map((dog) => [dog.id, dog]))
  const orderedDogs = dogs.slice()
  records.forEach((record) => {
    if (!record.dogId || known.has(record.dogId)) return
    const dog = { id: record.dogId, name: record.dogName || '狗狗', order: orderedDogs.length }
    known.set(dog.id, dog)
    orderedDogs.push(dog)
  })

  const recordsByDog = new Map()
  records.forEach((record) => {
    if (!recordsByDog.has(record.dogId)) recordsByDog.set(record.dogId, [])
    recordsByDog.get(record.dogId).push(record)
  })
  const selectedRecordsByDog = new Map()
  records
    .filter((record) => record.dateKey === selectedDateKey)
    .forEach((record) => {
      if (!selectedRecordsByDog.has(record.dogId)) selectedRecordsByDog.set(record.dogId, [])
      selectedRecordsByDog.get(record.dogId).push(record)
    })

  const explicitExpanded = Array.isArray(expandedDogIds)
    ? new Set(expandedDogIds.map((id) => text(id)).filter(Boolean))
    : null
  const firstWithRecords = orderedDogs.find((dog) => (selectedRecordsByDog.get(dog.id) || []).length)

  return orderedDogs
    .map((dog) => {
      const selected = selectedRecordsByDog.get(dog.id) || []
      const expanded = explicitExpanded
        ? explicitExpanded.has(dog.id)
        : Boolean(firstWithRecords && firstWithRecords.id === dog.id)
      return {
        dogId: dog.id,
        dogName: dog.name,
        recordCount: selected.length,
        hasRecords: selected.length > 0,
        expanded,
        records: selected.slice()
      }
    })
    .filter((group) => group.hasRecords)
}

function buildDerivedView({ dogs, sourceItems, monthKey, selectedDateKey, expandedDogIds }) {
  const records = sortUnifiedRecords(SOURCE_NAMES.flatMap((source) => sourceItems[source] || []))
  const recordsByDate = {}
  records.forEach((record) => {
    if (!recordsByDate[record.dateKey]) recordsByDate[record.dateKey] = []
    recordsByDate[record.dateKey].push(record)
  })
  const markedDateKeys = Object.keys(recordsByDate).sort()
  const calendarDays = markedDateKeys.map((dateKey) => ({
    dateKey,
    hasRecords: true,
    recordCount: recordsByDate[dateKey].length,
    marker: 'dot',
    showDot: true,
    suffix: ''
  }))
  const selectedRecords = (recordsByDate[selectedDateKey] || []).slice()
  const dogGroups = dogs.length > 1
    ? buildDogGroups(dogs, selectedRecords, selectedDateKey, expandedDogIds)
    : []

  return {
    records,
    recordsByDate,
    markedDateKeys,
    calendarDays,
    selectedRecords,
    selectedRecordCount: selectedRecords.length,
    monthRecordCount: records.length,
    monthHasRecords: records.length > 0,
    dogGroups,
    displayRecords: dogs.length <= 1 ? selectedRecords : [],
    layout: dogs.length > 1 ? 'multi-dog' : dogs.length === 1 ? 'single-dog' : 'no-dog'
  }
}

function createUnifiedRecordTimelineModel({
  dogs = [],
  sources = {},
  monthKey,
  selectedDateKey = '',
  expandedDogIds
} = {}) {
  const normalizedMonthKey = normalizeMonthKey(monthKey)
  const normalizedDogs = normalizeDogs(dogs)
  const dogNames = Object.fromEntries(normalizedDogs.map((dog) => [dog.id, dog.name]))
  const sourceStates = {}
  const sourceItems = {}

  SOURCE_NAMES.forEach((source) => {
    const input = sourceStatus(sources[source])
    const items = normalizeSourceItems(source, input.items, dogNames)
    sourceItems[source] = items
    sourceStates[source] = {
      status: input.status,
      error: safeError(input.error),
      failedDogIds: input.failedDogIds,
      items,
      invalidCount: input.invalidCount + Math.max(0, input.items.length - items.length)
    }
  })

  const derived = buildDerivedView({
    dogs: normalizedDogs,
    sourceItems,
    monthKey: normalizedMonthKey,
    selectedDateKey: text(selectedDateKey),
    expandedDogIds
  })
  const statuses = SOURCE_NAMES.map((source) => sourceStates[source].status)
  const allSourcesFailed = statuses.every((status) => status === 'error')
  const hasSourceErrors = statuses.some((status) => status === 'partial' || status === 'error')

  return {
    monthKey: normalizedMonthKey,
    selectedDateKey: text(selectedDateKey),
    expandedDogIds: Array.isArray(expandedDogIds) ? expandedDogIds.slice() : null,
    dogs: normalizedDogs,
    dogCount: normalizedDogs.length,
    isSingleDog: normalizedDogs.length === 1,
    sources: sourceStates,
    sourceItems,
    status: allSourcesFailed ? 'error' : hasSourceErrors ? 'partial' : 'success',
    allSourcesFailed,
    hasSourceErrors,
    ...derived
  }
}

function selectUnifiedRecordTimelineModel(model, options = {}) {
  if (!model || !model.monthKey) throw new Error('统一记录模型无效')
  const dogs = normalizeDogs(model.dogs)
  const sourceItems = {}
  const sources = {}
  SOURCE_NAMES.forEach((source) => {
    const previous = model.sources && model.sources[source] || {}
    const items = Array.isArray(model.sourceItems && model.sourceItems[source])
      ? model.sourceItems[source].slice()
      : Array.isArray(previous.items) ? previous.items.slice() : []
    sourceItems[source] = items
    sources[source] = {
      status: previous.status || 'success',
      error: previous.error || null,
      failedDogIds: Array.isArray(previous.failedDogIds) ? previous.failedDogIds.slice() : [],
      items,
      invalidCount: Number(previous.invalidCount) || 0
    }
  })
  const selectedDateKey = Object.prototype.hasOwnProperty.call(options, 'selectedDateKey')
    ? text(options.selectedDateKey)
    : model.selectedDateKey
  const expandedDogIds = Object.prototype.hasOwnProperty.call(options, 'expandedDogIds')
    ? options.expandedDogIds
    : model.expandedDogIds
  const derived = buildDerivedView({
    dogs,
    sourceItems,
    monthKey: model.monthKey,
    selectedDateKey,
    expandedDogIds
  })
  const statuses = SOURCE_NAMES.map((source) => sources[source].status)
  const allSourcesFailed = statuses.every((status) => status === 'error')
  const hasSourceErrors = statuses.some((status) => status === 'partial' || status === 'error')
  return {
    ...model,
    monthKey: model.monthKey,
    selectedDateKey,
    expandedDogIds: Array.isArray(expandedDogIds) ? expandedDogIds.slice() : null,
    dogs,
    dogCount: dogs.length,
    isSingleDog: dogs.length === 1,
    sources,
    sourceItems,
    status: allSourcesFailed ? 'error' : hasSourceErrors ? 'partial' : 'success',
    allSourcesFailed,
    hasSourceErrors,
    ...derived
  }
}

module.exports = {
  SHANGHAI_OFFSET_MS,
  SOURCE_ORDER,
  SOURCE_NAMES,
  normalizeMonthKey,
  parseDateKey,
  shanghaiDateKey,
  defaultSelectedDateKey,
  dateText,
  timeText,
  normalizeDogs,
  normalizeMealRecord,
  normalizeWeightRecord,
  normalizeCareRecord,
  normalizeSourceItems,
  sortUnifiedRecords,
  safeError,
  createUnifiedRecordTimelineModel,
  selectUnifiedRecordTimelineModel
}
