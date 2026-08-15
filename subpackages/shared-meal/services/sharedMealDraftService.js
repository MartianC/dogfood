// 此文件由 scripts/sync-subpackage-services.js 自动生成，请修改 shared-src 后重新同步。
const storage = require('../../../utils/storage')
const {
  canAddIngredient,
  canAutoIncludeIngredient
} = require('./ingredientOperationRules')
const {
  INGREDIENT_CONTRACT_VERSION,
  canonicalizeIngredients,
  fingerprint
} = require('./sharedMealContract')

const SHARED_MEAL_DRAFT_SCHEMA_VERSION = 1
const SHARED_MEAL_INGREDIENT_SCHEMA_VERSION = 1
const SHARED_MEAL_DRAFT_STORAGE_KEY = 'sharedMealDraft/v1'
const POLICY_STATUSES = new Set(['allowed', 'conditional', 'unknown', 'blocked'])
const INGREDIENT_KEYS = [
  'schemaVersion',
  'ingredientId',
  'foodId',
  'conceptId',
  'variantId',
  'name',
  'category',
  'policyStatus',
  'perMealAmountGram',
  'sourceRefs',
  'dataVersions'
]
const DATA_VERSION_KEYS = [
  'runtimeReleaseId',
  'recipeVersion',
  'mappingVersion',
  'catalogVersion',
  'policyVersion',
  'nutritionSourceReleaseId'
]
const SHARED_RELEASE_VERSION_KEYS = DATA_VERSION_KEYS.filter((key) => (
  key !== 'nutritionSourceReleaseId'
))

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const actual = Object.keys(value).sort()
  const expected = expectedKeys.slice().sort()
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0
}

function validateDataVersions(value) {
  if (!hasExactKeys(value, DATA_VERSION_KEYS)) {
    throw new Error('共享本餐食材版本字段不完整')
  }
  const nullableVersions = ['recipeVersion', 'mappingVersion']
  DATA_VERSION_KEYS.forEach((key) => {
    if (nullableVersions.includes(key) && value[key] === null) return
    if (!isNonEmptyString(value[key])) throw new Error('共享本餐食材版本字段无效')
  })
  return value
}

function validateSourceRef(value) {
  if (!hasExactKeys(value, ['humanMenuId', 'ingredientPosition'])) {
    throw new Error('共享本餐食材来源字段无效')
  }
  if (
    !isNonEmptyString(value.humanMenuId)
    || !Number.isInteger(value.ingredientPosition)
    || value.ingredientPosition < 0
  ) {
    throw new Error('共享本餐食材来源字段无效')
  }
}

function validateSourceSelection(value) {
  if (!hasExactKeys(value, [
    'humanMenuId',
    'ingredientPosition',
    'conceptId',
    'variantId'
  ])) throw new Error('共享本餐来源选择字段无效')
  if (
    !isNonEmptyString(value.humanMenuId)
    || !Number.isInteger(value.ingredientPosition)
    || value.ingredientPosition < 0
    || !isNonEmptyString(value.conceptId)
    || !isNonEmptyString(value.variantId)
  ) throw new Error('共享本餐来源选择字段无效')
}

function validateSharedMealIngredient(ingredient) {
  if (!hasExactKeys(ingredient, INGREDIENT_KEYS)) throw new Error('共享本餐食材字段无效')
  if (ingredient.schemaVersion !== SHARED_MEAL_INGREDIENT_SCHEMA_VERSION) {
    throw new Error('共享本餐食材 schemaVersion 无效')
  }
  ;['ingredientId', 'foodId', 'conceptId', 'variantId', 'name', 'category'].forEach((key) => {
    if (!isNonEmptyString(ingredient[key])) throw new Error('共享本餐食材身份字段无效')
  })
  if (ingredient.ingredientId !== ingredient.foodId) {
    throw new Error('共享本餐食材 ingredientId 必须等于 foodId')
  }
  if (!POLICY_STATUSES.has(ingredient.policyStatus)) {
    throw new Error('共享本餐食材策略字段无效')
  }
  if (
    ingredient.perMealAmountGram !== null
    && (!Number.isFinite(ingredient.perMealAmountGram) || ingredient.perMealAmountGram < 0)
  ) throw new Error('共享本餐食材克重字段无效')
  if (!Array.isArray(ingredient.sourceRefs)) throw new Error('共享本餐食材来源字段无效')
  ingredient.sourceRefs.forEach(validateSourceRef)
  validateDataVersions(ingredient.dataVersions)
  return ingredient
}

