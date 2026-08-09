const test = require('node:test')
const assert = require('node:assert/strict')

const dogService = require('../services/dogService')
const mockDogAdapter = require('../services/adapters/mock')
const cloudbaseAdapter = require('../services/adapters/cloudbase')
const storage = require('../utils/storage')
const authService = require('../services/authService')
const energyRequirementService = require('../subpackages/custom-recipe/services/energyRequirementService')
const {
  fieldsForWrite: cloudFieldsForWrite,
  normalizeProfileDocument: normalizeCloudProfile,
  shanghaiDateText,
  SUPPORTED_BREEDS: cloudSupportedBreeds
} = require('../cloudfunctions/dogProfile/profileValidation')
const { breedAdultWeightCatalog } = require('../data/breedAdultWeightCatalog')

const puppy = {
  name: '布丁',
  birthDate: '2026-01-18',
  breed: 'shiba-inu',
  weightKg: 8,
  dailyMeals: 3,
  dailyActivityHours: 1.5,
  bodyCondition: 'ideal'
}

test('档案标准化只保存受控输入并从时长派生活动水平', () => {
  const normalized = dogService.normalizeDog({
    ...puppy,
    ageStage: 'senior',
    activityLevel: 'high',
    expectedAdultWeightKg: 99
  })

  assert.equal(normalized.birthDate, '2026-01-18')
  assert.equal(normalized.breed, 'shiba-inu')
  assert.equal(normalized.dailyActivityHours, 1.5)
  assert.equal(normalized.activityLevel, 'moderateLowImpact')
  assert.equal(normalized.ageStage, undefined)
  assert.equal(normalized.expectedAdultWeightKg, undefined)
  assert.doesNotThrow(() => dogService.validateDog(normalized, '2026-07-18'))
})

test('档案校验拒绝无效日期、品种和 Slider 数值', () => {
  const expectValidationError = (overrides, message) => {
    const dog = dogService.normalizeDog({ ...puppy, ...overrides })
    assert.throws(() => dogService.validateDog(dog, '2026-07-18'), { message })
  }

  expectValidationError({ birthDate: '' }, '请填写正确的出生日期')
  expectValidationError({ birthDate: '2026-07-19' }, '出生日期不能晚于今天')
  expectValidationError({ breed: '' }, '请选择狗狗品种')
  expectValidationError({ breed: 'not-in-catalog' }, '请选择狗狗品种')
  expectValidationError({ dailyActivityHours: '' }, '请选择 0–6 小时的日均活动时长')
  expectValidationError({ dailyActivityHours: -0.5 }, '请选择 0–6 小时的日均活动时长')
  expectValidationError({ dailyActivityHours: 1.25 }, '请选择 0–6 小时的日均活动时长')
  expectValidationError({ dailyActivityHours: 6.5 }, '请选择 0–6 小时的日均活动时长')

  const zeroHours = dogService.normalizeDog({ ...puppy, dailyActivityHours: 0 })
  assert.doesNotThrow(() => dogService.validateDog(zeroHours, '2026-07-18'))

  const mixedBreed = dogService.normalizeDog({ ...puppy, breed: 'mixed-or-unknown' })
  assert.doesNotThrow(() => dogService.validateDog(mixedBreed, '2026-07-18'))
})

test('保存与读取返回运行时派生字段且编辑不会清空隐藏数组', async () => {
  storage.removeSync('mockDogs')
  storage.removeSync('dogsCache')

  const created = await dogService.createDog({
    ...puppy,
    birthDate: '2010-01-18',
    allergens: ['鸡蛋'],
    avoidIngredients: ['洋葱']
  })

  assert.equal(created.ageStage, 'senior')
  assert.equal(created.lifeStage.energyStage, 'senior')
  assert.equal(created.expectedAdultWeightKg, 10.5)
  assert.equal(created.breedCatalogVersion, '2026-07-19.v1')

  const updated = await dogService.updateDog(created.id, {
    ...puppy,
    birthDate: '2010-01-18',
    name: '布丁新档案'
  })

  assert.deepEqual(updated.allergens, ['鸡蛋'])
  assert.deepEqual(updated.avoidIngredients, ['洋葱'])
  assert.equal(updated.name, '布丁新档案')

  const [listed] = await dogService.listDogs()
  assert.equal(listed.ageStage, 'senior')
  assert.equal(listed.expectedAdultWeightKg, 10.5)
})

