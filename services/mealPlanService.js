const env = require('../config/env')
const storage = require('../utils/storage')
let adapter = env.useCloudBase ? require('./adapters/cloudbase') : require('./adapters/mock')
let testStorage = null

function now() {
  return new Date().toISOString()
}

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
}

function storageGet(key, fallback) {
  if (testStorage) return testStorage.has(key) ? testStorage.get(key) : fallback
  return storage.getSync(key, fallback)
}

function storageSet(key, value) {
  if (testStorage) {
    testStorage.set(key, value)
    return value
  }
  return storage.setSync(key, value)
}

function enqueuePending(payload, error) {
  const list = storageGet('pendingMealPlans', [])
  const item = {
    clientPlanId: payload.clientPlanId || uid('local_plan'),
    payload,
    retryCount: 0,
    lastError: error.message,
    updatedAt: now()
  }
  storageSet('pendingMealPlans', list.concat(item))
  return item
}

async function savePlan(payload) {
  const plan = {
    id: payload.id || uid('plan'),
    createdAt: payload.createdAt || now(),
    updatedAt: now(),
    ...payload
  }

  try {
    const saved = await adapter.saveMealPlan(plan)
    return { ...saved, syncStatus: 'synced' }
  } catch (error) {
    const pending = enqueuePending(plan, error)
    return { ...plan, id: pending.clientPlanId, syncStatus: 'pending' }
  }
}

async function listHistory() {
  return adapter.listMealPlans()
}

async function syncPendingPlans() {
  const list = storageGet('pendingMealPlans', [])
  const remaining = []
  let syncedCount = 0

  for (const item of list) {
    try {
      await adapter.saveMealPlan(item.payload)
      syncedCount += 1
    } catch (error) {
      remaining.push({
        ...item,
        retryCount: item.retryCount + 1,
        lastError: error.message,
        updatedAt: now()
      })
    }
  }

  storageSet('pendingMealPlans', remaining)
  return { syncedCount, remainingCount: remaining.length }
}

function getCheckedItems(planId) {
  const all = storageGet('checkedItems', {})
  return all[planId] || {}
}

function setCheckedItem(planId, itemKey, checked) {
  const all = storageGet('checkedItems', {})
  all[planId] = { ...(all[planId] || {}), [itemKey]: checked }
  storageSet('checkedItems', all)
  return all[planId]
}

function __setAdapterForTest(nextAdapter) {
  adapter = nextAdapter
}

function __setStorageForTest(nextStorage) {
  testStorage = nextStorage
}

module.exports = {
  savePlan,
  listHistory,
  syncPendingPlans,
  getCheckedItems,
  setCheckedItem,
  __setAdapterForTest,
  __setStorageForTest
}