function findSelectedComponent(humanMenus, selection) {
  const menu = humanMenus.find((item) => item && item.id === selection.humanMenuId)
  const source = menu && Array.isArray(menu.ingredients)
    ? menu.ingredients.find((item) => item.position === selection.ingredientPosition)
    : null
  const component = source && Array.isArray(source.components)
    ? source.components.find((item) => (
      item.conceptId === selection.conceptId
      && item.variantId === selection.variantId
    ))
    : null
  if (!component) throw new Error('来源选择无效，无法建立共享本餐食材')
  if (!canAddIngredient(component)) throw new Error('该来源食材不可加入共享本餐')
  return component
}

function buildIngredients(humanMenus, sourceIngredientSelections) {
  const byIdentity = new Map()
  sourceIngredientSelections.forEach((selection) => {
    validateSourceSelection(selection)
    const component = findSelectedComponent(humanMenus, selection)
    validateDataVersions(component.dataVersions)
    const identity = `${component.conceptId}\u0000${component.variantId}`
    const sourceRef = {
      humanMenuId: selection.humanMenuId,
      ingredientPosition: selection.ingredientPosition
    }
    const existed = byIdentity.get(identity)
    if (existed) {
      if (existed.foodId !== component.foodId) {
        throw new Error('同一目录食材身份对应了不同的营养查询键')
      }
      if (!existed.sourceRefs.some((item) => (
        item.humanMenuId === sourceRef.humanMenuId
        && item.ingredientPosition === sourceRef.ingredientPosition
      ))) existed.sourceRefs.push(sourceRef)
      return
    }
    byIdentity.set(identity, {
      schemaVersion: SHARED_MEAL_INGREDIENT_SCHEMA_VERSION,
      ingredientId: component.foodId,
      foodId: component.foodId,
      conceptId: component.conceptId,
      variantId: component.variantId,
      name: component.displayName,
      category: component.category,
      policyStatus: component.policyStatus,
      perMealAmountGram: null,
      sourceRefs: [sourceRef],
      dataVersions: { ...component.dataVersions }
    })
  })
  return [...byIdentity.values()].map(validateSharedMealIngredient)
}

function hasSameSourceSelection(left, right) {
  return left.humanMenuId === right.humanMenuId
    && left.ingredientPosition === right.ingredientPosition
    && left.conceptId === right.conceptId
    && left.variantId === right.variantId
}

function ingredientIdentity(ingredient) {
  return `${ingredient.conceptId}\u0000${ingredient.variantId}`
}

function rebuildIngredientsForSourceSelections(draft, sourceIngredientSelections) {
  const sourceIngredients = buildIngredients(draft.humanMenus, sourceIngredientSelections)
  const sourceByIdentity = new Map(sourceIngredients.map((ingredient) => (
    [ingredientIdentity(ingredient), ingredient]
  )))
  const ingredients = []

  draft.ingredients.forEach((ingredient) => {
    const identity = ingredientIdentity(ingredient)
    const sourceIngredient = sourceByIdentity.get(identity)
    if (sourceIngredient) {
      ingredients.push({
        ...sourceIngredient,
        perMealAmountGram: ingredient.perMealAmountGram
      })
      sourceByIdentity.delete(identity)
      return
    }
    if (ingredient.sourceRefs.length === 0) ingredients.push({ ...ingredient })
  })

  sourceByIdentity.forEach((ingredient) => ingredients.push(ingredient))
  return ingredients
}