test('并发读取狗狗档案共享 in-flight 请求，避免冷启动重复访问', async () => {
  storage.removeSync('dogsCache')
  storage.setSync('mockDogs', [{
    id: 'concurrent-dog',
    name: '并发布丁',
    birthDate: '2020-01-01',
    breed: 'shiba-inu',
    weightKg: 8,
    dailyMeals: 2,
    dailyActivityHours: 1,
    bodyCondition: 'ideal',
    specialNutritionNeeds: {}
  }])
  const originalListDogs = mockDogAdapter.listDogs
  let calls = 0
  mockDogAdapter.listDogs = async () => {
    calls += 1
    await new Promise((resolve) => setTimeout(resolve, 10))
    return originalListDogs()
  }
  try {
    const [first, second] = await Promise.all([
      dogService.listDogs(),
      dogService.listDogs()
    ])
    assert.equal(calls, 1)
    assert.deepEqual(first, second)
  } finally {
    mockDogAdapter.listDogs = originalListDogs
    storage.removeSync('mockDogs')
    storage.removeSync('dogsCache')
  }
})

test('读取旧档案只兼容活动水平，不反推伪造活动时长', async () => {
  storage.setSync('mockDogs', [{
    id: 'legacy-dog',
    name: '旧档案',
    birthDate: '2020-01-01',
    breed: 'labrador-retriever',
    weightKg: 25,
    dailyMeals: 2,
    activityLevel: 'normal',
    bodyCondition: 'ideal'
  }])
  storage.removeSync('dogsCache')

  const [legacy] = await dogService.listDogs()

  assert.equal(legacy.activityLevel, 'moderateLowImpact')
  assert.equal(legacy.dailyActivityHours, undefined)
  assert.equal(legacy.ageStage, 'adult')
  assert.equal(legacy.expectedAdultWeightKg, 30)
})

test('云端读取旧档案不伪造缺失的活动水平', () => {
  const withoutActivity = normalizeCloudProfile({
    _id: 'cloud-legacy',
    _openid: 'user-1',
    name: '云端旧档案'
  })
  assert.equal(Object.hasOwn(withoutActivity, 'activityLevel'), false)

  const withLegacyActivity = normalizeCloudProfile({
    _id: 'cloud-normal',
    _openid: 'user-1',
    name: '已有旧活动值',
    activityLevel: 'normal'
  })
  assert.equal(withLegacyActivity.activityLevel, 'normal')
})

test('Cloud 与 Mock 缺失活动值时都保留年龄默认能量降级且缓存不注入 normal', async () => {
  const fixtures = [
    { birthDate: '2020-01-01', factorRange: { min: 110, max: 110 } },
    { birthDate: '2010-01-01', factorRange: { min: 95, max: 95 } }
  ]

  fixtures.forEach(({ birthDate, factorRange }) => {
    const raw = {
      name: '缺活动旧档案',
      birthDate,
      breed: 'labrador-retriever',
      weightKg: 25,
      dailyMeals: 2,
      bodyCondition: 'ideal'
    }
    const cloudDog = dogService.decorateSavedDog(normalizeCloudProfile({
      ...raw,
      _id: `cloud-${birthDate}`,
      _openid: 'user-1'
    }), '2026-07-18')
    const mockDog = dogService.decorateSavedDog(raw, '2026-07-18')

    assert.equal(cloudDog.activityLevel, '')
    assert.equal(mockDog.activityLevel, '')

    const result = energyRequirementService.calculateEnergyRequirement({
      dog: cloudDog,
      lifeStage: cloudDog.lifeStage
    })
    assert.deepEqual(result.factorRange, factorRange)
    assert.equal(result.provisional, true)
    assert.equal(result.basisCode, 'fediaf_age_default')
  })

  storage.setSync('mockDogs', [{
    id: 'cache-no-activity',
    name: '缓存旧档案',
    birthDate: '2010-01-01',
    breed: 'labrador-retriever',
    weightKg: 25,
    dailyMeals: 2,
    bodyCondition: 'ideal'
  }])
  storage.removeSync('dogsCache')
  await dogService.listDogs()

  const cached = storage.getCache('dogsCache')
  assert.equal(cached.items[0].activityLevel, '')
  assert.notEqual(cached.items[0].activityLevel, 'normal')
})

test('适配器失败时不复用可能含伪造活动值的旧版档案缓存', async () => {
  storage.setSync('dogsCache', {
    items: [{
      id: 'polluted-cache',
      name: '旧缓存',
      birthDate: '2010-01-01',
      breed: 'labrador-retriever',
      weightKg: 25,
      dailyMeals: 2,
      activityLevel: 'moderateLowImpact',
      bodyCondition: 'ideal'
    }],
    updatedAt: new Date().toISOString()
  })

  const originalListDogs = cloudbaseAdapter.listDogs
  cloudbaseAdapter.listDogs = async () => {
    throw new Error('模拟云端不可用')
  }
  try {
    assert.deepEqual(await dogService.listDogs(), [])
  } finally {
    cloudbaseAdapter.listDogs = originalListDogs
  }
})

