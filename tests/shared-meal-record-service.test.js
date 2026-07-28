const test = require('node:test')
const assert = require('node:assert/strict')
const fixture = require('./fixtures/shared-meal-ingredient-v1.json')
const storage = require('../utils/storage')
const recordService = require('../services/sharedMealRecordService')
const { fingerprint } = require('../services/sharedMealContract')

function intent() {
  const candidate = {
    targetDogId: 'dog-1',
    mealTime: '2026-07-27T12:00:00.000Z',
    dogSnapshot: { id: 'dog-1', name: '布丁' },
    humanMenu: [{ id: 'human_recipe_chicken', title: '清蒸鸡胸', ingredients: [{ position: 0 }] }],
    sourceIngredientSelections: [],
    dogMealItems: [{ ...fixture, perMealAmountGram: 100 }],
    assessment: { energy: { statusLabel: '能量接近估算目标' } },
    note: '',
    photoFileIds: [],
    versions: fixture.dataVersions
  }
  const requestFingerprint = fingerprint(candidate)
  return {
    schemaVersion: 1,
    idempotencyKey: `draft-1:${requestFingerprint}`,
    requestFingerprint,
    warningConfirmation: 'not_required',
    draftVersion: 1,
    candidate
  }
}

test('Mock 记录保存幂等、同 key 异内容冲突并可稳定回看快照', async () => {
  storage.removeSync('mockSharedMealRecords')
  const saveIntent = intent()
  const first = await recordService.save(saveIntent)
  const repeated = await recordService.save(saveIntent)
  assert.equal(repeated.id, first.id)
  assert.equal((await recordService.list()).items.length, 1)

  const changed = { ...saveIntent, requestFingerprint: 'fnv1a32:different' }
  await assert.rejects(() => recordService.save(changed), /相同保存请求包含不同内容/)

  const detail = await recordService.get(first.id)
  detail.dogSnapshot.name = '篡改'
  assert.equal((await recordService.get(first.id)).dogSnapshot.name, '布丁')
})