function transitionSourceIngredient(draft, selection, shouldInclude) {
  validateDraft(draft)
  validateSourceSelection(selection)
  const isIncluded = draft.sourceIngredientSelections.some((item) => (
    hasSameSourceSelection(item, selection)
  ))

  if (shouldInclude) {
    findSelectedComponent(draft.humanMenus, selection)
    if (isIncluded) return draft
  } else if (!isIncluded) {
    return draft
  }

  const sourceIngredientSelections = shouldInclude
    ? draft.sourceIngredientSelections.concat({ ...selection })
    : draft.sourceIngredientSelections.filter((item) => (
        !hasSameSourceSelection(item, selection)
      ))
  const next = {
    ...draft,
    sourceIngredientSelections,
    ingredients: rebuildIngredientsForSourceSelections(draft, sourceIngredientSelections),
    latestAssessment: null,
    saveIntent: 'editing'
  }
  return validateDraft(next)
}

function includeSourceIngredient(draft, selection) {
  return transitionSourceIngredient(draft, selection, true)
}

function removeSourceIngredient(draft, selection) {
  return transitionSourceIngredient(draft, selection, false)
}

// 重新加入与首次加入共享同一安全规则，保留独立业务命名供页面表达用户意图。
function reincludeSourceIngredient(draft, selection) {
  return transitionSourceIngredient(draft, selection, true)
}

function hasSameSharedReleaseVersions(left, right) {
  return SHARED_RELEASE_VERSION_KEYS.every((key) => left[key] === right[key])
}

function componentDataVersions(recipe, component, recipeVersion) {
  return {
    runtimeReleaseId: String(recipe.release_id || recipe.runtimeReleaseId || recipeVersion || ''),
    recipeVersion: component.recipe_version || recipe.recipe_version || recipeVersion || null,
    mappingVersion: component.mapping_version || recipe.mapping_version || null,
    catalogVersion: String(
      component.catalog_version || recipe.compatible_catalog_version || ''
    ),
    policyVersion: String(
      component.policy_version || recipe.compatible_policy_version || ''
    ),
    nutritionSourceReleaseId: String(
      component.food_source_release_id
      || component.nutrition_source_release_id
      || recipe.base_release_id
      || recipe.release_id
      || ''
    )
  }
}

function normalizeHumanRecipeDetail(result = {}) {
  const recipe = result.recipe || {}
  return {
    id: String(recipe.id || recipe._id || ''),
    title: String(recipe.title || ''),
    ingredients: (Array.isArray(recipe.ingredients) ? recipe.ingredients : [])
      .slice()
      .sort((left, right) => Number(left.position || 0) - Number(right.position || 0))
      .map((ingredient) => ({
        position: Number(ingredient.position || 0),
        sourceText: String(ingredient.raw_name || ''),
        amountText: String(ingredient.amount_raw || ''),
        components: (Array.isArray(ingredient.components) ? ingredient.components : [])
          .map((component) => {
            const policyStatus = String(component.policy_status || 'unknown')
            const canAutoInclude = canAutoIncludeIngredient(policyStatus)
            return {
              conceptId: String(component.concept_id || ''),
              variantId: String(component.variant_id || ''),
              foodId: String(component.food_id || ''),
              displayName: String(
                component.canonical_name_zh || component.display_name_zh || ''
              ),
              category: String(component.category_code || 'other'),
              preparationState: String(component.preparation_state || ''),
              policyStatus,
              blockedReason: canAutoInclude ? '' : String(
                component.blockedReason || '当前策略不允许加入狗饭。'
              ),
              canSelect: canAutoInclude,
              selected: canAutoInclude,
              dataVersions: componentDataVersions(recipe, component, result.recipeVersion)
            }
          })
      }))
  }
}

function createDraftFromMenus({
  id,
  dog,
  humanMenus = [],
  sourceIngredientSelections = [],
  latestAssessment = null,
  saveIntent = 'editing',
  mealTime = new Date().toISOString(),
  note = '',
  photoFileIds = [],
  dataVersions
} = {}) {
  const draft = {
    schemaVersion: SHARED_MEAL_DRAFT_SCHEMA_VERSION,
    id,
    dog,
    humanMenus,
    sourceIngredientSelections,
    ingredients: buildIngredients(humanMenus, sourceIngredientSelections),
    latestAssessment,
    saveIntent,
    mealTime,
    note,
    photoFileIds,
    dataVersions
  }
  validateDraft(draft)
  return draft
}

