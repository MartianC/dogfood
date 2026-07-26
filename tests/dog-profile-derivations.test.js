const test = require('node:test')
const assert = require('node:assert/strict')

const {
  deriveActivityLevel,
  estimateExpectedAdultWeight
} = require('../services/dogProfileDerivations')
const {
  breedOptions,
  activityDurationBands,
  bodyConditionOptions
} = require('../subpackages/dog-profile/data/options')

test('活动水平只按 0–6 小时的固定时长边界派生', () => {
  assert.equal(deriveActivityLevel(0), 'low')
  assert.equal(deriveActivityLevel(0.5), 'low')
  assert.equal(deriveActivityLevel(1), 'moderateLowImpact')
  assert.equal(deriveActivityLevel(1.5), 'moderateLowImpact')
  assert.equal(deriveActivityLevel(2), 'moderateHighImpact')
  assert.equal(deriveActivityLevel(2.5), 'moderateHighImpact')
  assert.equal(deriveActivityLevel(3), 'high')
  assert.equal(deriveActivityLevel(6), 'high')
  assert.equal(deriveActivityLevel(''), '')
  assert.equal(deriveActivityLevel(-0.5), '')
  assert.equal(deriveActivityLevel(6.5), '')
  assert.equal(deriveActivityLevel('不是时长'), '')
})

test('预计成年体重来自可审计的版本化品种目录', () => {
  const shiba = estimateExpectedAdultWeight('shiba-inu')

  assert.equal(shiba.available, true)
  assert.equal(shiba.expectedAdultWeightKg, 10.5)
  assert.equal(shiba.breedCatalogVersion, '2026-07-19.v1')
  assert.match(shiba.sourceUrl, /^https:\/\/www\.akc\.org\//)
  assert.equal(shiba.sourceWeightRange, '17–23 lb')
  assert.equal(shiba.estimatePolicy, 'approved-product-single-point')

  const labrador = estimateExpectedAdultWeight('labrador-retriever')
  assert.equal(labrador.available, true)
  assert.equal(labrador.expectedAdultWeightKg, 30)
  assert.equal(labrador.sourceWeightRange, '55–80 lb')

  const unavailable = estimateExpectedAdultWeight('mixed-or-unknown')
  assert.equal(unavailable.available, false)
  assert.equal(unavailable.expectedAdultWeightKg, null)
  assert.equal(unavailable.adultWeightEstimateReason, 'breed_estimate_unavailable')
  assert.equal(unavailable.breedCatalogVersion, '2026-07-19.v1')
})

test('档案选项与派生目录保持同一受控值集合', () => {
  assert.deepEqual(
    breedOptions.map((item) => item.value),
    ['shiba-inu', 'labrador-retriever', 'mixed-or-unknown']
  )
  assert.deepEqual(
    activityDurationBands.map((item) => item.label),
    ['低活动', '一般活动', '较多活动', '高活动']
  )
  assert.deepEqual(
    bodyConditionOptions.map((item) => item.value),
    ['thin', 'ideal', 'overweight']
  )
})
