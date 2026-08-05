const dogService = require('./dogService')
const sharedMealRecordService = require('./sharedMealRecordService')
const sharedMealRecordMonthState = require('./sharedMealRecordMonthState')
const weightService = require('../subpackages/dog-profile/services/weightService')
const careRecordService = require('../care/careRecordService')
const {
  SOURCE_NAMES,
  normalizeMonthKey,
  normalizeDogs,
  defaultSelectedDateKey,
  shanghaiDateKey,
  createUnifiedRecordTimelineModel,
  selectUnifiedRecordTimelineModel,
  safeError
} = require('./unifiedRecordTimelineModel')

const DEFAULT_PAGE_SIZE = 20

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function sourceDateKey(source, item) {
  if (source === 'meal') return shanghaiDateKey(item && item.mealTime)
  return String(item && (source === 'weight' ? item.measuredOn : item.occurredOn) || '').trim() || null
}

function inMonth(dateKey, monthKey) {
  return Boolean(dateKey && dateKey.startsWith(`${monthKey}-`))
}

function recordIdentity(item, index) {
  return String(item && (item.id || item._id) || `missing:${index}`)
}

async function readAllPages(listRecords, options = {}) {
  if (typeof listRecords !== 'function') throw new Error('记录列表服务无效')
  const limit = Math.min(Math.max(Number(options.limit) || DEFAULT_PAGE_SIZE, 1), DEFAULT_PAGE_SIZE)
  const seenCursors = new Set()
  const seenItems = new Set()
  const items = []
  let cursor = null

  while (true) {
    const page = await listRecords({
      ...options,
      limit,
      cursor
    })
    const rows = Array.isArray(page && page.items) ? page.items : []
    rows.forEach((item, index) => {
      const identity = recordIdentity(item, items.length + index)
      if (seenItems.has(identity)) return
      seenItems.add(identity)
      items.push(item)
    })

    const nextCursor = page && page.nextCursor ? String(page.nextCursor) : ''
    if (!nextCursor || seenCursors.has(nextCursor)) break
    seenCursors.add(nextCursor)
    cursor = nextCursor
  }

  return items
}

async function readMonthMeals(monthKey, listMeals, options = {}) {
  return sharedMealRecordMonthState.readMonthRecords(monthKey, listMeals, {
    ...options,
    pageSize: options.pageSize || DEFAULT_PAGE_SIZE
  })
}

async function readDogSource(source, dogs, listRecords, monthKey, options = {}) {
  if (typeof listRecords !== 'function') throw new Error(`${source} 记录列表服务无效`)
  const results = await Promise.all((dogs || []).map(async (dog) => {
    try {
      const items = await readAllPages(listRecords, {
        dogId: dog.id,
        limit: options.pageSize || DEFAULT_PAGE_SIZE
      })
      return {
        dogId: dog.id,
        items: items.filter((item) => inMonth(sourceDateKey(source, item), monthKey)),
        error: null
      }
    } catch (error) {
      return {
        dogId: dog.id,
        items: [],
        error
      }
    }
  }))
  const failed = results.filter((result) => result.error)
  const items = results.flatMap((result) => result.items)
  const status = failed.length === 0
    ? 'success'
    : failed.length < results.length
      ? 'partial'
      : 'error'
  const firstError = failed[0] && failed[0].error
  return {
    status,
    items,
    failedDogIds: failed.map((result) => result.dogId),
    error: failed.length
      ? safeError(firstError, '部分记录暂时无法读取')
      : null
  }
}

function sourceUnavailableError() {
  return {
    code: 'DOGS_UNAVAILABLE',
    message: '狗狗档案暂时无法读取',
    retryable: true
  }
}

function allSourcesStatus(sources) {
  const statuses = SOURCE_NAMES.map((source) => sources[source].status)
  if (statuses.every((status) => status === 'error')) return 'error'
  if (statuses.some((status) => status === 'partial' || status === 'error')) return 'partial'
  return 'success'
}

