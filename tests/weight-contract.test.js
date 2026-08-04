const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const weightContract = require('../services/weightContract')
const fixture = require('./fixtures/weight-measurement-v1.json')

const root = path.resolve(__dirname, '..')
const validationOptions = { today: '2026-08-04' }

function record(overrides = {}) {
  return {
    ...fixture,
    ...overrides
  }
}

test('weightMeasurement/v1 机器 schema 与运行时字段契约一致', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(
    root,
    'contracts/weight/weight-measurement-v1.schema.json'
  ), 'utf8'))

  assert.equal(schema.$id, weightContract.WEIGHT_MEASUREMENT_CONTRACT)
  assert.equal(schema.additionalProperties, false)
  assert.deepEqual(schema.required, weightContract.WEIGHT_MEASUREMENT_KEYS)
  assert.equal(schema.properties.schemaVersion.const, 1)
  assert.doesNotThrow(() => weightContract.validateWeightMeasurement(fixture, validationOptions))
})

test('体重测量记录归一化为唯一字段并保留两位小数边界', () => {
  const normalized = weightContract.normalizeWeightMeasurement({
    ...fixture,
    _id: fixture.id,
    id: undefined,
    weightKg: '10.20'
  }, validationOptions)

  assert.deepEqual(normalized, {
    ...fixture,
    weightKg: 10.2
  })
  assert.deepEqual(Object.keys(normalized), weightContract.WEIGHT_MEASUREMENT_KEYS)
  assert.throws(
    () => weightContract.validateWeightMeasurement(record({ weightKg: 10.123 }), validationOptions),
    /最多保留两位小数/
  )
})

test('体重测量记录拒绝未来日期、非法日期、零值和额外字段', () => {
  const invalidCases = [
    { overrides: { measuredOn: '2026-08-05' }, message: /测量日期不能晚于今天/ },
    { overrides: { measuredOn: '2026-02-30' }, message: /测量日期无效/ },
    { overrides: { weightKg: 0 }, message: /体重必须大于 0/ },
    { overrides: { unexpected: true }, message: /字段不完整/ }
  ]

  invalidCases.forEach(({ overrides, message }) => {
    assert.throws(
      () => weightContract.validateWeightMeasurement(record(overrides), validationOptions),
      message
    )
  })
})

test('最新有效测量按称量日、创建时间和 ID 稳定排序，且不修改输入', () => {
  const measurements = [
    record({ id: 'old', measuredOn: '2026-08-01', createdAt: '2026-08-01T12:00:00.000Z' }),
    record({ id: 'same-day-earlier', measuredOn: '2026-08-03', createdAt: '2026-08-03T11:00:00.000Z' }),
    record({ id: 'latest', measuredOn: '2026-08-03', createdAt: '2026-08-03T12:00:00.000Z' }),
    record({ id: 'future', measuredOn: '2026-08-05' }),
    record({ id: 'invalid-weight', weightKg: -1 })
  ]
  const originalOrder = measurements.map((item) => item.id)

  assert.equal(
    weightContract.selectLatestValidWeightMeasurement(measurements, validationOptions).id,
    'latest'
  )
  assert.deepEqual(measurements.map((item) => item.id), originalOrder)
})

test('当前体重优先使用历史测量，没有历史时才兼容旧 weightKg', () => {
  const legacy = weightContract.resolveCurrentWeight({
    profileWeightKg: 10.123,
    measurements: [],
    ...validationOptions
  })
  assert.deepEqual(legacy, {
    source: 'legacy-profile',
    weightKg: 10.123,
    measuredOn: null,
    measurementId: null
  })

  const current = weightContract.resolveCurrentWeight({
    profileWeightKg: 10,
    measurements: [record({ weightKg: 10.25 })],
    ...validationOptions
  })
  assert.deepEqual(current, {
    source: 'measurement',
    weightKg: 10.25,
    measuredOn: fixture.measuredOn,
    measurementId: fixture.id
  })

  const noLongerRecorded = weightContract.resolveCurrentWeight({
    profileWeightKg: 10,
    measurements: [record({ weightKg: -1 })],
    ...validationOptions
  })
  assert.deepEqual(noLongerRecorded, {
    source: 'none',
    weightKg: null,
    measuredOn: null,
    measurementId: null
  })
})

test('删除最新测量回退上一条，删除最后一条回到未记录，删除历史测量不改变当前值', () => {
  const measurements = [
    record({ id: 'previous', weightKg: 9.8, measuredOn: '2026-08-01' }),
    record({ id: 'latest', weightKg: 10.25, measuredOn: '2026-08-03' })
  ]

  const fallback = weightContract.planDeleteWeightMeasurement(
    measurements,
    'latest',
    validationOptions
  )
  assert.equal(fallback.outcome, 'fallback-to-previous-measurement')
  assert.equal(fallback.latestMeasurement.id, 'previous')
  assert.equal(fallback.currentWeight.weightKg, 9.8)

  const unchanged = weightContract.planDeleteWeightMeasurement(
    measurements,
    'previous',
    validationOptions
  )
  assert.equal(unchanged.outcome, 'current-unchanged')
  assert.equal(unchanged.latestMeasurement.id, 'latest')

  const unrecorded = weightContract.planDeleteWeightMeasurement(
    [record({ id: 'only' })],
    'only',
    validationOptions
  )
  assert.equal(unrecorded.outcome, 'unrecorded')
  assert.deepEqual(unrecorded.currentWeight, {
    source: 'none',
    weightKg: null,
    measuredOn: null,
    measurementId: null
  })
  assert.deepEqual(measurements.map((item) => item.id), ['previous', 'latest'])
})
