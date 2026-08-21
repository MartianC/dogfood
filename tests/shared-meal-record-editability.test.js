const test = require('node:test')
const assert = require('node:assert/strict')

const {
  shanghaiDateKey,
  isSharedMealRecordEditableToday
} = require('../services/sharedMealRecordEditability')

test('客户端当天编辑判定按上海自然日并正确处理零点边界', () => {
  const mealTime = '2026-08-22T15:59:59.000Z'
  assert.equal(shanghaiDateKey(mealTime), '2026-08-22')
  assert.equal(
    isSharedMealRecordEditableToday(
      { mealTime },
      new Date('2026-08-22T15:59:59.999Z')
    ),
    true
  )
  assert.equal(
    isSharedMealRecordEditableToday(
      { mealTime },
      new Date('2026-08-22T16:00:00.000Z')
    ),
    false
  )
  assert.equal(isSharedMealRecordEditableToday({ mealTime: 'invalid' }), false)
})
