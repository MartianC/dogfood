const test = require('node:test')
const assert = require('node:assert/strict')

const {
  measurementBasisText
} = require('../subpackages/shared-meal/utils/ingredientMeasurementBasis')
const {
  normalizeHumanRecipeDetail
} = require('../subpackages/shared-meal/services/sharedMealDraftService')

function loadRecordDetailPage() {
  const file = require.resolve('../subpackages/shared-meal/record-detail/index.js')
  const previousPage = global.Page
  let definition
  global.Page = (value) => { definition = value }
  delete require.cache[file]
  const moduleExports = require(file)
  global.Page = previousPage
  return { definition, moduleExports }
}

test('营养形态映射为四种生活化称量口径且未知值不猜测', () => {
  assert.equal(measurementBasisText('raw'), '按生重称量')
  assert.equal(measurementBasisText('simmered'), '按熟重称量')
  assert.equal(measurementBasisText('dried'), '按干重称量')
  assert.equal(measurementBasisText('as_served'), '按当前记录口径称量')
  assert.equal(measurementBasisText('future-state'), '按当前记录口径称量')
  assert.equal(measurementBasisText(null), '按当前记录口径称量')
})

test('可信人饭详情保留目录营养形态供 compose 显示', () => {
  const normalized = normalizeHumanRecipeDetail({
    recipeVersion: 'recipe-v1',
    recipe: {
      id: 'menu-measurement',
      title: '鸡肉饭',
      release_id: 'runtime-v1',
      base_release_id: 'nutrition-v1',
      recipe_version: 'recipe-v1',
      mapping_version: 'mapping-v1',
      compatible_catalog_version: 'catalog-v1',
      compatible_policy_version: 'policy-v1',
      ingredients: [{
        position: 0,
        raw_name: '鸡胸肉',
        components: [{
          concept_id: 'ingredient-chicken',
          variant_id: 'variant-chicken-raw',
          food_id: 'food-chicken',
          display_name_zh: '鸡胸肉（生）',
          category_code: 'meat',
          preparation_state: 'raw',
          policy_status: 'allowed'
        }]
      }]
    }
  })

  assert.equal(normalized.ingredients[0].components[0].preparationState, 'raw')
})

test('记录详情展示模型复用同一称量口径函数但不改变布局', () => {
  const { moduleExports } = loadRecordDetailPage()
  const view = moduleExports.detailView({
    mealTime: '2026-07-30T00:00:00.000Z',
    dogMealItems: [
      { variantId: 'variant-raw', preparationState: 'raw' },
      { variantId: 'variant-legacy' }
    ]
  })

  assert.deepEqual(view.dogMealItems.map((item) => item.measurementBasisText), [
    '按生重称量',
    '按当前记录口径称量'
  ])
})
