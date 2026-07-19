const test = require('node:test')
const assert = require('node:assert/strict')

const { estimateLifeStage, decorateDog } = require('../services/lifeStageEstimator')

test('按 8 周、14 周、1 岁和 7 岁推导内部阶段', () => {
  assert.equal(estimateLifeStage({ birthDate: '2026-05-24', today: '2026-07-18' }).reason, 'under_minimum_age')
  assert.equal(estimateLifeStage({ birthDate: '2026-05-23', today: '2026-07-18' }).nutritionStage, 'early_growth')
  assert.equal(estimateLifeStage({ birthDate: '2026-04-12', today: '2026-07-18' }).nutritionStage, 'early_growth')
  assert.equal(estimateLifeStage({ birthDate: '2026-04-11', today: '2026-07-18' }).nutritionStage, 'late_growth')
  assert.equal(estimateLifeStage({ birthDate: '2025-07-19', today: '2026-07-18' }).energyStage, 'puppy')
  assert.equal(estimateLifeStage({ birthDate: '2025-07-18', today: '2026-07-18' }).energyStage, 'adult')
  assert.equal(estimateLifeStage({ birthDate: '2019-07-18', today: '2026-07-18' }).energyStage, 'senior')
})

test('拒绝未来日期并用派生阶段覆盖旧 ageStage', () => {
  assert.equal(estimateLifeStage({ birthDate: '2026-07-19', today: '2026-07-18' }).reason, 'future_birth_date')

  const dog = decorateDog({ name: '布丁', birthDate: '2025-07-18', ageStage: 'senior' }, '2026-07-18')

  assert.equal(dog.ageStage, 'adult')
  assert.equal(dog.lifeStageLabel, '成年犬')
})

test('闰年生日使用日历周年且非法日期安全降级', () => {
  assert.equal(estimateLifeStage({ birthDate: '2024-02-29', today: '2025-02-28' }).energyStage, 'puppy')
  assert.equal(estimateLifeStage({ birthDate: '2024-02-29', today: '2025-03-01' }).energyStage, 'adult')
  assert.equal(estimateLifeStage({ birthDate: '', today: '2026-07-18' }).reason, 'invalid_birth_date')
  assert.equal(estimateLifeStage({ birthDate: '2026/07/18', today: '2026-07-18' }).reason, 'invalid_birth_date')
  assert.equal(estimateLifeStage({ birthDate: '2026-02-30', today: '2026-07-18' }).reason, 'invalid_birth_date')
  assert.equal(estimateLifeStage({ birthDate: '2026-07-18', today: '2026-07-18' }).reason, 'under_minimum_age')
  assert.doesNotThrow(() => estimateLifeStage())
})
