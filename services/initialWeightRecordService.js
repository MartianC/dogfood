const env = require('../config/env')
const adapter = env.useCloudBase ? require('./adapters/cloudbase') : require('./adapters/mock')
const {
  WEIGHT_MEASUREMENT_CONTRACT,
  WEIGHT_MEASUREMENT_SCHEMA_VERSION,
  dateTextInShanghai,
  normalizeWeightMeasurementInput,
  normalizeWeightMeasurement
} = require('./weightContract')

function assertWeightRecordServiceContract(contract) {
  if (
    !contract
    || contract.contract !== 'weightRecord/v1'
    || contract.schemaVersion !== WEIGHT_MEASUREMENT_SCHEMA_VERSION
    || contract.measurementContract !== WEIGHT_MEASUREMENT_CONTRACT
    || contract.supportsHistory !== true
    || contract.supportsProfileSync !== true
  ) throw new Error('体重服务版本过旧，请更新 weightRecord 云函数后重试')
  return contract
}

async function ensureCapability() {
  return assertWeightRecordServiceContract(await adapter.getWeightRecordContract())
}

async function createWeightRecord({ dogId, weightKg, measuredOn = dateTextInShanghai() } = {}, options = {}) {
  const input = normalizeWeightMeasurementInput({
    schemaVersion: WEIGHT_MEASUREMENT_SCHEMA_VERSION,
    dogId,
    weightKg,
    measuredOn
  })
  const contract = options.contract || await ensureCapability()
  assertWeightRecordServiceContract(contract)
  const result = await adapter.createWeightMeasurement(input)
  if (!result || !result.measurement) {
    throw new Error('体重记录保存结果无效，请重试')
  }
  return {
    measurement: normalizeWeightMeasurement(result.measurement),
    currentWeight: result.currentWeight
  }
}

module.exports = {
  assertWeightRecordServiceContract,
  ensureCapability,
  createWeightRecord,
  createInitialWeightRecord: createWeightRecord
}
