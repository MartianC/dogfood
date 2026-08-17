const env = require('../../../config/env')
const {
  canAddIngredient
} = require('./ingredientOperationRules')
const {
  normalizeHumanRecipeDetail
} = require('./sharedMealDraftService')
const { applyDogAllergyPolicy } = require('../../../services/dogIngredientPolicy')

let adapter = env.useCloudBase
  ? require('../../../services/adapters/cloudbase')
  : require('../../../services/adapters/mock')

function normalizeComponent(component = {}, dog = {}) {
  const projected = applyDogAllergyPolicy(component, dog)
  const policyStatus = String(projected.policy_status || projected.policyStatus || 'unknown')
  const canSelect = canAddIngredient(policyStatus)
  return {
    conceptId: String(projected.concept_id || projected.conceptId || ''),
    variantId: String(projected.variant_id || projected.variantId || ''),
    foodId: String(projected.food_id || projected.foodId || ''),
    displayName: String(
      projected.canonical_name_zh
      || projected.display_name_zh
      || projected.displayName
      || ''
    ),
    policyStatus,
    canSelect,
    selected: false,
    blockedReason: canSelect ? '' : String(
      projected.blockedReason || '当前策略不允许加入狗饭。'
    )
  }
}

function normalizeIngredient(ingredient = {}, dog = {}) {
  return {
    position: Number(ingredient.position || 0),
    sourceText: String(ingredient.raw_name || ingredient.sourceText || ''),
    amountText: String(ingredient.amount_raw || ingredient.amountText || ''),
    mappingStatus: String(ingredient.mapping_status || ingredient.mappingStatus || 'unmatched'),
    components: Array.isArray(ingredient.components)
      ? ingredient.components.map((component) => normalizeComponent(component, dog))
      : []
  }
}

function normalizeRecipe(recipe = {}, dog = {}) {
  return {
    id: String(recipe.id || recipe._id || ''),
    title: String(recipe.title || ''),
    hasIngredientPreview: Number(recipe.ingredientPreviewVersion) === 1,
    ingredients: Array.isArray(recipe.ingredients)
      ? recipe.ingredients
        .slice()
        .sort((left, right) => Number(left.position || 0) - Number(right.position || 0))
        .map((ingredient) => normalizeIngredient(ingredient, dog))
      : []
  }
}

function normalizeRecipeDetail(result = {}, dog = {}) {
  const projectedResult = {
    ...result,
    recipe: {
      ...(result.recipe || {}),
      ingredients: Array.isArray(result.recipe && result.recipe.ingredients)
        ? result.recipe.ingredients.map((ingredient) => ({
          ...ingredient,
          components: Array.isArray(ingredient.components)
            ? ingredient.components.map((component) => applyDogAllergyPolicy(component, dog))
            : []
        }))
        : []
    }
  }
  const normalized = normalizeHumanRecipeDetail(projectedResult)
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
    items: Array.isArray(result.items)
      ? result.items.map((recipe) => normalizeRecipe(recipe, options.dog))
      : []
  }
}

async function getHumanRecipe(recipeId, dog = {}) {
  const result = await adapter.getHumanRecipe(recipeId)
  return normalizeRecipeDetail(result, dog)
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
