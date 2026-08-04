const contract = require('../../../contracts/care/careRecordContract')

const CARE_RECORD_FILTER_OPTIONS = Object.freeze([
  { value: '', label: '全部' },
  ...contract.CARE_RECORD_TYPES.map((value) => ({
    value,
    label: contract.CARE_RECORD_TYPE_LABELS[value]
  }))
])

function optionIndex(options, value, fallback = 0, key = 'value') {
  const index = options.findIndex((item) => String(item[key] || '') === String(value || ''))
  return index >= 0 ? index : fallback
}

function createEmptyCareRecordForm({ dogId = '', occurredOn = contract.shanghaiDateText() } = {}) {
  return {
    schemaVersion: contract.CARE_RECORD_SCHEMA_VERSION,
    dogId: String(dogId || '').trim(),
    type: contract.CARE_RECORD_TYPES[0],
    name: '',
    occurredOn,
    nextDate: '',
    notes: ''
  }
}

function formFromCareRecord(record = {}) {
  return {
    schemaVersion: contract.CARE_RECORD_SCHEMA_VERSION,
    dogId: String(record.dogId || '').trim(),
    type: String(record.type || '').trim(),
    name: String(record.name || ''),
    occurredOn: String(record.occurredOn || ''),
    nextDate: String(record.nextDate || ''),
    notes: String(record.notes || '')
  }
}

function toCareRecordWritePayload(form = {}) {
  return {
    schemaVersion: contract.CARE_RECORD_SCHEMA_VERSION,
    dogId: String(form.dogId || '').trim(),
    type: String(form.type || '').trim(),
    name: String(form.name || '').trim(),
    occurredOn: String(form.occurredOn || '').trim(),
    nextDate: String(form.nextDate || '').trim() || null,
    notes: String(form.notes || '').trim()
  }
}

function decorateCareRecord(record = {}) {
  return {
    ...record,
    typeLabel: contract.CARE_RECORD_TYPE_LABELS[record.type] || '其他护理',
    nameText: record.name || '',
    nextDateText: record.nextDate || '未填写下次'
  }
}

function decorateCareRecords(records = []) {
  return Array.isArray(records) ? records.map(decorateCareRecord) : []
}

module.exports = {
  CARE_RECORD_FILTER_OPTIONS,
  optionIndex,
  createEmptyCareRecordForm,
  formFromCareRecord,
  toCareRecordWritePayload,
  decorateCareRecord,
  decorateCareRecords
}
