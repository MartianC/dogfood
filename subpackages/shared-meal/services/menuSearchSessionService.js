const MENU_SEARCH_SESSION_VERSION = 1

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeCursor(value) {
  const cursor = normalizeText(value)
  return cursor || null
}

function uniqueIds(values) {
  const seen = new Set()
  return (Array.isArray(values) ? values : []).reduce((ids, value) => {
    const id = normalizeText(value)
    if (!id || seen.has(id)) return ids
    seen.add(id)
    ids.push(id)
    return ids
  }, [])
}

function normalizeRecipes(values) {
  const seen = new Set()
  return (Array.isArray(values) ? values : []).reduce((recipes, recipe) => {
    if (!recipe || typeof recipe !== 'object') return recipes
    const id = normalizeText(recipe.id || recipe._id)
    if (!id || seen.has(id)) return recipes
    seen.add(id)
    recipes.push({ ...recipe, id })
    return recipes
  }, [])
}

function createMenuSearchSession(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const recipes = normalizeRecipes(source.recipes)
  const recipeIds = new Set(recipes.map((recipe) => recipe.id))
  const expandedRecipeId = normalizeText(source.expandedRecipeId)

  return {
    version: MENU_SEARCH_SESSION_VERSION,
    keyword: normalizeText(source.keyword),
    recipes,
    nextCursor: normalizeCursor(source.nextCursor),
    expandedRecipeId: recipeIds.has(expandedRecipeId) ? expandedRecipeId : null,
    selectedRecipeIds: uniqueIds(source.selectedRecipeIds)
  }
}

function changeMenuSearchKeyword(session, keyword) {
  const current = createMenuSearchSession(session)
  const nextKeyword = normalizeText(keyword)
  if (current.keyword === nextKeyword) return current

  return {
    ...current,
    keyword: nextKeyword,
    recipes: [],
    nextCursor: null,
    expandedRecipeId: null
  }
}

function mergeMenuSearchPage(session, page = {}) {
  const current = createMenuSearchSession(session)
  const incomingRecipes = normalizeRecipes(page.items)
  const seen = new Set(current.recipes.map((recipe) => recipe.id))
  const additions = incomingRecipes.filter((recipe) => {
    if (seen.has(recipe.id)) return false
    seen.add(recipe.id)
    return true
  })

  return {
    ...current,
    recipes: current.recipes.concat(additions),
    nextCursor: normalizeCursor(page.nextCursor)
  }
}

function selectMenuRecipe(session, recipeId) {
  const current = createMenuSearchSession(session)
  const id = normalizeText(recipeId)
  if (!id || current.selectedRecipeIds.includes(id)) return current
  return {
    ...current,
    selectedRecipeIds: current.selectedRecipeIds.concat(id)
  }
}

function deselectMenuRecipe(session, recipeId) {
  const current = createMenuSearchSession(session)
  const id = normalizeText(recipeId)
  if (!id || !current.selectedRecipeIds.includes(id)) return current
  return {
    ...current,
    selectedRecipeIds: current.selectedRecipeIds.filter((value) => value !== id)
  }
}

function toggleExpandedMenuRecipe(session, recipeId) {
  const current = createMenuSearchSession(session)
  const id = normalizeText(recipeId)
  if (!id || !current.recipes.some((recipe) => recipe.id === id)) return current
  return {
    ...current,
    expandedRecipeId: current.expandedRecipeId === id ? null : id
  }
}

function canConfirmMenuSelection(session) {
  return createMenuSearchSession(session).selectedRecipeIds.length > 0
}

function serializeMenuSearchSession(session) {
  return JSON.stringify(createMenuSearchSession(session))
}

function restoreMenuSearchSession(value) {
  try {
    const source = typeof value === 'string' ? JSON.parse(value) : value
    if (!source || source.version !== MENU_SEARCH_SESSION_VERSION) {
      return createMenuSearchSession()
    }
    return createMenuSearchSession(source)
  } catch (error) {
    return createMenuSearchSession()
  }
}

module.exports = {
  MENU_SEARCH_SESSION_VERSION,
  createMenuSearchSession,
  changeMenuSearchKeyword,
  mergeMenuSearchPage,
  selectMenuRecipe,
  deselectMenuRecipe,
  toggleExpandedMenuRecipe,
  canConfirmMenuSelection,
  serializeMenuSearchSession,
  restoreMenuSearchSession
}