function createUnifiedRecordTimelineService(options = {}) {
  const listDogs = options.listDogs || dogService.listDogs
  const listMeals = options.listMeals || sharedMealRecordService.list
  const listWeights = options.listWeights || weightService.list
  const listCare = options.listCare || careRecordService.list

  async function query(queryOptions = {}) {
    const monthKey = normalizeMonthKey(queryOptions.monthKey)
    const selectedDateKey = String(queryOptions.selectedDateKey || '')
      || defaultSelectedDateKey(monthKey, queryOptions.now)

    const [dogsResult, mealResult] = await Promise.all([
      Promise.resolve().then(() => listDogs()),
      Promise.resolve().then(() => readMonthMeals(monthKey, listMeals, queryOptions))
    ].map((promise) => promise.then(
      (value) => ({ ok: true, value }),
      (error) => ({ ok: false, error })
    )))

    const rawDogs = dogsResult.ok && Array.isArray(dogsResult.value) ? dogsResult.value : []
    const dogs = normalizeDogs(rawDogs)
    const dogsStatus = dogsResult.ok
      ? { status: 'success', error: null }
      : { status: 'error', error: safeError(dogsResult.error, '狗狗档案暂时无法读取') }

    let weightResult
    let careResult
    if (dogsResult.ok) {
      [weightResult, careResult] = await Promise.all([
        readDogSource('weight', dogs, listWeights, monthKey, queryOptions),
        readDogSource('care', dogs, listCare, monthKey, queryOptions)
      ])
    } else {
      const error = sourceUnavailableError()
      weightResult = { status: 'error', items: [], failedDogIds: [], error }
      careResult = { status: 'error', items: [], failedDogIds: [], error }
    }

    const sources = {
      meal: mealResult.ok
        ? { status: 'success', items: mealResult.value.items, failedDogIds: [], error: null }
        : { status: 'error', items: [], failedDogIds: [], error: safeError(mealResult.error) },
      weight: weightResult,
      care: careResult
    }
    const model = createUnifiedRecordTimelineModel({
      dogs: rawDogs,
      sources,
      monthKey,
      selectedDateKey,
      expandedDogIds: queryOptions.expandedDogIds
    })

    return {
      ...model,
      status: allSourcesStatus(model.sources),
      dogsStatus
    }
  }

  return {
    query,
    list: query
  }
}

