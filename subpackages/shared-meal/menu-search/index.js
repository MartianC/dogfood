const humanRecipeService = require('../services/humanRecipeService')
const {
  canSearchIngredient,
  canAutoIncludeIngredient
} = require('../../../utils/ingredientOperationRules')
const {
  restoreDraft,
  createDraftFromMenus,
  saveDraft
} = require('../../../services/sharedMealDraftService')
const {
  MENU_SEARCH_SESSION_VERSION,
  createMenuSearchSession,
  mergeMenuSearchPage,
  selectMenuRecipe,
  deselectMenuRecipe,
  toggleExpandedMenuRecipe,
  serializeMenuSearchSession,
  restoreMenuSearchSession
} = require('../services/menuSearchSessionService')

const SEARCH_PAGE_LIMIT = 20
const MENU_SEARCH_STATE_VERSION = 1

function prepareRecipeForSearchDisplay(recipe = {}) {
  return {
    ...recipe,
    ingredients: Array.isArray(recipe.ingredients)
      ? recipe.ingredients.map((ingredient) => ({
        ...ingredient,
        components: Array.isArray(ingredient.components)
          ? ingredient.components.map((component) => ({
            ...component,
            canSelect: canSearchIngredient(component)
          }))
          : []
      }))
      : []
  }
}

function uniqueNames(values) {
  return Array.from(new Set(values.filter(Boolean)))
}

function buildRecipeDetailDisplay(recipe = {}) {
  const prepared = prepareRecipeForSearchDisplay(recipe)
  const allowedNames = []
  const blockedNames = []
  let allowedCount = 0
  let blockedCount = 0

  prepared.ingredients.forEach((ingredient) => {
    const components = Array.isArray(ingredient.components) ? ingredient.components : []
    const hasAllowed = components.some((component) => component.canSelect)
    const hasBlocked = components.some((component) => !component.canSelect)
    if (hasAllowed) allowedCount += 1
    if (hasBlocked) blockedCount += 1
    components.forEach((component) => {
      const name = String(component.displayName || '').trim()
      if (component.canSelect) allowedNames.push(name)
      else blockedNames.push(name)
    })
  })

  const summaryParts = [`${prepared.ingredients.length} 项原料`]
  if (allowedCount) summaryParts.push(`${allowedCount} 项可共用`)
  if (blockedCount) summaryParts.push(`${blockedCount} 项需避开`)

  return {
    ...prepared,
    mappingSummary: summaryParts.join(' · '),
    allowedIngredientText: uniqueNames(allowedNames).join('、') || '暂无',
    blockedIngredientText: uniqueNames(blockedNames).join('、') || '暂无'
  }
}

function buildRecipeViewModels(session, options = {}) {
  const details = options.details || {}
  const loadingIds = options.loadingIds || new Set()
  const errorIds = options.errorIds || new Set()
  return session.recipes.map((recipe) => {
    const detail = details[recipe.id]
      || (recipe.hasIngredientPreview ? buildRecipeDetailDisplay(recipe) : null)
    const ingredientCount = Array.isArray(recipe.ingredients) ? recipe.ingredients.length : 0
    return {
      ...recipe,
      isSelected: session.selectedRecipeIds.includes(recipe.id),
      isExpanded: session.expandedRecipeId === recipe.id,
      detailLoading: loadingIds.has(recipe.id),
      detailError: errorIds.has(recipe.id),
      mappingSummary: detail ? detail.mappingSummary : `${ingredientCount} 项原料`,
      allowedIngredientText: detail ? detail.allowedIngredientText : '',
      blockedIngredientText: detail ? detail.blockedIngredientText : ''
    }
  })
}

function collectMenuSourceSelections(humanMenus) {
  const sourceIngredientSelections = []
  let dataVersions = null
  humanMenus.forEach((menu) => {
    menu.ingredients.forEach((ingredient) => {
      ingredient.components.forEach((component) => {
        if (!canAutoIncludeIngredient(component)) return
        if (!dataVersions) dataVersions = component.dataVersions
        sourceIngredientSelections.push({
          humanMenuId: menu.id,
          ingredientPosition: ingredient.position,
          conceptId: component.conceptId,
          variantId: component.variantId
        })
      })
    })
  })
  return { sourceIngredientSelections, dataVersions }
}

function normalizeStoredSelectedRecipes(values, selectedRecipeIds) {
  const selectedIds = new Set(selectedRecipeIds)
  const seen = new Set()
  return (Array.isArray(values) ? values : []).reduce((recipes, item) => {
    const id = String(item && item.id || '').trim()
    const title = String(item && item.title || '').trim()
    if (!id || !title || !selectedIds.has(id) || seen.has(id)) return recipes
    seen.add(id)
    recipes.push({ id, title })
    return recipes
  }, [])
}

