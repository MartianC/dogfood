const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

function shanghaiDateKey(value) {
  if (value == null || value === '') return null
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return null
  const shanghaiDate = new Date(timestamp + SHANGHAI_OFFSET_MS)
  return [
    shanghaiDate.getUTCFullYear(),
    String(shanghaiDate.getUTCMonth() + 1).padStart(2, '0'),
    String(shanghaiDate.getUTCDate()).padStart(2, '0')
  ].join('-')
}

function normalizeMonthKey(monthKey) {
  const value = String(monthKey || '')
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error('记录月份无效')
  return value
}

function createRecordCalendarModel(records, options = {}) {
  const monthKey = normalizeMonthKey(options.monthKey)
  const selectedDateKey = String(options.selectedDateKey || '')
  const source = Array.isArray(records) ? records : []
  const recordsByDate = {}
  const markedDateKeys = []
  const invalidRecords = []

  source.forEach((record) => {
    const dateKey = shanghaiDateKey(record && record.mealTime)
    if (!dateKey) {
      invalidRecords.push(record)
      return
    }
    if (!dateKey.startsWith(`${monthKey}-`)) return
    if (!recordsByDate[dateKey]) {
      recordsByDate[dateKey] = []
      markedDateKeys.push(dateKey)
    }
    recordsByDate[dateKey].push(record)
  })

  return {
    monthKey,
    selectedDateKey,
    recordsByDate,
    markedDateKeys,
    calendarDays: markedDateKeys.map((dateKey) => ({
      dateKey,
      hasRecords: true,
      recordCount: recordsByDate[dateKey].length,
      suffix: '已记'
    })),
    selectedRecords: (recordsByDate[selectedDateKey] || []).slice(),
    invalidGroup: {
      dateKey: 'invalid',
      label: '时间无效',
      records: invalidRecords
    }
  }
}

module.exports = {
  shanghaiDateKey,
  createRecordCalendarModel
}
