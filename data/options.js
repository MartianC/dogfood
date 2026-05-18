const ageStageOptions = [
  { value: 'puppy', label: '幼犬' },
  { value: 'adult', label: '成年犬' },
  { value: 'senior', label: '老年犬' }
]

const dietGoalOptions = [
  { value: 'daily', label: '日常' },
  { value: 'lowFat', label: '低脂' },
  { value: 'gainWeight', label: '增重' },
  { value: 'stomachFriendly', label: '肠胃友好' }
]

const ingredientCategoryOptions = [
  { value: 'meat', label: '肉类' },
  { value: 'vegetable', label: '蔬菜' },
  { value: 'carb', label: '主食' },
  { value: 'other', label: '其他' }
]

const allergenOptions = [
  { value: 'chicken', label: '鸡肉' },
  { value: 'beef', label: '牛肉' },
  { value: 'fish', label: '鱼肉' },
  { value: 'egg', label: '蛋类' },
  { value: 'grain', label: '谷物' }
]

module.exports = {
  ageStageOptions,
  dietGoalOptions,
  ingredientCategoryOptions,
  allergenOptions
}
