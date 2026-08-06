const env = require('../config/env')
const cloudAdapter = require('./adapters/cloudbase')
const mockAdapter = require('./adapters/mock')
const {
  dateTextInShanghai,
  parseDateText,
  selectLatestValidWeightMeasurement
} = require('./weightContract')
const careContract = require('../contracts/care/careRecordContract')

const DEFAULT_CARE_PAGE_SIZE = 20
const MAX_CARE_PAGES = 100

let adapter = env.useCloudBase ? cloudAdapter : mockAdapter

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function text(value, fallback = '') {
  const result = String(value == null ? '' : value).trim()
  return result || fallback
}

function dogIdOf(dog) {
  return text(dog && (dog.id || dog._id))
}

function dogNameOf(dog) {
  return text(dog && dog.name, '狗狗')
}

function formatWeightAge(measuredOn, now = new Date()) {
  const measured = parseDateText(measuredOn)
  const today = parseDateText(dateTextInShanghai(now))
  if (!measured || !today || measured.stamp > today.stamp) return ''

  const days = Math.floor((today.stamp - measured.stamp) / 86400000)
  return days === 0
    ? '上次记录于今天'
    : `上次记录于 ${days} 天前`
}

function formatUserDate(dateTextValue) {
  const value = text(dateTextValue)
  if (!careContract.parseDateText(value)) return ''
  const [year, month, day] = value.split('-').map(Number)
  return `${year}年${month}月${day}日`
}

function weightItem(dog, measurement, now) {
  const ageText = formatWeightAge(measurement.measuredOn, now)
  if (!ageText) return null
  const dogId = dogIdOf(dog)
  return {
    key: `weight:${dogId}:${measurement.id}`,
    kind: 'weight',
    action: 'open-weight',
    dogId,
    dogName: dogNameOf(dog),
    title: '体重记录',
    description: ageText,
    recordId: measurement.id,
    measuredOn: measurement.measuredOn
  }
}

function careItem(dog, record, now) {
  const normalized = careContract.normalizeCareRecord(record)
  try {
    careContract.validateCareRecord(normalized, { now })
  } catch (error) {
    return null
  }

  if (!normalized.dogId || normalized.dogId !== dogIdOf(dog) || !normalized.nextDate) {
    return null
  }

  const nextDateText = formatUserDate(normalized.nextDate)
  if (!nextDateText) return null
  const typeLabel = careContract.CARE_RECORD_TYPE_LABELS[normalized.type] || '其他护理'
  return {
    key: `care:${normalized.dogId}:${normalized.id}`,
    kind: 'care',
    action: 'open-care',
    dogId: normalized.dogId,
    dogName: dogNameOf(dog),
    title: normalized.name || typeLabel,
    description: `${typeLabel} · 你填写的下次日期：${nextDateText}`,
    recordId: normalized.id,
    nextDate: normalized.nextDate
  }
}

async function listAllCareRecords(dogId) {
  const items = []
  let cursor = null
  const cursors = new Set()

  for (let page = 0; page < MAX_CARE_PAGES; page += 1) {
    const result = await adapter.listCareRecords({
      dogId,
      limit: DEFAULT_CARE_PAGE_SIZE,
      cursor
    })
    const pageItems = asArray(result && result.items)
    items.push(...pageItems)

    const nextCursor = text(result && result.nextCursor)
    if (!nextCursor || !pageItems.length || cursors.has(nextCursor)) break
    cursors.add(nextCursor)
    cursor = nextCursor
  }

  return items
}

async function itemsForDog(dog, now) {
  const dogId = dogIdOf(dog)
  if (!dogId) return []

  const [weightResult, careRecords] = await Promise.all([
    adapter.listWeightMeasurements({ dogId, limit: 1 }),
    listAllCareRecords(dogId)
  ])

  const latestMeasurement = selectLatestValidWeightMeasurement(
    asArray(weightResult && weightResult.items)
      .filter((measurement) => isObject(measurement) && text(measurement.dogId) === dogId),
    { now }
  )
  const items = []
  if (latestMeasurement) {
    const item = weightItem(dog, latestMeasurement, now)
    if (item) items.push(item)
  }

  careRecords.forEach((record) => {
    const item = careItem(dog, record, now)
    if (item) items.push(item)
  })
  return items
}

function compareHomeItems(left, right) {
  if (left.kind !== right.kind) return left.kind === 'care' ? -1 : 1
  if (left.kind === 'care' && left.nextDate !== right.nextDate) {
    return String(left.nextDate).localeCompare(String(right.nextDate))
  }
  if (left.kind === 'weight' && left.measuredOn !== right.measuredOn) {
    return String(right.measuredOn).localeCompare(String(left.measuredOn))
  }
  return String(left.key).localeCompare(String(right.key))
}

async function listForDogs(dogs, { now = new Date() } = {}) {
  const dogList = asArray(dogs).filter((dog) => dogIdOf(dog))
  const items = (await Promise.all(dogList.map((dog) => itemsForDog(dog, now))))
    .flat()
  return items.sort(compareHomeItems)
}

function __setAdapterForTest(nextAdapter) {
  adapter = nextAdapter
}

function __resetAdapterForTest() {
  adapter = env.useCloudBase ? cloudAdapter : mockAdapter
}

module.exports = {
  DEFAULT_CARE_PAGE_SIZE,
  formatWeightAge,
  formatUserDate,
  listAllCareRecords,
  listForDogs,
  __setAdapterForTest,
  __resetAdapterForTest
}
