const DEFAULT_PAGE_SIZE = 20
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

function parseMonthKey(monthKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ''))
  const year = match ? Number(match[1]) : NaN
  const month = match ? Number(match[2]) : NaN
  if (!Number.isInteger(year) || month < 1 || month > 12) {
    throw new Error('记录月份无效')
  }
  return { year, month, monthKey: `${year}-${String(month).padStart(2, '0')}` }
}

function createShanghaiMonthRange(monthKey) {
  const parsed = parseMonthKey(monthKey)
  const start = Date.UTC(parsed.year, parsed.month - 1, 1) - SHANGHAI_OFFSET_MS
  const end = Date.UTC(parsed.year, parsed.month, 1) - SHANGHAI_OFFSET_MS
  return {
    monthKey: parsed.monthKey,
    startTime: new Date(start).toISOString(),
    endTime: new Date(end).toISOString()
  }
}

function recordIdentity(record, index) {
  return String(record && (record.id || record._id) || `missing-id:${record && record.mealTime || ''}:${index}`)
}

function recordTimestamp(record) {
  const value = record && record.mealTime
  if (value == null || value === '') return NaN
  return new Date(value).getTime()
}

async function readMonthRecords(monthKey, listRecords, options = {}) {
  if (typeof listRecords !== 'function') throw new Error('记录列表服务无效')
  const range = createShanghaiMonthRange(monthKey)
  const startMs = new Date(range.startTime).getTime()
  const endMs = new Date(range.endTime).getTime()
  const pageSize = Math.min(Math.max(Number(options.pageSize) || DEFAULT_PAGE_SIZE, 1), DEFAULT_PAGE_SIZE)
  const seenRecords = new Set()
  const seenCursors = new Set()
  const items = []
  let cursor = null

  while (true) {
    const page = await listRecords({
      limit: pageSize,
      cursor,
      monthKey: range.monthKey,
      startTime: range.startTime,
      endTime: range.endTime
    })
    const rows = Array.isArray(page && page.items) ? page.items : []
    let crossedMonthStart = false

    rows.forEach((record, index) => {
      const timestamp = recordTimestamp(record)
      if (!Number.isFinite(timestamp)) return
      if (timestamp < startMs) crossedMonthStart = true
      if (timestamp < startMs || timestamp >= endMs) return
      const identity = recordIdentity(record, index)
      if (seenRecords.has(identity)) return
      seenRecords.add(identity)
      items.push(record)
    })

    const nextCursor = page && page.nextCursor ? String(page.nextCursor) : ''
    if (crossedMonthStart || !nextCursor || seenCursors.has(nextCursor)) break
    seenCursors.add(nextCursor)
    cursor = nextCursor
  }

  return { ...range, items }
}

function createSharedMealRecordMonthState(options = {}) {
  const listRecords = options.listRecords
  if (typeof listRecords !== 'function') throw new Error('记录列表服务无效')
  const cache = new Map()
  const inFlight = new Map()
  let requestSequence = 0
  let activeRequestId = 0
  let current = {
    activeMonthKey: '',
    selectedDateKey: '',
    status: 'idle',
    items: [],
    error: null
  }

  function getState() {
    return { ...current, items: current.items.slice() }
  }

  function setActiveMonth(monthKey, selectedDateKey, status, items, error = null) {
    current = {
      activeMonthKey: monthKey,
      selectedDateKey,
      status,
      items: items.slice(),
      error
    }
  }

  function selectedDateFor(monthKey, loadOptions) {
    if (Object.prototype.hasOwnProperty.call(loadOptions, 'selectedDateKey')) {
      return String(loadOptions.selectedDateKey || '')
    }
    return current.activeMonthKey === monthKey ? current.selectedDateKey : ''
  }

  function load(monthKey, loadOptions = {}) {
    const range = createShanghaiMonthRange(monthKey)
    const normalizedMonthKey = range.monthKey
    const selectedDateKey = selectedDateFor(normalizedMonthKey, loadOptions)
    const force = Boolean(loadOptions.force)
    const pending = inFlight.get(normalizedMonthKey)

    if (pending) {
      activeRequestId = pending.requestId
      setActiveMonth(
        normalizedMonthKey,
        selectedDateKey,
        'loading',
        cache.get(normalizedMonthKey) || [],
        null
      )
      return pending.promise
    }

    if (!force && cache.has(normalizedMonthKey)) {
      activeRequestId = ++requestSequence
      setActiveMonth(normalizedMonthKey, selectedDateKey, 'success', cache.get(normalizedMonthKey), null)
      return Promise.resolve({
        monthKey: normalizedMonthKey,
        items: cache.get(normalizedMonthKey).slice(),
        applied: true,
        cached: true
      })
    }

    const requestId = ++requestSequence
    activeRequestId = requestId
    setActiveMonth(
      normalizedMonthKey,
      selectedDateKey,
      'loading',
      cache.get(normalizedMonthKey) || [],
      null
    )

    const promise = readMonthRecords(normalizedMonthKey, listRecords, loadOptions)
      .then((result) => {
        cache.set(normalizedMonthKey, result.items.slice())
        const applied = current.activeMonthKey === normalizedMonthKey && activeRequestId === requestId
        if (applied) {
          setActiveMonth(normalizedMonthKey, current.selectedDateKey, 'success', result.items, null)
        }
        return { monthKey: normalizedMonthKey, items: result.items.slice(), applied, cached: false }
      })
      .catch((error) => {
        if (current.activeMonthKey === normalizedMonthKey && activeRequestId === requestId) {
          setActiveMonth(
            normalizedMonthKey,
            current.selectedDateKey,
            'error',
            cache.get(normalizedMonthKey) || [],
            error
          )
        }
        throw error
      })
      .finally(() => {
        const active = inFlight.get(normalizedMonthKey)
        if (active && active.requestId === requestId) inFlight.delete(normalizedMonthKey)
      })

    inFlight.set(normalizedMonthKey, { requestId, promise })
    return promise
  }

  function refresh() {
    if (!current.activeMonthKey) return Promise.reject(new Error('没有可刷新的记录月份'))
    return load(current.activeMonthKey, {
      force: true,
      selectedDateKey: current.selectedDateKey
    })
  }

  function retry() {
    if (!current.activeMonthKey) return Promise.reject(new Error('没有可重试的记录月份'))
    return load(current.activeMonthKey, {
      force: true,
      selectedDateKey: current.selectedDateKey
    })
  }

  return { getState, load, refresh, retry }
}

module.exports = {
  createShanghaiMonthRange,
  readMonthRecords,
  createSharedMealRecordMonthState
}
