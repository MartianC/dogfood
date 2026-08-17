const test = require('node:test')
const assert = require('node:assert/strict')

const dogService = require('../services/dogService')
const mockAdapter = require('../services/adapters/mock')
const storage = require('../utils/storage')
const {
  fieldsForWrite,
  normalizeProfileDocument
} = require('../cloudfunctions/dogProfile/profileValidation')

const completeDog = {
  name: '布丁',
  birthDate: '2020-01-01',
  breed: 'shiba-inu',
  weightKg: 10,
  dailyMeals: 2,
  dailyActivityHours: 1.5,
  bodyCondition: 'ideal',
  specialNutritionNeeds: {
    hasDisease: false,
    reproductiveStatus: 'none',
    therapeuticWeightManagement: 'none'
  }
}

test('dogProfile/v3 将历史缺失特殊营养状态归一为未确认', () => {
  const normalized = dogService.normalizeDog(completeDog)
  const legacy = dogService.decorateSavedDog({ ...completeDog, specialNutritionNeeds: undefined })

  assert.equal(normalized.schemaVersion, 3)
  assert.deepEqual(normalized.specialNutritionNeeds, completeDog.specialNutritionNeeds)
  assert.equal(legacy.schemaVersion, 3)
  assert.deepEqual(legacy.specialNutritionNeeds, {
    hasDisease: null,
    reproductiveStatus: null,
    therapeuticWeightManagement: null
  })
})

test('保存后拒绝缺少 dogProfile/v3 字段的旧云函数响应', () => {
  assert.equal(typeof dogService.assertSavedProfileContract, 'function')
  assert.throws(
    () => dogService.assertSavedProfileContract({ id: 'dog-1' }, completeDog),
    /档案服务版本过旧/
  )
  assert.doesNotThrow(() => dogService.assertSavedProfileContract({
    id: 'dog-1',
    schemaVersion: 3,
    specialNutritionNeeds: completeDog.specialNutritionNeeds
  }, completeDog))
})

test('写入前要求云端声明 dogProfile/v3 能力', () => {
  assert.throws(
    () => dogService.assertDogProfileServiceContract(null),
    /档案服务版本过旧/
  )
  assert.throws(
    () => dogService.assertDogProfileServiceContract({ contract: 'dogProfile/v2', schemaVersion: 2 }),
    /档案服务版本过旧/
  )
  assert.doesNotThrow(() => dogService.assertDogProfileServiceContract({
    contract: 'dogProfile/v3',
    schemaVersion: 3,
    supportsSpecialNutritionNeeds: true
  }))
})

test('dogProfile/v3 拒绝特殊营养状态的伪造值', () => {
  const invalidCases = [
    { hasDisease: 'false' },
    { reproductiveStatus: 'neutered' },
    { therapeuticWeightManagement: 'daily' }
  ]

  invalidCases.forEach((specialNutritionNeeds) => {
    const dog = dogService.normalizeDog({
      ...completeDog,
      specialNutritionNeeds: {
        ...completeDog.specialNutritionNeeds,
        ...specialNutritionNeeds
      }
    })
    assert.throws(
      () => dogService.validateDog(dog, '2026-07-27'),
      /特殊营养需求数据格式不正确/
    )
  })
})

test('create、update、list、cache 与 Mock 往返保留特殊营养状态', async () => {
  storage.removeSync('mockDogs')
  storage.removeSync('dogsCache')

  const created = await dogService.createDog(completeDog)
  assert.deepEqual(created.specialNutritionNeeds, completeDog.specialNutritionNeeds)

  const updatedNeeds = {
    hasDisease: false,
    reproductiveStatus: 'none',
    therapeuticWeightManagement: 'gain'
  }
  const updated = await dogService.updateDog(created.id, {
    ...completeDog,
    name: '布丁更新',
    specialNutritionNeeds: updatedNeeds
  })
  assert.deepEqual(updated.specialNutritionNeeds, updatedNeeds)

  const [listed] = await dogService.listDogs()
  assert.deepEqual(listed.specialNutritionNeeds, updatedNeeds)
  assert.equal(storage.getSync('dogsCache').profileSchemaVersion, 3)
  assert.deepEqual(storage.getSync('dogsCache').items[0].specialNutritionNeeds, updatedNeeds)
})

test('云函数白名单与输出 DTO 对称保留 dogProfile/v3', () => {
  const fields = fieldsForWrite(completeDog, {
    today: '2026-07-27',
    initializeHiddenFields: true
  })
  assert.equal(fields.schemaVersion, 3)
  assert.deepEqual(fields.specialNutritionNeeds, completeDog.specialNutritionNeeds)

  const document = normalizeProfileDocument({
    _id: 'dog-1',
    _openid: 'user-1',
    ...fields
  })
  assert.equal(document.schemaVersion, 3)
  assert.deepEqual(document.specialNutritionNeeds, completeDog.specialNutritionNeeds)

  assert.throws(
    () => fieldsForWrite({
      ...completeDog,
      specialNutritionNeeds: {
        ...completeDog.specialNutritionNeeds,
        hasDisease: 'false'
      }
    }, { today: '2026-07-27' }),
    /特殊营养需求数据格式不正确/
  )
})

test('Mock 适配器边界拒绝非法特殊营养状态', async () => {
  storage.removeSync('mockDogs')

  await assert.rejects(
    mockAdapter.createDog({
      ...completeDog,
      specialNutritionNeeds: {
        ...completeDog.specialNutritionNeeds,
        reproductiveStatus: 'unknown'
      }
    }),
    /特殊营养需求数据格式不正确/
  )
  assert.deepEqual(storage.getSync('mockDogs', []), [])
})

test('Mock create/update 固定 v3 并精确保存特殊营养需求白名单', async () => {
  storage.removeSync('mockDogs')
  const payload = {
    ...completeDog,
    schemaVersion: 999,
    specialNutritionNeeds: {
      ...completeDog.specialNutritionNeeds,
      unexpected: '不得保存'
    }
  }

  const created = await mockAdapter.createDog(payload)
  assert.equal(created.schemaVersion, 3)
  assert.deepEqual(created.specialNutritionNeeds, completeDog.specialNutritionNeeds)

  const updated = await mockAdapter.updateDog(created.id, {
    ...payload,
    name: '布丁更新'
  })
  assert.equal(updated.schemaVersion, 3)
  assert.deepEqual(updated.specialNutritionNeeds, completeDog.specialNutritionNeeds)
})

test('Mock 适配器公开与云函数一致的 dogProfile/v3 能力', async () => {
  assert.deepEqual(await mockAdapter.getDogProfileContract(), {
    contract: 'dogProfile/v3',
    schemaVersion: 3,
    supportsSpecialNutritionNeeds: true,
    supportsAllergenPatch: true
  })
})