test('登录态初始化同样忽略旧版档案缓存', async () => {
  storage.setSync('access_token', 'test-token')
  storage.setSync('currentUser', { id: 'user-1' })
  storage.setSync('dogsCache', {
    items: [{ id: 'polluted-auth-cache', activityLevel: 'moderateLowImpact' }],
    updatedAt: new Date().toISOString()
  })

  try {
    const auth = await authService.initAuth()
    assert.deepEqual(auth.dogs, [])
    assert.equal(auth.authState, 'logged-in')
  } finally {
    storage.removeSync('access_token')
    storage.removeSync('currentUser')
    storage.removeSync('dogsCache')
  }
})

test('云端写入重新派生活动水平并只保留白名单字段', () => {
  const fields = cloudFieldsForWrite({
    ...puppy,
    ageStage: 'senior',
    activityLevel: 'high',
    expectedAdultWeightKg: 99,
    unexpected: '不能写入'
  }, { today: '2026-07-18', initializeHiddenFields: true })

  assert.equal(fields.activityLevel, 'moderateLowImpact')
  assert.equal(fields.expectedAdultWeightKg, undefined)
  assert.equal(fields.ageStage, undefined)
  assert.equal(fields.unexpected, undefined)
  assert.deepEqual(fields.allergens, [])
  assert.deepEqual(fields.avoidIngredients, [])
})

test('云端更新省略隐藏数组并拒绝伪造品种与时长', () => {
  const fields = cloudFieldsForWrite(puppy, { today: '2026-07-18' })
  assert.equal(Object.hasOwn(fields, 'allergens'), false)
  assert.equal(Object.hasOwn(fields, 'avoidIngredients'), false)

  assert.throws(
    () => cloudFieldsForWrite({ ...puppy, breed: 'fake-breed' }, { today: '2026-07-18' }),
    { message: '请选择狗狗品种' }
  )
  assert.throws(
    () => cloudFieldsForWrite({ ...puppy, dailyActivityHours: 1.25 }, { today: '2026-07-18' }),
    { message: '请选择 0–6 小时的日均活动时长' }
  )
  assert.throws(
    () => cloudFieldsForWrite({ ...puppy, allergens: '鸡蛋' }, { today: '2026-07-18' }),
    { message: '过敏源数据格式不正确' }
  )
  assert.throws(
    () => cloudFieldsForWrite({ ...puppy, avoidIngredients: '洋葱' }, { today: '2026-07-18' }),
    { message: '忌口数据格式不正确' }
  )
})

test('云端受控品种集合与客户端目录保持一致', () => {
  assert.deepEqual(
    cloudSupportedBreeds,
    breedAdultWeightCatalog.map((item) => item.value)
  )
})

test('云端今天固定使用上海自然日且可注入当前时刻', () => {
  const beforeShanghaiMidnight = new Date('2026-07-18T15:59:59.999Z')
  const atShanghaiMidnight = new Date('2026-07-18T16:00:00.000Z')

  assert.equal(shanghaiDateText(beforeShanghaiMidnight), '2026-07-18')
  assert.equal(shanghaiDateText(atShanghaiMidnight), '2026-07-19')

  assert.throws(
    () => cloudFieldsForWrite(
      { ...puppy, birthDate: '2026-07-19' },
      { now: beforeShanghaiMidnight }
    ),
    { message: '出生日期不能晚于今天' }
  )
  assert.doesNotThrow(() => cloudFieldsForWrite(
    { ...puppy, birthDate: '2026-07-19' },
    { now: atShanghaiMidnight }
  ))
})

test('Mock 档案公共接口与云端一致拒绝非法隐藏字段类型', async () => {
  storage.removeSync('mockDogs')
  storage.removeSync('dogsCache')

  await assert.rejects(
    dogService.createDog({ ...puppy, allergens: '鸡蛋' }),
    { message: '过敏源数据格式不正确' }
  )
  await assert.rejects(
    dogService.createDog({ ...puppy, avoidIngredients: '洋葱' }),
    { message: '忌口数据格式不正确' }
  )

  assert.deepEqual(storage.getSync('mockDogs', []), [])
})

test('Mock 适配器写入边界也拒绝非法隐藏字段类型', async () => {
  storage.removeSync('mockDogs')

  await assert.rejects(
    mockDogAdapter.createDog({ ...puppy, allergens: '鸡蛋' }),
    { message: '过敏源数据格式不正确' }
  )
  await assert.rejects(
    mockDogAdapter.updateDog('missing-dog', { ...puppy, avoidIngredients: '洋葱' }),
    { message: '忌口数据格式不正确' }
  )
  assert.deepEqual(storage.getSync('mockDogs', []), [])
})