function createUnifiedRecordTimelineState(options = {}) {
  const service = options.service || createUnifiedRecordTimelineService(options)
  const cache = new Map()
  const inFlight = new Map()
  let requestSequence = 0
  let activeRequestId = 0
  let current = {
    activeMonthKey: '',
    selectedDateKey: '',
    expandedDogIds: [],
    status: 'idle',
    model: null,
    error: null
  }

  function getState() {
    return {
      ...current,
      expandedDogIds: current.expandedDogIds.slice(),
      model: current.model
    }
  }

  function setCurrent(monthKey, selectedDateKey, expandedDogIds, status, model, error = null) {
    current = {
      activeMonthKey: monthKey,
      selectedDateKey,
      expandedDogIds: expandedDogIds.slice(),
      status,
      model,
      error
    }
  }

  function selectionFor(monthKey, loadOptions) {
    return {
      selectedDateKey: hasOwn(loadOptions, 'selectedDateKey')
        ? String(loadOptions.selectedDateKey || '')
          || defaultSelectedDateKey(monthKey, loadOptions.now)
        : current.activeMonthKey === monthKey
          ? current.selectedDateKey
          : defaultSelectedDateKey(monthKey, loadOptions.now),
      expandedDogIds: hasOwn(loadOptions, 'expandedDogIds')
        ? (Array.isArray(loadOptions.expandedDogIds) ? loadOptions.expandedDogIds.slice() : [])
        : current.activeMonthKey === monthKey
          ? current.expandedDogIds.slice()
          : []
    }
  }

  function load(monthKey, loadOptions = {}) {
    const normalizedMonthKey = normalizeMonthKey(monthKey)
    const selection = selectionFor(normalizedMonthKey, loadOptions)
    const force = Boolean(loadOptions.force)
    const pending = inFlight.get(normalizedMonthKey)

    if (pending) {
      activeRequestId = pending.requestId
      setCurrent(
        normalizedMonthKey,
        selection.selectedDateKey,
        selection.expandedDogIds,
        'loading',
        pending.model || cache.get(normalizedMonthKey) || null,
        null
      )
      return pending.promise
    }

    if (!force && cache.has(normalizedMonthKey)) {
      activeRequestId = ++requestSequence
      const model = selectUnifiedRecordTimelineModel(cache.get(normalizedMonthKey), selection)
      setCurrent(
        normalizedMonthKey,
        selection.selectedDateKey,
        selection.expandedDogIds,
        model.status,
        model,
        null
      )
      return Promise.resolve({
        monthKey: normalizedMonthKey,
        model,
        applied: true,
        cached: true
      })
    }

    const requestId = ++requestSequence
    activeRequestId = requestId
    setCurrent(
      normalizedMonthKey,
      selection.selectedDateKey,
      selection.expandedDogIds,
      'loading',
      cache.get(normalizedMonthKey) || null,
      null
    )

    const promise = service.query({
      ...loadOptions,
      monthKey: normalizedMonthKey,
      selectedDateKey: selection.selectedDateKey,
      expandedDogIds: selection.expandedDogIds
    })
      .then((model) => {
        cache.set(normalizedMonthKey, model)
        const applied = current.activeMonthKey === normalizedMonthKey && activeRequestId === requestId
        const selectedModel = selectUnifiedRecordTimelineModel(model, selection)
        if (applied) {
          setCurrent(
            normalizedMonthKey,
            selection.selectedDateKey,
            selection.expandedDogIds,
            selectedModel.status,
            selectedModel,
            null
          )
        }
        return { monthKey: normalizedMonthKey, model: selectedModel, applied, cached: false }
      })
      .catch((error) => {
        if (current.activeMonthKey === normalizedMonthKey && activeRequestId === requestId) {
          setCurrent(
            normalizedMonthKey,
            selection.selectedDateKey,
            selection.expandedDogIds,
            'error',
            cache.get(normalizedMonthKey) || null,
            safeError(error)
          )
        }
        throw error
      })
      .finally(() => {
        const active = inFlight.get(normalizedMonthKey)
        if (active && active.requestId === requestId) inFlight.delete(normalizedMonthKey)
      })

    inFlight.set(normalizedMonthKey, { requestId, promise, model: cache.get(normalizedMonthKey) || null })
    return promise
  }

  function selectDate(selectedDateKey) {
    if (!current.model) throw new Error('没有可选择的记录月份')
    const nextDateKey = String(selectedDateKey || '')
    const model = selectUnifiedRecordTimelineModel(current.model, { selectedDateKey: nextDateKey })
    setCurrent(
      current.activeMonthKey,
      nextDateKey,
      current.expandedDogIds,
      model.status,
      model,
      null
    )
    return model
  }

  function setExpandedDogIds(expandedDogIds) {
    if (!current.model) throw new Error('没有可展开的记录月份')
    const nextIds = Array.isArray(expandedDogIds) ? expandedDogIds.slice() : []
    const model = selectUnifiedRecordTimelineModel(current.model, { expandedDogIds: nextIds })
    setCurrent(
      current.activeMonthKey,
      current.selectedDateKey,
      nextIds,
      model.status,
      model,
      null
    )
    return model
  }

  function refresh() {
    if (!current.activeMonthKey) return Promise.reject(new Error('没有可刷新的记录月份'))
    return load(current.activeMonthKey, {
      force: true,
      selectedDateKey: current.selectedDateKey,
      expandedDogIds: current.expandedDogIds
    })
  }

  function retry() {
    if (!current.activeMonthKey) return Promise.reject(new Error('没有可重试的记录月份'))
    return refresh()
  }

  return {
    getState,
    load,
    refresh,
    retry,
    selectDate,
    setExpandedDogIds
  }
}

const defaultService = createUnifiedRecordTimelineService()

module.exports = {
  readAllPages,
  readMonthMeals,
  readDogSource,
  createUnifiedRecordTimelineService,
  createUnifiedRecordTimelineState,
  createState: createUnifiedRecordTimelineState,
  query: defaultService.query,
  list: defaultService.list
}
