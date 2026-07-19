const test = require('node:test')
const assert = require('node:assert/strict')

const storage = require('../utils/storage')
const ingredientService = require('../subpackages/custom-recipe/services/ingredientService')
const ingredientWorkbench = require('../subpackages/custom-recipe/services/ingredientWorkbench')

test.beforeEach(() => {
  storage.removeSync('recentIngredients')
})

test('空关键词返回最近添加的食材，非空关键词从食材库过滤', async () => {
  ingredientService.recordRecentIngredient({ id: 'recent_1', name: '西蓝花', category: 'vegetable' })

  const recent = await ingredientService.searchIngredients('')
  const results = await ingredientService.searchIngredients('鸡胸')

  assert.equal(recent[0].name, '西蓝花')
  assert.ok(results.length > 0)
  assert.ok(results.every((item) => item.name.includes('鸡胸')))
})

test('搜索不到食材时返回空数组', async () => {
  assert.deepEqual(await ingredientService.searchIngredients('不存在的食材'), [])
})

test('默认常用食材顺序和搜索结果摘要保持稳定', () => {
  const commonNames = ingredientService.getRecentIngredients().slice(0, 4).map((item) => item.name)
  const withEnergy = ingredientService.normalizeIngredient({
    id: 'chicken',
    name: '鸡胸肉',
    category: 'meat',
    energyKcalPer100g: 133
  })

  assert.deepEqual(commonNames, ['牛肉', '鸡蛋', '南瓜', '西兰花'])
  assert.equal(withEnergy.displayDescription, '每 100 g 约 133 kcal')
  assert.equal(ingredientService.normalizeIngredient({ name: '南瓜', category: 'vegetable' }).displayDescription, '蔬菜')
})

test('修改克重会实时更新每个食材比例', () => {
  const ingredients = [
    { name: '鸡胸肉', perMealAmountGram: 100 },
    { name: '胡萝卜', perMealAmountGram: 100 }
  ]

  const next = ingredientWorkbench.updateIngredientAmount(ingredients, 0, '300')

  assert.equal(next[0].ratioPercent, 75)
  assert.equal(next[1].ratioPercent, 25)
  assert.equal(ingredientWorkbench.totalIngredientGram(next), 400)
})

test('添加重复食材会合并克重，新增食材会加入列表', () => {
  const current = [{ ingredientId: 'food_1', name: '鸡胸肉', perMealAmountGram: 100 }]

  const merged = ingredientWorkbench.addIngredient(current, { id: 'food_1', name: '鸡胸肉', category: 'meat' }, 50)
  const added = ingredientWorkbench.addIngredient(merged, { id: 'food_2', name: '南瓜', category: 'vegetable' }, 30)

  assert.equal(added.length, 2)
  assert.equal(added[0].perMealAmountGram, 150)
  assert.equal(added[1].perMealAmountGram, 30)
})
