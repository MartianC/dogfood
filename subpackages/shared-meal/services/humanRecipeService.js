const env = require('../../../config/env')
const {
  canAddIngredient
} = require('./ingredientOperationRules')
const {
  normalizeHumanRecipeDetail
} = require('./sharedMealDraftService')

let adapter = env.useCloudBase
  ? require('../../../services/adapters/cloudbase')
  : require('../../../services/adapters/mock')

function normalizeComponent(component = {}) {
  const policyStatus = String(component.policy_status || component.policyStatus || 'unknown')
  const canSelect = canAddIngredient(policyStatus)
  return {
    conceptId: String(component.concept_id || component.conceptId || ''),
    variantId: String(component.variant_id || component.variantId || ''),
    foodId: String(component.food_id || component.foodId || ''),
    displayName: String(
      component.display_name_zh
      || component.canonical_name_zh
      || component.displayName
      || ''
    ),
    policyStatus,
    canSelect,
    selected: false,
    blockedReason: canSelect ? '' : String(
      component.blockedReason || '当前策略不允许加入狗饭。'
    )
  }
}

function normalizeIngredient(ingredient = {}) {
  return {
    position: Number(ingredient.position || 0),
    sourceText: String(ingredient.raw_name || ingredient.sourceText || ''),
    amountText: String(ingredient.amount_raw || ingredient.amountText || ''),
    mappingStatus: String(ingredient.mapping_status || ingredient.mappingStatus || 'unmatched'),
    components: Array.isArray(ingredient.components)
      ? ingredient.components.map(normalizeComponent)
      : []
  }
}

function normalizeRecipe(recipe = {}) {
  return {
    id: String(recipe.id || recipe._id || ''),
    title: String(recipe.title || ''),
    hasIngredientPreview: Number(recipe.ingredientPreviewVersion) === 1,
    ingredients: Array.isArray(recipe.ingredients)
      ? recipe.ingredients
        .slice()
        .sort((left, right) => Number(left.position || 0) - Number(right.position || 0))
        .map(normalizeIngredient)
      : []
  }
}

function normalizeRecipeDetail(result = {}) {
  const normalized = normalizeHumanRecipeDetail(result)
  const rawIngredients = Array.isArray(result.recipe && result.recipe.ingredients)
    ? result.recipe.ingredients
    : []
  return {
    ...normalized,
    ingredients: normalized.ingredients.map((ingredient) => {
      const rawIngredient = rawIngredients.find((item) => (
        Number(item.position || 0) === ingredient.position
      ))
      return {
        ...ingredient,
        mappingStatus: String(
          (rawIngredient && (rawIngredient.mapping_status || rawIngredient.mappingStatus))
          || 'unmatched'
        )
      }
    })
  }
}

async function searchHumanRecipes(options = {}) {
  const result = await adapter.searchHumanRecipes(options)
  return {
    ...result,
    items: Array.isArray(result.items) ? result.items.map(normalizeRecipe) : []
  }
}

async function getHumanRecipe(recipeId) {
  const result = await adapter.getHumanRecipe(recipeId)
  return normalizeRecipeDetail(result)
}

function __setAdapterForTest(nextAdapter) {
  adapter = nextAdapter
}

module.exports = {
  searchHumanRecipes,
  getHumanRecipe,
  normalizeRecipe,
  normalizeRecipeDetail,
  __setAdapterForTest
}