function validateDraft(draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    throw new Error('共享本餐草稿格式无效')
  }
  if (draft.schemaVersion !== SHARED_MEAL_DRAFT_SCHEMA_VERSION) {
    throw new Error('共享本餐草稿 schemaVersion 无效')
  }
  if (!isNonEmptyString(draft.id)) throw new Error('共享本餐草稿 ID 无效')
  if (!draft.dog || !isNonEmptyString(draft.dog.id)) throw new Error('共享本餐草稿狗狗无效')
  if (!Array.isArray(draft.humanMenus)) throw new Error('共享本餐草稿人饭菜单无效')
  if (!Array.isArray(draft.sourceIngredientSelections)) {
    throw new Error('共享本餐草稿来源选择无效')
  }
  if (!Array.isArray(draft.ingredients)) throw new Error('共享本餐草稿食材无效')
  if (
    draft.saveIntent !== null
    && !isNonEmptyString(draft.saveIntent)
    && (!draft.saveIntent || typeof draft.saveIntent !== 'object' || Array.isArray(draft.saveIntent))
  ) throw new Error('共享本餐草稿保存意图无效')
  if (
    draft.latestAssessment !== null
    && (!draft.latestAssessment || typeof draft.latestAssessment !== 'object')
  ) throw new Error('共享本餐草稿评估无效')
  if (draft.dataVersions === null) {
    if (draft.humanMenus.length || draft.ingredients.length) {
      throw new Error('共享本餐草稿版本字段不完整')
    }
  } else {
    validateDataVersions(draft.dataVersions)
  }
  draft.ingredients.forEach(validateSharedMealIngredient)
  if (
    draft.dataVersions
    && draft.ingredients.some((ingredient) => (
      !hasSameSharedReleaseVersions(ingredient.dataVersions, draft.dataVersions)
    ))
  ) throw new Error('共享本餐草稿版本与食材版本不一致')
  return draft
}

function validateDraftAgainstTrustedMenus(draft, trustedHumanMenus) {
  validateDraft(draft)
  if (!Array.isArray(trustedHumanMenus)) {
    throw new Error('共享本餐可信菜谱详情无效')
  }
  const expectedMenuIds = draft.humanMenus.map((menu) => menu && menu.id)
  const trustedMenuIds = trustedHumanMenus.map((menu) => menu && menu.id)
  if (JSON.stringify(expectedMenuIds) !== JSON.stringify(trustedMenuIds)) {
    throw new Error('共享本餐可信菜谱详情不一致')
  }
  const trustedIngredients = buildIngredients(trustedHumanMenus, draft.sourceIngredientSelections)
  draft.ingredients.filter((item) => item.sourceRefs.length > 0).forEach((saved) => {
    const trusted = trustedIngredients.find((item) => (
      item.conceptId === saved.conceptId && item.variantId === saved.variantId
    ))
    if (!trusted) throw new Error('共享本餐草稿食材与来源选择不一致')
    const stableFields = [
      'ingredientId', 'foodId', 'name', 'category', 'policyStatus'
    ]
    if (stableFields.some((key) => saved[key] !== trusted[key])) {
      throw new Error('共享本餐草稿食材与来源选择不一致')
    }
    if (JSON.stringify(saved.sourceRefs) !== JSON.stringify(trusted.sourceRefs)) {
      throw new Error('共享本餐草稿来源引用不一致')
    }
    if (JSON.stringify(saved.dataVersions) !== JSON.stringify(trusted.dataVersions)) {
      throw new Error('共享本餐草稿版本与来源不一致')
    }
  })
  return draft
}

function saveDraft(draft) {
  validateDraft(draft)
  storage.setSync(SHARED_MEAL_DRAFT_STORAGE_KEY, draft)
  return draft
}

function restoreDraft(expectedId) {
  const draft = storage.getSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
  if (!draft) return { status: 'empty', draft: null }
  if (draft.schemaVersion !== SHARED_MEAL_DRAFT_SCHEMA_VERSION) {
    return { status: 'invalid', reason: 'unsupported_schema_version', draft: null }
  }
  if (expectedId && draft.id !== expectedId) {
    return { status: 'invalid', reason: 'draft_id_mismatch', draft: null }
  }
  try {
    validateDraft(draft)
    return { status: 'restored', draft }
  } catch (error) {
    return { status: 'invalid', reason: 'corrupt_draft', draft: null }
  }
}

