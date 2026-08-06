const {
  WEIGHT_MEASUREMENT_SCHEMA_VERSION,
  dateTextInShanghai,
  normalizeWeightMeasurementInput
} = require('../../../services/weightContract')

function todayText(now = new Date()) {
  return dateTextInShanghai(now)
}

function formFromMeasurement(measurement = {}) {
  return {
    weightKg: measurement.weightKg == null ? '' : String(measurement.weightKg),
    measuredOn: measurement.measuredOn || ''
  }
}

function validateForm({ dogId, form = {}, today } = {}) {
  return normalizeWeightMeasurementInput({
    schemaVersion: WEIGHT_MEASUREMENT_SCHEMA_VERSION,
    dogId,
    weightKg: form.weightKg,
    measuredOn: form.measuredOn
  }, { today })
}

function formErrorState(message = '') {
  const text = String(message || '')
  return {
    weightKgError: /体重/.test(text) ? text : '',
    measuredOnError: /日期/.test(text) ? text : '',
    formError: /体重|日期|目标狗狗/.test(text) ? '' : text
  }
}

module.exports = {
  todayText,
  formFromMeasurement,
  validateForm,
  formErrorState
}
