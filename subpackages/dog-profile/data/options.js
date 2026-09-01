const { breedAdultWeightCatalog } = require('../../../data/breedAdultWeightCatalog')

const breedOptions = breedAdultWeightCatalog.map(({ value, label, pinyinInitial }) => ({ value, label, pinyinInitial }))

const genderOptions = [
  { value: '', label: '未选择' },
  { value: 'female', label: '女孩' },
  { value: 'male', label: '男孩' }
]

const activityDurationBands = [
  { min: 0, maxExclusive: 1, value: 'low', label: '低活动' },
  { min: 1, maxExclusive: 2, value: 'moderateLowImpact', label: '一般活动' },
  { min: 2, maxExclusive: 3, value: 'moderateHighImpact', label: '较多活动' },
  { min: 3, maxInclusive: 6, value: 'high', label: '高活动' }
]

const bodyConditionOptions = [
  { value: 'thin', label: '偏瘦' },
  { value: 'ideal', label: '理想' },
  { value: 'overweight', label: '偏胖' }
]

const reproductiveStatusOptions = [
  { value: 'none', label: '无特殊状态' },
  { value: 'pregnant', label: '妊娠' },
  { value: 'lactating', label: '哺乳' }
]

module.exports = {
  breedOptions,
  genderOptions,
  activityDurationBands,
  bodyConditionOptions,
  reproductiveStatusOptions
}
