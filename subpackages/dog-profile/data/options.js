const { breedAdultWeightCatalog } = require('../../../data/breedAdultWeightCatalog')

const dietGoalOptions = [
  { value: 'daily', label: '日常' },
  { value: 'lowFat', label: '低脂' },
  { value: 'gainWeight', label: '增重' },
  { value: 'stomachFriendly', label: '肠胃友好' }
]

const breedOptions = breedAdultWeightCatalog.map(({ value, label, pinyinInitial }) => ({ value, label, pinyinInitial }))

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

const diseaseStatusOptions = [
  { value: false, label: '没有' },
  { value: true, label: '有' }
]

const reproductiveStatusOptions = [
  { value: 'none', label: '无特殊状态' },
  { value: 'pregnant', label: '妊娠' },
  { value: 'lactating', label: '哺乳' }
]

const therapeuticWeightManagementOptions = [
  { value: 'none', label: '没有' },
  { value: 'loss', label: '治疗性减重' },
  { value: 'gain', label: '治疗性增重' }
]

module.exports = {
  dietGoalOptions,
  breedOptions,
  activityDurationBands,
  bodyConditionOptions,
  diseaseStatusOptions,
  reproductiveStatusOptions,
  therapeuticWeightManagementOptions
}
