const test = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const {
  CARE_RECORD_CONTRACT,
  CARE_RECORD_SCHEMA_VERSION,
  CARE_RECORD_TYPES,
  CARE_RECORD_KEYS,
  CARE_RECORD_WRITE_KEYS,
  CARE_RECORD_TYPE_LABELS,
  CARE_RECORD_NAME_MAX_LENGTH,
  CARE_RECORD_NOTES_MAX_LENGTH,
  validateCareRecordInput,
  validateCareRecord,
  normalizeCareRecordInput,
  assertCareRecordServiceContract
} = require('../contracts/care/careRecordContract')

const root = path.resolve(__dirname, '..')
const fixture = require('./fixtures/care-record-v1.json')

test('护理记录机器合同固定四类事实和可选日期字段', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(
    root,
    'contracts/care/care-record-v1.schema.json'
  ), 'utf8'))
  const writeSchema = JSON.parse(fs.readFileSync(path.join(
    root,
    'contracts/care/care-record-write-v1.schema.json'
  ), 'utf8'))

  assert.equal(schema.$id, CARE_RECORD_CONTRACT)
  assert.equal(schema.properties.schemaVersion.const, CARE_RECORD_SCHEMA_VERSION)
  assert.deepEqual(schema.properties.type.enum, CARE_RECORD_TYPES)
  assert.deepEqual(Object.keys(CARE_RECORD_TYPE_LABELS), CARE_RECORD_TYPES)
  assert.deepEqual(schema.properties.nextDate.type, ['string', 'null'])
  assert.deepEqual(writeSchema.required, [
    'schemaVersion',
    'dogId',
    'type',
    'name',
    'occurredOn',
    'nextDate',
    'notes'
  ])
  assert.equal(schema.properties.name.maxLength, CARE_RECORD_NAME_MAX_LENGTH)
  assert.equal(schema.properties.notes.maxLength, CARE_RECORD_NOTES_MAX_LENGTH)
})

test('护理记录输入会规范化可选字段并保留用户填写的日期', () => {
  assert.deepEqual(normalizeCareRecordInput({
    dogId: ' dog_001 ',
    type: ' vaccine ',
    name: ' 狂犬病疫苗 ',
    occurredOn: '2026-07-01',
    nextDate: '',
    notes: '  社区动物医院  '
  }), {
    schemaVersion: 1,
    dogId: 'dog_001',
    type: 'vaccine',
    name: '狂犬病疫苗',
    occurredOn: '2026-07-01',
    nextDate: null,
    notes: '社区动物医院'
  })

  const normalizedInput = validateCareRecordInput({
    dogId: fixture.dogId,
    type: fixture.type,
    name: fixture.name,
    occurredOn: fixture.occurredOn,
    nextDate: null,
    notes: fixture.notes
  }, { today: '2026-08-04' })
  assert.deepEqual(normalizedInput, {
    schemaVersion: 1,
    dogId: 'dog_001',
    type: 'vaccine',
    name: '狂犬病疫苗',
    occurredOn: '2026-07-01',
    nextDate: null,
    notes: '社区动物医院，用户记录的事实备注。'
  })
  assert.deepEqual(Object.keys(normalizedInput), CARE_RECORD_WRITE_KEYS)
})

test('护理记录拒绝未知类型、无效日期、未来事实和倒置下次日期', () => {
  const cases = [
    [{ ...fixture, type: 'medical_advice' }, /护理类型无效/],
    [{ ...fixture, occurredOn: '2026-02-30' }, /正确的护理发生日期/],
    [{ ...fixture, occurredOn: '2026-08-05' }, /发生日期不能晚于今天/],
    [{ ...fixture, nextDate: '2026-06-30' }, /下次护理日期不能早于发生日期/],
    [{ ...fixture, nextDate: '2026-13-01' }, /正确的下次护理日期/],
    [{ ...fixture, name: '名'.repeat(CARE_RECORD_NAME_MAX_LENGTH + 1) }, /护理名称不能超过/],
    [{ ...fixture, notes: '备'.repeat(CARE_RECORD_NOTES_MAX_LENGTH + 1) }, /护理备注不能超过/],
    [{ dogId: fixture.dogId, type: fixture.type, occurredOn: fixture.occurredOn, unexpected: true }, /写入字段不完整/],
    [{ dogId: fixture.dogId, type: fixture.type, occurredOn: fixture.occurredOn, schemaVersion: 2 }, /版本无效/]
  ]

  cases.forEach(([payload, expected]) => {
    assert.throws(
      () => validateCareRecordInput(
        Object.fromEntries(
          Object.entries(payload).filter(([key]) => key !== 'id' && key !== 'createdAt' && key !== 'updatedAt')
        ),
        { today: '2026-08-04' }
      ),
      expected
    )
  })
})

test('护理事实实体要求服务端标识和审计时间，但不允许客户端改变狗狗归属', () => {
  assert.doesNotThrow(() => validateCareRecord(fixture, { today: '2026-08-04' }))
  assert.throws(
    () => validateCareRecord({ ...fixture, id: '' }, { today: '2026-08-04' }),
    /缺少记录标识/
  )
  assert.deepEqual(Object.keys(validateCareRecord(fixture, { today: '2026-08-04' })), CARE_RECORD_KEYS)
  assert.throws(
    () => validateCareRecord({ ...fixture, dogId: '' }, { today: '2026-08-04' }),
    /缺少目标狗狗/
  )
  assert.throws(
    () => validateCareRecord({ ...fixture, schemaVersion: 2 }, { today: '2026-08-04' }),
    /版本无效/
  )
})

test('护理服务能力合同固定版本和类型集合', () => {
  assert.doesNotThrow(() => assertCareRecordServiceContract({
    contract: 'careRecord/v1',
    schemaVersion: 1,
    supportedTypes: CARE_RECORD_TYPES.join(',')
  }))
  assert.throws(
    () => assertCareRecordServiceContract({
      contract: 'careRecord/v1',
      schemaVersion: 2,
      supportedTypes: CARE_RECORD_TYPES.join(',')
    }),
    /护理服务版本过旧/
  )
})

test('护理合同门禁脚本通过', () => {
  const result = spawnSync(process.execPath, ['scripts/check-care-record-contract.js'], {
    cwd: root,
    encoding: 'utf8'
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /checks passed/)
})
