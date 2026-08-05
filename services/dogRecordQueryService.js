const env = require('../config/env')
const cloudAdapter = require('./adapters/cloudbase')
const mockAdapter = require('./adapters/mock')
const {
  normalizeWeightMeasurement
} = require('./weightContract')
const careContract = require('../contracts/care/careRecordContract')

const defaultAdapter = env.useCloudBase ? cloudAdapter : mockAdapter

function normalizeDogId(options = {}) {
  const dogId = String(options.dogId || '').trim()
  if (!dogId) throw new Error('记录查询缺少目标狗狗')
  return dogId
}

function createDogRecordQueryService({ adapter = defaultAdapter } = {}) {
  async function listWeights(options = {}) {
    const dogId = normalizeDogId(options)
    const result = await adapter.listWeightMeasurements({ ...options, dogId })
    return {
      dogId,
      items: (result && result.items || []).map((item) => normalizeWeightMeasurement(item)),
      nextCursor: result && result.nextCursor || null
    }
  }

  async function listCare(options = {}) {
    const dogId = normalizeDogId(options)
    const result = await adapter.listCareRecords({ ...options, dogId })
    return {
      dogId,
      items: (result && result.items || []).map((item) => careContract.normalizeCareRecord(item)),
      nextCursor: result && result.nextCursor || null
    }
  }

  return { listWeights, listCare }
}

module.exports = createDogRecordQueryService()
module.exports.createDogRecordQueryService = createDogRecordQueryService
