const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ingredientService = require('../subpackages/custom-recipe/services/ingredientService')

const catalog = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'data/ingredient-catalog/releases/2026-08-17-v22.json'),
  'utf8'
))

function catalogText(item) {
  return [item.canonical_name_zh, ...(item.aliases || [])].join('|')
}

function currentFlourItems() {
  return catalog.items.filter((item) => (
    item.category_code === 'carb'
      && /(?:面粉|小麦粉|全麦粉|麦粉|粗面粉|粗麦粉|杜兰|斯佩尔特)/.test(catalogText(item))
  ))
}

function currentCheeseItems() {
  return catalog.items.filter((item) => (
    item.category_code === 'dairy'
      && /(?:奶酪|芝士|乳酪|干酪)/.test(catalogText(item))
  ))
}

test('当前 v22 的面粉/麦粉聚合后只保留两种代表项', () => {
  const representatives = currentFlourItems()
    .filter(ingredientService.isIngredientSelectionRepresentative)

  assert.deepEqual(
    representatives.map((item) => item.canonical_name_zh),
    ['面粉', '全麦面粉']
  )
})

test('当前 v22 的奶酪聚合后只保留两种代表项', () => {
  const representatives = currentCheeseItems()
    .filter(ingredientService.isIngredientSelectionRepresentative)

  assert.deepEqual(
    representatives.map((item) => item.canonical_name_zh),
    ['切达奶酪', '马苏里拉奶酪']
  )
})

test('目录页面过滤重复项，但保留其他粉类和普通食材', () => {
  const release = {
    release_id: 'release-v22',
    catalog_version: '2026-08-17-v22',
    policy_version: '2026-08-17-v7'
  }
  const records = [
    { food_id: 'flour', concept_id: 'ingredient_auto_model_21eaff4331362c33', variant_id: 'v1', canonical_name_zh: '面粉', category_code: 'carb', is_default: true, policy_status: 'allowed' },
    { food_id: 'low-flour', concept_id: 'ingredient_auto_model_310604136757ec38', variant_id: 'v2', canonical_name_zh: '低筋面粉', category_code: 'carb', is_default: true, policy_status: 'allowed' },
    { food_id: 'rice-flour', concept_id: 'ingredient_auto_946f5c718eb0f002', variant_id: 'v3', canonical_name_zh: '糯米粉', category_code: 'carb', is_default: true, policy_status: 'allowed' },
    { food_id: 'cheddar', concept_id: 'ingredient_auto_667e81096d909865', variant_id: 'v4', canonical_name_zh: '切达奶酪', category_code: 'dairy', is_default: true, policy_status: 'allowed' },
    { food_id: 'parmesan', concept_id: 'ingredient_auto_45903480176c1abb', variant_id: 'v5', canonical_name_zh: '帕尔马干酪', category_code: 'dairy', is_default: true, policy_status: 'allowed' }
  ]

  assert.deepEqual(
    ingredientService.normalizeCatalogPage(records, release, '').map((item) => item.name),
    ['面粉', '糯米粉', '切达奶酪']
  )
})

test('搜索重复写法时允许代表项通过本地聚合匹配', () => {
  assert.equal(ingredientService.catalogItemMatches({
    name: '面粉',
    canonicalName: '面粉',
    category: 'carb'
  }, '低筋面粉'), true)
  assert.equal(ingredientService.catalogItemMatches({
    name: '切达奶酪',
    canonicalName: '切达奶酪',
    category: 'dairy'
  }, '马苏里拉'), true)
})
