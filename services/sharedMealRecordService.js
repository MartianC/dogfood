const env = require('../config/env')
const adapter = env.useCloudBase ? require('./adapters/cloudbase') : require('./adapters/mock')

async function save(saveIntent) {
  if (!saveIntent || !saveIntent.idempotencyKey || !saveIntent.requestFingerprint) {
    throw new Error('本餐保存意图无效')
  }
  return adapter.saveSharedMealRecord(saveIntent)
}

function list(options = {}) {
  return adapter.listSharedMealRecords(options)
}

function get(recordId) {
  if (!recordId) throw new Error('本餐记录 ID 无效')
  return adapter.getSharedMealRecord(recordId)
}

module.exports = { save, list, get }
