const test = require('node:test')
const assert = require('node:assert/strict')

const {
  CARE_RECORD_FILTER_OPTIONS,
  createEmptyCareRecordForm,
  decorateCareRecord,
  formFromCareRecord,
  optionIndex,
  toCareRecordWritePayload
} = require('../care/careRecordPageModel')

test('护理页面模型固定全部和四类筛选，并可按稳定 ID 定位狗狗', () => {
  assert.deepEqual(CARE_RECORD_FILTER_OPTIONS.map((item) => item.value), [
    '',
    'vaccine',
    'internal_deworming',
    'external_deworming',
    'other'
  ])
  assert.equal(optionIndex([{ id: 'dog-1' }, { id: 'dog-2' }], 'dog-2', 0, 'id'), 1)
  assert.equal(optionIndex([{ value: 'vaccine' }], 'unknown', 0), 0)
})

test('护理页面模型保留编辑内容并把空下次日期规范为 null', () => {
  const empty = createEmptyCareRecordForm({ dogId: 'dog-1', occurredOn: '2026-08-05' })
  assert.deepEqual(empty, {
    schemaVersion: 1,
    dogId: 'dog-1',
    type: 'vaccine',
    name: '',
    occurredOn: '2026-08-05',
    nextDate: '',
    notes: ''
  })

  const form = formFromCareRecord({
    dogId: 'dog-1',
    type: 'other',
    name: '洗澡',
    occurredOn: '2026-08-01',
    nextDate: null,
    notes: '长备注\n保留换行'
  })
  assert.deepEqual(toCareRecordWritePayload(form), {
    schemaVersion: 1,
    dogId: 'dog-1',
    type: 'other',
    name: '洗澡',
    occurredOn: '2026-08-01',
    nextDate: null,
    notes: '长备注\n保留换行'
  })
})

test('护理页面模型显示类型名称和未填写下次日期', () => {
  assert.deepEqual(
    decorateCareRecord({ id: 'care-1', type: 'external_deworming', name: '', nextDate: null }),
    {
      id: 'care-1',
      type: 'external_deworming',
      name: '',
      nextDate: null,
      typeLabel: '体外驱虫',
      nameText: '',
      nextDateText: '未填写下次'
    }
  )
})
