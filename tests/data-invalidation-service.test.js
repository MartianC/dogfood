const test = require('node:test')
const assert = require('node:assert/strict')
const {
  DATA_SCOPE,
  createDataInvalidationState
} = require('../services/dataInvalidationService')

test('数据失效信号按领域推进版本，未变化领域保持稳定', () => {
  const state = createDataInvalidationState()
  const initial = state.getSnapshot()

  state.markDirty(DATA_SCOPE.MEALS)
  const afterMeals = state.getSnapshot()

  assert.equal(afterMeals.meals, initial.meals + 1)
  assert.equal(afterMeals.profile, initial.profile)
  assert.equal(state.hasChanged(initial, DATA_SCOPE.MEALS), true)
  assert.equal(state.hasChanged(initial, DATA_SCOPE.PROFILE), false)
  assert.equal(state.hasChanged(afterMeals, DATA_SCOPE.PROFILE), false)
})

test('未提供已读版本时视为需要首次读取，全部领域可一起失效', () => {
  const state = createDataInvalidationState()

  assert.equal(state.hasChanged(null), true)
  state.markDirty()
  assert.deepEqual(state.getSnapshot(), { meals: 1, profile: 1 })
})
