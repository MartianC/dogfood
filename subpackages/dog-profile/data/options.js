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

// 引导页按活动水平选择；代表时长用于兼容现有能量计算字段。
const activityLevelOptions = [
  { value: 'low', label: '低活动', description: '以休息为主，只有短距离散步', dailyActivityHours: 0.5 },
  { value: 'moderateLowImpact', label: '一般活动', description: '每天规律散步，有适度活动', dailyActivityHours: 1.5 },
  { value: 'moderateHighImpact', label: '较多活动', description: '每天运动时间较长，活动量较多', dailyActivityHours: 2.5 },
  { value: 'high', label: '高活动', description: '经常奔跑、训练或长时间运动', dailyActivityHours: 4 }
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
  activityLevelOptions,
  bodyConditionOptions,
  reproductiveStatusOptions
}
