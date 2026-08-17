const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const {
  createAllergyEntry,
  parseAllergyEntry,
  allergyDisplayItems,
  isIngredientAllergen,
  applyDogAllergyPolicy
} = require('../services/dogIngredientPolicy')
const cloudPolicy = require('../cloudfunctions/sharedMealRecord/dogIngredientPolicy')
const humanRecipeService = require('../subpackages/shared-meal/services/humanRecipeService')

const egg = {
  conceptId: 'ingredient_egg',
  variantId: 'variant_egg_cooked',
  foodId: 'food_egg',
  name: '鸡蛋',
  policyStatus: 'conditional'
}

test('过敏条目使用稳定概念 ID 编码并可恢复展示名称', () => {
  const entry = createAllergyEntry(egg)
  assert.deepEqual(parseAllergyEntry(entry), {
    raw: entry,
    conceptId: 'ingredient_egg',
    name: '鸡蛋',
    legacy: false
  })
  assert.deepEqual(allergyDisplayItems([entry, entry]).map((item) => item.name), ['鸡蛋'])
})

test('目录食材命中狗狗过敏概念后统一投影为 blocked', () => {
  const dog = { name: '布丁', allergens: [createAllergyEntry(egg)] }
  const projected = applyDogAllergyPolicy(egg, dog)

  assert.equal(isIngredientAllergen(egg, dog), true)
  assert.equal(projected.policyStatus, 'blocked')
  assert.equal(projected.policy_status, 'blocked')
  assert.equal(projected.blockedByDogAllergy, true)
  assert.match(projected.blockedReason, /布丁.*鸡蛋.*过敏/)
  assert.equal(cloudPolicy.isIngredientAllergen(egg, dog), true)
})

test('旧档案中的名称和 allergenKey 仍可命中过敏规则', () => {
  assert.equal(isIngredientAllergen({ name: '鸡蛋' }, { allergens: ['鸡蛋'] }), true)
  assert.equal(isIngredientAllergen({ allergenKey: 'chicken' }, { allergens: ['chicken'] }), true)
})

test('人饭菜单把目标狗狗过敏食材归入不可选分类', async () => {
  humanRecipeService.__setAdapterForTest({
    async getHumanRecipe() {
      return {
        recipeVersion: 'recipe-v1',
        recipe: {
          _id: 'recipe-egg',
          title: '番茄炒蛋',
          release_id: 'release-v1',
          recipe_version: 'recipe-v1',
          mapping_version: 'mapping-v1',
          compatible_catalog_version: 'catalog-v1',
          compatible_policy_version: 'policy-v1',
          ingredients: [{
            position: 0,
            raw_name: '鸡蛋',
            mapping_status: 'matched',
            components: [{
              concept_id: egg.conceptId,
              variant_id: egg.variantId,
              food_id: egg.foodId,
              canonical_name_zh: egg.name,
              policy_status: 'conditional'
            }]
          }]
        }
      }
    }
  })
  const dog = { name: '布丁', allergens: [createAllergyEntry(egg)] }
  const recipe = await humanRecipeService.getHumanRecipe('recipe-egg', dog)
  const component = recipe.ingredients[0].components[0]

  assert.equal(component.policyStatus, 'blocked')
  assert.equal(component.canSelect, false)
  assert.match(component.blockedReason, /布丁.*鸡蛋.*过敏/)
})

test('额外添加入口把目标狗狗过敏食材作为 blocked 拒绝打开克重弹层', () => {
  const file = path.join(__dirname, '../subpackages/custom-recipe/ingredient-search/index.js')
  const previousPage = global.Page
  const previousWx = global.wx
  let definition
  let toast
  global.Page = (value) => { definition = value }
  global.wx = { showToast(payload) { toast = payload } }
  delete require.cache[require.resolve(file)]
  require(file)
  global.Page = previousPage

  try {
    const dog = { name: '布丁', allergens: [createAllergyEntry(egg)] }
    const context = {
      data: { targetDog: dog, selectedIngredient: null, popupVisible: false },
      setData(patch) { Object.assign(this.data, patch) }
    }
    definition.openIngredientPopup.call(context, egg)

    assert.equal(context.data.popupVisible, false)
    assert.match(toast.title, /布丁.*鸡蛋.*过敏/)
  } finally {
    global.wx = previousWx
  }
})
