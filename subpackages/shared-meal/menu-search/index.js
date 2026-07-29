const humanRecipeService = require('../services/humanRecipeService')
const {
  canSearchIngredient,
  canAddIngredient
} = require('../../../utils/ingredientOperationRules')
const {
  createMenuSearchSession,
  mergeMenuSearchPage
} = require('../services/menuSearchSessionService')

const SEARCH_PAGE_LIMIT = 20

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

Page({
  data: {
    searchValue: '',
    recipes: [],
    nextCursor: null,
    selectedRecipeIds: [],
    selectedRecipe: null,
    loading: false,
    loadingMore: false,
    errorText: ''
  },

  onLoad() {
    return this.searchRecipes('')
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
    this.menuSearchSession = session
    this.setData({
      recipes: session.recipes,
      nextCursor: session.nextCursor,
      selectedRecipeIds: session.selectedRecipeIds,
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
      selectedRecipe: null
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
        errorText: '菜谱加载失败，请稍后重试。'
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
    if (!cursor || this.data.selectedRecipe) return Promise.resolve(false)

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
    this.setData({ loadingMore: true, errorText: '' })
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
        errorText: '更多菜谱加载失败，请稍后重试。'
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

  onSearchChange(event) {
    const searchValue = String(event.detail.value || '')
    this.setData({ searchValue })
    this.searchRecipes(searchValue.trim())
  },

  onSearchAction() {
    this.setData({ searchValue: '' })
    this.searchRecipes('')
  },

  async onSelectRecipe(event) {
    const recipe = this.data.recipes[Number(event.currentTarget.dataset.index)]
    if (!recipe) return
    this.setData({ loading: true, errorText: '' })
    try {
      const selectedRecipe = prepareRecipeForSearchDisplay(
        await humanRecipeService.getHumanRecipe(recipe.id)
      )
      this.setData({ selectedRecipe, loading: false })
    } catch (error) {
      this.setData({
        selectedRecipe: null,
        loading: false,
        errorText: '菜谱详情加载失败，请稍后重试。'
      })
    }
  },

  onToggleComponent(event) {
    const ingredientIndex = Number(event.currentTarget.dataset.ingredientIndex)
    const componentIndex = Number(event.currentTarget.dataset.componentIndex)
    const selectedRecipe = this.data.selectedRecipe
    const ingredient = selectedRecipe && selectedRecipe.ingredients[ingredientIndex]
    const component = ingredient && ingredient.components[componentIndex]
    if (!component || !canAddIngredient(component)) return
    this.setData({
      [`selectedRecipe.ingredients[${ingredientIndex}].components[${componentIndex}].selected`]:
        !component.selected
    })
  }
})

module.exports = {
  prepareRecipeForSearchDisplay
}