function restoreStoredMenuSearchState(draft) {
  const stored = draft && draft.menuSearchState
  if (
    !stored
    || typeof stored !== 'object'
    || stored.version !== MENU_SEARCH_STATE_VERSION
    || typeof stored.session !== 'string'
  ) return null

  try {
    const rawSession = JSON.parse(stored.session)
    if (!rawSession || rawSession.version !== MENU_SEARCH_SESSION_VERSION) return null
  } catch (error) {
    return null
  }

  const session = restoreMenuSearchSession(stored.session)
  return {
    session,
    selectedRecipes: normalizeStoredSelectedRecipes(
      stored.selectedRecipes,
      session.selectedRecipeIds
    ),
    needsRefresh: Boolean(stored.needsRefresh)
  }
}

Page({
  data: {
    draftId: '',
    searchValue: '',
    recipes: [],
    nextCursor: null,
    selectedRecipeIds: [],
    selectedRecipes: [],
    expandedRecipeId: null,
    loading: false,
    loadingMore: false,
    confirming: false,
    errorText: '',
    errorScope: ''
  },

  onLoad(options = {}) {
    const draftId = String(options.draftId || '')
    this.setData({ draftId })
    const restored = restoreDraft(draftId)
    const storedState = restored.status === 'restored'
      ? restoreStoredMenuSearchState(restored.draft)
      : null
    if (storedState) {
      this.selectedRecipeSummariesById = storedState.selectedRecipes.reduce((summaries, recipe) => {
        summaries[recipe.id] = recipe
        return summaries
      }, Object.create(null))
      this.activeSearchToken = {}
      this.consumedPageCursors = new Set()
      this.pendingPageRequest = null
      this.applyMenuSearchSession(storedState.session, {
        searchValue: storedState.session.keyword,
        loading: false,
        loadingMore: false,
        errorText: '',
        errorScope: ''
      })
      if (storedState.needsRefresh) {
        return this.searchRecipes(storedState.session.keyword)
      }
      const expandedRecipe = storedState.session.recipes.find((recipe) => (
        recipe.id === storedState.session.expandedRecipeId
      ))
      if (expandedRecipe && !expandedRecipe.hasIngredientPreview) {
        return this.loadRecipeDetail(expandedRecipe.id)
      }
      return Promise.resolve(true)
    }
    return this.searchRecipes('')
  },

  buildStoredMenuSearchState() {
    const session = this.ensureMenuSearchSession()
    return {
      version: MENU_SEARCH_STATE_VERSION,
      session: serializeMenuSearchSession(session),
      selectedRecipes: this.buildSelectedRecipeSummaries(session),
      needsRefresh: Boolean(this.data.loading || this.data.errorScope === 'initial')
    }
  },

  persistMenuSearchState() {
    const restored = restoreDraft(this.data.draftId)
    if (restored.status !== 'restored') return false
    saveDraft({
      ...restored.draft,
      menuSearchState: this.buildStoredMenuSearchState()
    })
    return true
  },

  onHide() {
    this.persistMenuSearchState()
  },

  onUnload() {
    this.persistMenuSearchState()
  },

  ensureSelectedRecipeSummaries() {
    if (!this.selectedRecipeSummariesById) {
      this.selectedRecipeSummariesById = Object.create(null)
    }
    return this.selectedRecipeSummariesById
  },

  buildSelectedRecipeSummaries(session) {
    const summaries = this.ensureSelectedRecipeSummaries()
    session.recipes.forEach((recipe) => {
      if (session.selectedRecipeIds.includes(recipe.id)) {
        summaries[recipe.id] = { id: recipe.id, title: recipe.title }
      }
    })
    return session.selectedRecipeIds.map((recipeId) => (
      summaries[recipeId] || { id: recipeId, title: '已选菜单' }
    ))
  },

  ensureMenuSearchSession() {
    if (!this.menuSearchSession) {
      this.menuSearchSession = createMenuSearchSession({
        keyword: this.data.searchValue,
        recipes: this.data.recipes,
        nextCursor: this.data.nextCursor,
        selectedRecipeIds: this.data.selectedRecipeIds
      })
    }
    return this.menuSearchSession
  },

  applyMenuSearchSession(session, patch = {}) {
    this.recipeDetailsById = this.recipeDetailsById || Object.create(null)
    this.recipeDetailLoadingIds = this.recipeDetailLoadingIds || new Set()
    this.recipeDetailErrorIds = this.recipeDetailErrorIds || new Set()
    this.menuSearchSession = session
    this.setData({
      recipes: buildRecipeViewModels(session, {
        details: this.recipeDetailsById,
        loadingIds: this.recipeDetailLoadingIds,
        errorIds: this.recipeDetailErrorIds
      }),
      nextCursor: session.nextCursor,
      selectedRecipeIds: session.selectedRecipeIds,
      selectedRecipes: this.buildSelectedRecipeSummaries(session),
      expandedRecipeId: session.expandedRecipeId,
      ...patch
    })
  },

  async searchRecipes(query) {
    const keyword = String(query || '').trim()
    if (this.initialSearchPromise && this.initialSearchKeyword === keyword) {
      return this.initialSearchPromise
    }

    const previousSession = this.ensureMenuSearchSession()
    const searchToken = {}
    this.activeSearchToken = searchToken
    this.consumedPageCursors = new Set()
    this.pendingPageRequest = null
    this.initialSearchKeyword = keyword
    this.applyMenuSearchSession(createMenuSearchSession({
      keyword,
      selectedRecipeIds: previousSession.selectedRecipeIds
    }), {
      loading: true,
      loadingMore: false,
      errorText: '',
      errorScope: ''
    })

    const request = humanRecipeService.searchHumanRecipes({
      query: keyword,
      limit: SEARCH_PAGE_LIMIT,
      cursor: null
    })
    this.initialSearchPromise = request
    try {
      const result = await request
      if (searchToken !== this.activeSearchToken) return false
      this.applyMenuSearchSession(
        mergeMenuSearchPage(this.ensureMenuSearchSession(), result),
        { loading: false }
      )
      return true
    } catch (error) {
      if (searchToken !== this.activeSearchToken) return false
      this.setData({
        loading: false,
        errorText: '菜谱加载失败，请稍后重试。',
        errorScope: 'initial'
      })
      return false
    } finally {
      if (this.initialSearchPromise === request) {
        this.initialSearchPromise = null
        this.initialSearchKeyword = ''
      }
    }
  },

  loadNextPage() {
    const session = this.ensureMenuSearchSession()
    const cursor = session.nextCursor
    if (!cursor) return Promise.resolve(false)

    const pending = this.pendingPageRequest
    if (
      pending
      && pending.searchToken === this.activeSearchToken
      && pending.cursor === cursor
    ) {
      return pending.promise
    }
    if (this.consumedPageCursors && this.consumedPageCursors.has(cursor)) {
      return Promise.resolve(false)
    }

    const searchToken = this.activeSearchToken
    const promise = this.requestNextPage(searchToken, session.keyword, cursor)
    this.pendingPageRequest = { searchToken, cursor, promise }
    return promise
  },

  async requestNextPage(searchToken, keyword, cursor) {
    this.setData({ loadingMore: true, errorText: '', errorScope: '' })
    try {
      const result = await humanRecipeService.searchHumanRecipes({
        query: keyword,
        limit: SEARCH_PAGE_LIMIT,
        cursor
      })
      if (searchToken !== this.activeSearchToken) return false

      this.consumedPageCursors.add(cursor)
      this.applyMenuSearchSession(
        mergeMenuSearchPage(this.ensureMenuSearchSession(), result),
        { loadingMore: false }
      )
      return true
    } catch (error) {
      if (searchToken !== this.activeSearchToken) return false
      this.setData({
        loadingMore: false,
        errorText: '更多菜谱加载失败，请稍后重试。',
        errorScope: 'more'
      })
      return false
    } finally {
      const pending = this.pendingPageRequest
      if (
        pending
        && pending.searchToken === searchToken
        && pending.cursor === cursor
      ) {
        this.pendingPageRequest = null
      }
    }
  },

  onReachBottom() {
    return this.loadNextPage()
  },

  retryLoadMore() {
    return this.loadNextPage()
  },

  retryInitialSearch() {
    return this.searchRecipes(this.ensureMenuSearchSession().keyword)
  },

  onSearchChange(event) {
    const searchValue = String(event.detail.value || '')
    this.setData({ searchValue })
    this.searchRecipes(searchValue.trim())
  },

  onSearchAction() {
    this.setData({ searchValue: '' })
    this.searchRecipes('')
  },

  onToggleRecipeSelection(event) {
    const recipeId = String(event.currentTarget.dataset.recipeId || '')
    const session = this.ensureMenuSearchSession()
    const recipe = session.recipes.find((item) => item.id === recipeId)
    if (!recipe) return false
    const summaries = this.ensureSelectedRecipeSummaries()
    const wasSelected = session.selectedRecipeIds.includes(recipeId)
    if (wasSelected) delete summaries[recipeId]
    else summaries[recipeId] = { id: recipe.id, title: recipe.title }
    const nextSession = wasSelected
      ? deselectMenuRecipe(session, recipeId)
      : selectMenuRecipe(session, recipeId)
    this.applyMenuSearchSession(nextSession)
    return true
  },

  onRemoveSelectedRecipe(event) {
    const recipeId = String(event.detail.eventValue || '')
    if (!recipeId) return false
    delete this.ensureSelectedRecipeSummaries()[recipeId]
    this.applyMenuSearchSession(deselectMenuRecipe(this.ensureMenuSearchSession(), recipeId))
    return true
  },

  onToggleRecipeExpansion(event) {
    const recipeId = String(event.currentTarget.dataset.recipeId || '')
    const nextSession = toggleExpandedMenuRecipe(this.ensureMenuSearchSession(), recipeId)
    this.applyMenuSearchSession(nextSession)
    if (nextSession.expandedRecipeId !== recipeId) return Promise.resolve(false)
    const recipe = nextSession.recipes.find((item) => item.id === recipeId)
    if (recipe && recipe.hasIngredientPreview) return Promise.resolve(true)
    return this.loadRecipeDetail(recipeId)
  },

  onRetryRecipeDetail(event) {
    const recipeId = String(event.currentTarget.dataset.recipeId || '')
    return this.loadRecipeDetail(recipeId)
  },

  loadRecipeDetail(recipeId) {
    this.recipeDetailsById = this.recipeDetailsById || Object.create(null)
    this.recipeDetailRequests = this.recipeDetailRequests || Object.create(null)
    this.recipeDetailLoadingIds = this.recipeDetailLoadingIds || new Set()
    this.recipeDetailErrorIds = this.recipeDetailErrorIds || new Set()
    if (this.recipeDetailsById[recipeId]) {
      return Promise.resolve(this.recipeDetailsById[recipeId])
    }
    if (this.recipeDetailRequests[recipeId]) return this.recipeDetailRequests[recipeId]

    this.recipeDetailLoadingIds.add(recipeId)
    this.recipeDetailErrorIds.delete(recipeId)
    this.applyMenuSearchSession(this.ensureMenuSearchSession())
    const request = this.fetchRecipeDetail(recipeId)
    this.recipeDetailRequests[recipeId] = request
    return request
  },

  async fetchRecipeDetail(recipeId) {
    try {
      const recipe = await humanRecipeService.getHumanRecipe(recipeId)
      const detail = buildRecipeDetailDisplay(recipe)
      this.recipeDetailsById[recipeId] = detail
      return detail
    } catch (error) {
      this.recipeDetailErrorIds.add(recipeId)
      return null
    } finally {
      this.recipeDetailLoadingIds.delete(recipeId)
      delete this.recipeDetailRequests[recipeId]
      this.applyMenuSearchSession(this.ensureMenuSearchSession())
    }
  },

  async onConfirm() {
    const session = this.ensureMenuSearchSession()
    if (!session.selectedRecipeIds.length || this.data.confirming) return false
    const restored = restoreDraft(this.data.draftId)
    if (restored.status !== 'restored') {
      this.setData({
        errorText: '草稿已失效，请返回后重新开始。',
        errorScope: 'confirm'
      })
      return false
    }

    this.setData({ confirming: true, errorText: '', errorScope: '' })
    try {
      const humanMenus = await Promise.all(
        session.selectedRecipeIds.map((recipeId) => this.loadRecipeDetail(recipeId))
      )
      if (humanMenus.some((menu) => !menu)) {
        this.setData({
          errorText: '已选菜单详情暂时没加载出来，请重试。',
          errorScope: 'confirm'
        })
        return false
      }
      const { sourceIngredientSelections, dataVersions } = collectMenuSourceSelections(humanMenus)
      if (!sourceIngredientSelections.length || !dataVersions) {
        this.setData({
          errorText: '已选菜单没有可加入的食材，请重新选择。',
          errorScope: 'confirm'
        })
        return false
      }

      const draft = createDraftFromMenus({
        id: restored.draft.id,
        dog: restored.draft.dog,
        humanMenus,
        sourceIngredientSelections,
        latestAssessment: restored.draft.latestAssessment,
        saveIntent: restored.draft.saveIntent,
        mealTime: restored.draft.mealTime,
        note: restored.draft.note,
        photoFileIds: restored.draft.photoFileIds,
        dataVersions
      })
      saveDraft(draft)
      wx.navigateTo({
        url: `/subpackages/shared-meal/compose/index?draftId=${encodeURIComponent(draft.id)}`
      })
      return true
    } catch (error) {
      this.setData({
        errorText: '菜单版本信息不一致，请刷新后重试。',
        errorScope: 'confirm'
      })
      return false
    } finally {
      this.setData({ confirming: false })
    }
  }
})

module.exports = {
  prepareRecipeForSearchDisplay,
  buildRecipeDetailDisplay,
  buildRecipeViewModels,
  collectMenuSourceSelections
}