function getDraftRecoveryDecision(expectedId) {
  const restored = restoreDraft(expectedId)
  if (restored.status === 'empty') {
    return { status: 'none', draft: null }
  }
  if (restored.status === 'invalid') {
    return {
      status: 'invalid',
      reason: restored.reason,
      draft: null
    }
  }
  if (restored.draft.humanMenus.length === 0) {
    return { status: 'none', draft: null }
  }
  return {
    status: 'resumable',
    draft: restored.draft
  }
}

function continueDraftRecovery(expectedId) {
  const decision = getDraftRecoveryDecision(expectedId)
  return decision.status === 'resumable' ? decision.draft : null
}

function restartDraftRecovery(expectedId) {
  return resetDraft(expectedId)
}

async function restoreTrustedDraft(expectedId, loadTrustedHumanMenu) {
  const restored = restoreDraft(expectedId)
  if (restored.status !== 'restored' || restored.draft.humanMenus.length === 0) {
    return restored
  }
  if (typeof loadTrustedHumanMenu !== 'function') {
    return { status: 'invalid', reason: 'untrusted_recipe_detail', draft: null }
  }
  try {
    const trustedHumanMenus = await Promise.all(
      restored.draft.humanMenus.map((menu) => loadTrustedHumanMenu(menu.id))
    )
    validateDraftAgainstTrustedMenus(restored.draft, trustedHumanMenus)
    return {
      status: 'restored',
      draft: { ...restored.draft, humanMenus: trustedHumanMenus }
    }
  } catch (error) {
    return { status: 'invalid', reason: 'untrusted_recipe_detail', draft: null }
  }
}

function resetDraft(expectedId) {
  const draft = storage.getSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
  if (!draft || (expectedId && draft.id !== expectedId)) return false
  storage.removeSync(SHARED_MEAL_DRAFT_STORAGE_KEY)
  return true
}

function refreshDraftDog(dog) {
  const restored = restoreDraft()
  if (restored.status !== 'restored' || !dog || restored.draft.dog.id !== dog.id) {
    return false
  }
  saveDraft({ ...restored.draft, dog })
  return true
}

function saveDogSelectionDraft(dog, id = `shared-meal-${Date.now()}`) {
  const restored = restoreDraft(id)
  const draft = restored.status === 'restored'
    ? { ...restored.draft, dog }
    : {
        schemaVersion: SHARED_MEAL_DRAFT_SCHEMA_VERSION,
        id,
        dog,
        humanMenus: [],
        sourceIngredientSelections: [],
        ingredients: [],
        latestAssessment: null,
        saveIntent: 'editing',
        mealTime: new Date().toISOString(),
        note: '',
        photoFileIds: [],
        dataVersions: null
      }
  saveDraft(draft)
  return draft
}

function updateDraftIngredients(draftId, ingredients) {
  const restored = restoreDraft(draftId)
  if (restored.status !== 'restored') throw new Error('未找到当前共享本餐草稿')
  const next = ingredients.map((ingredient) => validateSharedMealIngredient({ ...ingredient }))
  if (next.some((ingredient) => !canAddIngredient(ingredient))) {
    throw new Error('被阻止的食材不可加入共享本餐')
  }
  return saveDraft({
    ...restored.draft,
    ingredients: next,
    latestAssessment: null,
    saveIntent: 'editing'
  })
}

function updateDraftAssessment(draftId, assessment) {
  const restored = restoreDraft(draftId)
  if (restored.status !== 'restored') throw new Error('未找到当前共享本餐草稿')
  return saveDraft({ ...restored.draft, latestAssessment: assessment, saveIntent: 'editing' })
}

