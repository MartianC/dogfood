const {
  BREED_CATALOG_VERSION,
  breedAdultWeightCatalog
} = require('../data/breedAdultWeightCatalog')

function deriveActivityLevel(value) {
  if (value === '' || value === null || value === undefined) return ''

  const hours = Number(value)
  if (!Number.isFinite(hours) || hours < 0 || hours > 6) return ''
  if (hours < 1) return 'low'
  if (hours < 2) return 'moderateLowImpact'
  if (hours < 3) return 'moderateHighImpact'
  return 'high'
}

function estimateExpectedAdultWeight(breed) {
  const item = breedAdultWeightCatalog.find((option) => option.value === breed)
  if (!item || !(item.expectedAdultWeightKg > 0)) {
    return {
      available: false,
      adultWeightEstimateReason: 'breed_estimate_unavailable',
      expectedAdultWeightKg: null,
      breedCatalogVersion: BREED_CATALOG_VERSION
    }
  }

  return {
    available: true,
    adultWeightEstimateReason: '',
    expectedAdultWeightKg: item.expectedAdultWeightKg,
    breedCatalogVersion: BREED_CATALOG_VERSION,
    sourceUrl: item.sourceUrl,
    sourceTitle: item.sourceTitle,
    sourceWeightRange: item.sourceWeightRange,
    estimatePolicy: item.estimatePolicy
  }
}

module.exports = {
  deriveActivityLevel,
  estimateExpectedAdultWeight
}
