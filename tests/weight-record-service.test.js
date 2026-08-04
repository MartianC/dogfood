const test = require('node:test')
const assert = require('node:assert/strict')

const env = require('../config/env')
const storage = require('../utils/storage')
const weightService = require('../subpackages/dog-profile/services/weightService')
const weightMockAdapter = require('../subpackages/dog-profile/services/weightMockAdapter')
const { WeightFunctionCallError } = require('../subpackages/dog-profile/services/weightCloudbaseAdapter')

function seedDogs() {
  storage.setSync('mockDogs', [
    {
      id: 'dog-1',
      userId: env.mockUser.id,
      name: '布丁',
      weightKg: 10
    },
    {
      id: 'dog-2',
      userId: env.mockUser.id,
      name: '奶糖',
      weightKg: 8
    },
    {
      id: 'dog-outsider',
      userId: 'other-user',
      name: '别人的狗',
      weightKg: 12
    }
  ])
  storage.removeSync(weightMockAdapter.STORAGE_KEY)
  weightMockAdapter.__setClockForTest(() => new Date('2026-08-04T12:00:00.000Z'))
  weightService.__setAdapterForTest(weightMockAdapter)
}

test.afterEach(() => {
  storage.removeSync('mockDogs')
  storage.removeSync(weightMockAdapter.STORAGE_KEY)
  weightMockAdapter.__resetClockForTest()
  weightService.__resetAdapterForTest()
})

test('体重 service 通过 Mock 完成新增、分页、详情和当前体重同步', async () => {
  seedDogs()

  const older = await weightService.create({
    dogId: 'dog-1',
    weightKg: 9.8,
    measuredOn: '2026-08-01'
  })
  const latest = await weightService.create({
    dogId: 'dog-1',
    weightKg: 10.25,
    measuredOn: '2026-08-03'
  })

  assert.equal(older.measurement.weightKg, 9.8)
  assert.equal(latest.currentWeight.weightKg, 10.25)
  assert.equal(storage.getSync('mockDogs')[0].weightKg, 10.25)

  const firstPage = await weightService.list({ dogId: 'dog-1', limit: 1 })
  assert.deepEqual(firstPage.items.map((item) => item.id), [latest.measurement.id])
  assert.ok(firstPage.nextCursor)

  const secondPage = await weightService.list({
    dogId: 'dog-1',
    limit: 1,
    cursor: firstPage.nextCursor
  })
  assert.deepEqual(secondPage.items.map((item) => item.id), [older.measurement.id])
  assert.equal(secondPage.nextCursor, null)

  const detail = await weightService.get(latest.measurement.id)
  assert.equal(detail.dogId, 'dog-1')
  await assert.rejects(
    () => weightService.list({ dogId: 'dog-outsider' }),
    /无权使用该狗狗档案/
  )
})

test('删除最新体重回退上一条，删除最后一条清空档案当前体重', async () => {
  seedDogs()
  const previous = await weightService.create({
    dogId: 'dog-1',
    weightKg: 9.8,
    measuredOn: '2026-08-01'
  })
  const latest = await weightService.create({
    dogId: 'dog-1',
    weightKg: 10.25,
    measuredOn: '2026-08-03'
  })

  const fallback = await weightService.remove(latest.measurement.id)
  assert.equal(fallback.outcome, 'fallback-to-previous-measurement')
  assert.equal(fallback.currentWeight.weightKg, previous.measurement.weightKg)
  assert.equal(storage.getSync('mockDogs')[0].weightKg, previous.measurement.weightKg)

  const unrecorded = await weightService.remove(previous.measurement.id)
  assert.equal(unrecorded.outcome, 'unrecorded')
  assert.equal(unrecorded.currentWeight.weightKg, null)
  assert.equal(storage.getSync('mockDogs')[0].weightKg, null)
})

test('编辑体重通过替换生成新历史记录，不就地修改旧记录', async () => {
  seedDogs()
  const original = await weightService.create({
    dogId: 'dog-1',
    weightKg: 9.8,
    measuredOn: '2026-08-01'
  })

  const updated = await weightService.update(original.measurement.id, {
    dogId: 'dog-1',
    weightKg: 10.1,
    measuredOn: '2026-08-02'
  })
  assert.equal(updated.replacedMeasurementId, original.measurement.id)
  assert.notEqual(updated.replacement.id, original.measurement.id)
  assert.equal(updated.replacement.weightKg, 10.1)
  await assert.rejects(() => weightService.get(original.measurement.id), /未找到体重测量记录/)
  assert.equal((await weightService.list({ dogId: 'dog-1' })).items.length, 1)
})

test('体重 service 在写入前拒绝额外归属字段且将云端错误收口', async () => {
  seedDogs()
  await assert.rejects(
    () => weightService.create({
      dogId: 'dog-1',
      weightKg: 10,
      measuredOn: '2026-08-03',
      userId: 'other-user'
    }),
    /写入字段不完整/
  )

  const raw = { errMsg: 'cloud.callFunction:fail request:fail timeout' }
  weightService.__setAdapterForTest({
    async getWeightRecordContract() {
      throw new WeightFunctionCallError(raw)
    }
  })
  await assert.rejects(
    () => weightService.create({ dogId: 'dog-1', weightKg: 10, measuredOn: '2026-08-03' }),
    (error) => {
      assert.equal(error.name, 'WeightRecordError')
      assert.equal(error.code, 'NETWORK_ERROR')
      assert.equal(error.retryable, true)
      assert.equal(error.operation, 'contract')
      return true
    }
  )
})
