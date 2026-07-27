const storage = require('../utils/storage')

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
  if (!isNonEmptyString(value.humanMenuId) || !Number.isInteger(value.ingredientPosition)) {
    throw new Error('共享本餐食材来源字段无效')
  }
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
  if (component.policyStatus === 'blocked') throw new Error('该来源食材不可加入共享本餐')
  return component
}

function buildIngredients(humanMenus, sourceIngredientSelections) {
  const byIdentity = new Map()
  sourceIngredientSelections.forEach((selection) => {
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

function createDraftFromMenus({
  id,
  dog,
  humanMenus = [],
  sourceIngredientSelections = [],
  latestAssessment = null,
  saveIntent = 'editing',
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
  if (!isNonEmptyString(draft.saveIntent)) throw new Error('共享本餐草稿保存意图无效')
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
      JSON.stringify(ingredient.dataVersions) !== JSON.stringify(draft.dataVersions)
    ))
  ) throw new Error('共享本餐草稿版本与食材版本不一致')

  const trustedIngredients = buildIngredients(
    draft.humanMenus,
    draft.sourceIngredientSelections
  )
  if (trustedIngredients.length !== draft.ingredients.length) {
    throw new Error('共享本餐草稿食材与来源选择不一致')
  }
  trustedIngredients.forEach((trusted) => {
    const saved = draft.ingredients.find((item) => (
      item.conceptId === trusted.conceptId && item.variantId === trusted.variantId
    ))
    if (!saved) throw new Error('共享本餐草稿食材与来源选择不一致')
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
        dataVersions: null
      }
  saveDraft(draft)
  return draft
}

module.exports = {
  SHARED_MEAL_DRAFT_SCHEMA_VERSION,
  SHARED_MEAL_DRAFT_STORAGE_KEY,
  validateSharedMealIngredient,
  validateDraft,
  createDraftFromMenus,
  saveDraft,
  restoreDraft,
  resetDraft,
  refreshDraftDog,
  saveDogSelectionDraft
}
