const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

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

function isSharedMealRecordEditableToday(record, now = new Date()) {
  return Boolean(
    record
    && shanghaiDateKey(record.mealTime)
    && shanghaiDateKey(record.mealTime) === shanghaiDateKey(now)
  )
}

module.exports = {
  shanghaiDateKey,
  isSharedMealRecordEditableToday
}
