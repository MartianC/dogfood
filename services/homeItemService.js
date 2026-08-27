const env = require('../config/env')
const cloudAdapter = require('./adapters/cloudbase')
const mockAdapter = require('./adapters/mock')
const {
  dateTextInShanghai,
  parseDateText,
  selectLatestValidWeightMeasurement
} = require('./weightContract')
const careContract = require('../contracts/care/careRecordContract')

const HOME_ITEM_LIMIT = 3

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

function formatWeightValue(weightKg) {
  const value = Number(weightKg)
  return Number.isFinite(value) && value > 0 ? `${value} kg` : ''
}

function formatUserDate(dateTextValue) {
  const value = text(dateTextValue)
  if (!careContract.parseDateText(value)) return ''
  const [year, month, day] = value.split('-').map(Number)
  return `${year}年${month}月${day}日`
}

function weightItem(dog, measurement, now) {
  const ageText = formatWeightAge(measurement.measuredOn, now)
  const weightText = formatWeightValue(measurement.weightKg)
  if (!ageText || !weightText) return null
  const dogId = dogIdOf(dog)
  return {
    key: `weight:${dogId}:${measurement.id}`,
    kind: 'weight',
    action: 'open-weight',
    dogId,
    dogName: dogNameOf(dog),
    title: `给 ${dogNameOf(dog)} 量体重`,
    description: `${ageText.replace('上次记录于 ', '上次记录：')} · ${weightText}`,
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
  const detailText = [dogNameOf(dog), normalized.name].filter(Boolean).join(' · ')
  return {
    key: `care:${normalized.dogId}:${normalized.id}`,
    kind: 'care',
    action: 'open-care',
    dogId: normalized.dogId,
    dogName: dogNameOf(dog),
    title: `计划中的下次「${typeLabel}」：${nextDateText}`,
    description: detailText,
    recordId: normalized.id,
    nextDate: normalized.nextDate
  }
}

async function weightItemsForDog(dog, now) {
  const dogId = dogIdOf(dog)
  if (!dogId) return []

  const weightResult = await adapter.listWeightMeasurements({ dogId, limit: 1 })

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
  if (!dogList.length) return []
  const dogsById = new Map(dogList.map((dog) => [dogIdOf(dog), dog]))
  const [weightGroups, careResult] = await Promise.all([
    Promise.all(dogList.map((dog) => weightItemsForDog(dog, now))),
    adapter.listUpcomingCareRecords({
      dogIds: dogList.map((dog) => dogIdOf(dog)),
      limit: HOME_ITEM_LIMIT
    })
  ])
  const careItems = asArray(careResult && careResult.items).map((record) => {
    const dog = dogsById.get(text(record && record.dogId))
    return dog ? careItem(dog, record, now) : null
  }).filter(Boolean)
  const items = weightGroups.flat().concat(careItems)
  return items.sort(compareHomeItems)
}

function __setAdapterForTest(nextAdapter) {
  adapter = nextAdapter
}

function __resetAdapterForTest() {
  adapter = env.useCloudBase ? cloudAdapter : mockAdapter
}

module.exports = {
  HOME_ITEM_LIMIT,
  formatWeightAge,
  formatWeightValue,
  formatUserDate,
  listForDogs,
  __setAdapterForTest,
  __resetAdapterForTest
}
