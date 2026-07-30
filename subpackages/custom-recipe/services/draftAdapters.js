const customRecipeService = require('./customRecipeService')
const sharedMealDraftService = require('./sharedMealDraftService')

const DRAFT_KINDS = new Set(['customRecipe', 'sharedMeal'])

function assertKind(draftKind) {
  if (!DRAFT_KINDS.has(draftKind)) throw new Error('不支持的草稿类型')
}

function getDraft(draftKind, draftId) {
  assertKind(draftKind)
  if (draftKind === 'customRecipe') {
    const draft = customRecipeService.getDraft()
    return draft && (!draftId || draft.id === draftId) ? draft : null
  }
  const restored = sharedMealDraftService.restoreDraft(draftId)
  return restored.status === 'restored' ? restored.draft : null
}

function saveIngredients(draftKind, draftId, ingredients) {
  const draft = getDraft(draftKind, draftId)
  if (!draft) throw new Error('未找到当前草稿')
  if (draftKind === 'customRecipe') {
    return customRecipeService.saveDraft({ ...draft, ingredients })
  }
  return sharedMealDraftService.updateDraftIngredients(draftId, ingredients)
}

function saveAssessment(draftKind, draftId, assessment) {
  const draft = getDraft(draftKind, draftId)
  if (!draft) throw new Error('未找到当前草稿')
  if (draftKind === 'customRecipe') {
    return customRecipeService.saveDraft({ ...draft, mealAssessment: assessment })
  }
  return sharedMealDraftService.updateDraftAssessment(draftId, assessment)
}

module.exports = { getDraft, saveIngredients, saveAssessment }
