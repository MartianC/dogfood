const BREED_CATALOG_VERSION = '2026-07-19.v1'
const ESTIMATE_POLICY = 'approved-product-single-point'
const AKC_WEIGHT_CHART_URL = 'https://www.akc.org/expert-advice/nutrition/breed-weight-chart/'

const breedAdultWeightCatalog = [
  {
    value: 'shiba-inu',
    label: '柴犬',
    expectedAdultWeightKg: 10.5,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: 'AKC Breed Weight Chart',
    sourceWeightRange: '17–23 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'labrador-retriever',
    label: '拉布拉多犬',
    expectedAdultWeightKg: 30,
    sourceUrl: AKC_WEIGHT_CHART_URL,
    sourceTitle: 'AKC Breed Weight Chart',
    sourceWeightRange: '55–80 lb',
    estimatePolicy: ESTIMATE_POLICY
  },
  {
    value: 'mixed-or-unknown',
    label: '混血/不确定',
    expectedAdultWeightKg: null,
    sourceUrl: '',
    sourceTitle: '',
    sourceWeightRange: '',
    estimatePolicy: ESTIMATE_POLICY
  }
]

module.exports = {
  BREED_CATALOG_VERSION,
  breedAdultWeightCatalog
}