function buildAssessmentSnapshot(draft, assessment) {
  const density = assessment && assessment.nutritionDensity || {}
  const standards = Array.isArray(density.standards) ? density.standards : []
  const highestHigh = standards.some((standard) => (standard.highItems || []).length > 0)
  const energyMissing = Boolean(
    !assessment
    || !assessment.energy
    || !assessment.energy.available
    || (assessment.energy.missingIngredients || []).length
  )
  const snapshot = {
    schemaVersion: 1,
    ingredientContractVersion: INGREDIENT_CONTRACT_VERSION,
    energy: assessment && assessment.energy || null,
    nutritionDensity: density,
    dataCoverage: {
      energyComplete: Boolean(assessment && assessment.energy && assessment.energy.available),
      unavailableNutrientCount: Number(density.counts && density.counts.unavailable || 0)
    },
    warningLevel: highestHigh || energyMissing ? 'confirm' : 'normal',
    inputFingerprint: fingerprint(canonicalizeIngredients(draft.ingredients)),
    algorithmVersions: { mealAssessment: 'meal-assessment/v1' },
    standardVersions: standards.map((standard) => ({
      key: String(standard.key || ''),
      code: String(standard.code || ''),
      profileCode: String(standard.profileCode || '')
    })),
    dataVersions: { ...draft.dataVersions }
  }
  return JSON.parse(JSON.stringify(snapshot))
}

function buildSaveIntent(draftId, assessment) {
  const restored = restoreDraft(draftId)
  if (restored.status !== 'restored') throw new Error('未找到当前共享本餐草稿')
  const draft = restored.draft
  if (!draft.ingredients.length || draft.ingredients.some((item) => !(item.perMealAmountGram > 0))) {
    throw new Error('请先填写全部食材克重')
  }
  const assessmentSnapshot = buildAssessmentSnapshot(draft, assessment)
  const candidate = {
    targetDogId: draft.dog.id,
    mealTime: draft.mealTime,
    dogSnapshot: draft.dog,
    humanMenu: draft.humanMenus,
    sourceIngredientSelections: draft.sourceIngredientSelections,
    dogMealItems: canonicalizeIngredients(draft.ingredients),
    assessment: assessmentSnapshot,
    note: String(draft.note || ''),
    photoFileIds: Array.isArray(draft.photoFileIds) ? draft.photoFileIds.slice() : [],
    versions: {
      ...draft.dataVersions,
      assessmentAlgorithmVersion: 'meal-assessment/v1',
      standardVersions: assessmentSnapshot.standardVersions
    }
  }
  const requestFingerprint = fingerprint(candidate)
  const saveIntent = {
    schemaVersion: 1,
    idempotencyKey: `${draft.id}:${requestFingerprint}`,
    requestFingerprint,
    warningConfirmation: assessmentSnapshot.warningLevel === 'confirm' ? 'required' : 'not_required',
    draftVersion: draft.schemaVersion,
    candidate
  }
  saveDraft({ ...draft, latestAssessment: assessmentSnapshot, saveIntent })
  return saveIntent
}

function confirmSaveIntent(draftId) {
  const restored = restoreDraft(draftId)
  if (restored.status !== 'restored' || !restored.draft.saveIntent || typeof restored.draft.saveIntent !== 'object') {
    throw new Error('未找到待确认的保存意图')
  }
  const saveIntent = { ...restored.draft.saveIntent, warningConfirmation: 'confirmed' }
  saveDraft({ ...restored.draft, saveIntent })
  return saveIntent
}

module.exports = {
  SHARED_MEAL_DRAFT_SCHEMA_VERSION,
  SHARED_MEAL_DRAFT_STORAGE_KEY,
  validateSharedMealIngredient,
  validateDraft,
  validateDraftAgainstTrustedMenus,
  normalizeHumanRecipeDetail,
  createDraftFromMenus,
  includeSourceIngredient,
  removeSourceIngredient,
  reincludeSourceIngredient,
  saveDraft,
  restoreDraft,
  getDraftRecoveryDecision,
  continueDraftRecovery,
  restartDraftRecovery,
  restoreTrustedDraft,
  resetDraft,
  refreshDraftDog,
  saveDogSelectionDraft,
  updateDraftIngredients,
  updateDraftAssessment,
  buildAssessmentSnapshot,
  buildSaveIntent,
  confirmSaveIntent
}
