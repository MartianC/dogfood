const ingredientService = require('../../../services/ingredientService')
const customRecipeService = require('../services/customRecipeService')
const ingredientWorkbench = require('../services/ingredientWorkbench')

function findRecipe(recipeId) {
  const draft = customRecipeService.getDraft()
  if (draft && (!recipeId || draft.id === recipeId)) return draft
  return customRecipeService.listRecipes().find((recipe) => recipe.id === recipeId) || null
}

function isSameIngredient(item, ingredient) {
  const ingredientId = ingredient.id || ingredient.ingredientId
  return Boolean(
    (item.ingredientId && ingredientId && item.ingredientId === ingredientId) ||
    item.name === ingredient.name
  )
}

Page({
  data: {
    recipe: null,
    ingredients: [],
    quickIngredients: [],
    searchValue: '',
    searchResults: [],
    searchLoading: false,
    searchError: false,
    hasSearchQuery: false,
    selectedIngredient: null,
    popupVisible: false
  },

  onLoad(options = {}) {
    const recipe = findRecipe(String(options.id || ''))
    if (!recipe) {
      wx.showToast({ title: '未找到当前食谱', icon: 'none' })
      return
    }
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : []
    this.openerEventChannel = typeof this.getOpenerEventChannel === 'function'
      ? this.getOpenerEventChannel()
      : null
    this.setData({
      recipe,
      ingredients,
      quickIngredients: ingredientService.getRecentIngredients(ingredients).slice(0, 4)
    })
  },

  async onSearchChange(event) {
    const searchValue = String(event.detail.value || '')
    const query = searchValue.trim()
    const requestId = (this.searchRequestId || 0) + 1
    this.searchRequestId = requestId
    if (!query) {
      this.setData({
        searchValue,
        searchResults: [],
        searchLoading: false,
        searchError: false,
        hasSearchQuery: false,
        quickIngredients: ingredientService.getRecentIngredients(this.data.ingredients).slice(0, 4)
      })
      return
    }
    this.setData({
      searchValue,
      searchResults: [],
      searchLoading: true,
      searchError: false,
      hasSearchQuery: true
    })
    try {
      const searchResults = await ingredientService.searchIngredients(query)
      if (requestId !== this.searchRequestId) return
      this.setData({ searchResults, searchLoading: false })
    } catch (error) {
      if (requestId !== this.searchRequestId) return
      this.setData({ searchResults: [], searchLoading: false, searchError: true })
    }
  },

  onSearchAction() {
    this.searchRequestId = (this.searchRequestId || 0) + 1
    this.setData({
      searchValue: '',
      searchResults: [],
      searchLoading: false,
      searchError: false,
      hasSearchQuery: false,
      quickIngredients: ingredientService.getRecentIngredients(this.data.ingredients).slice(0, 4)
    })
  },

  onRetrySearch() {
    this.onSearchChange({ detail: { value: this.data.searchValue } })
  },

  onQuickIngredientTap(event) {
    const ingredient = this.data.quickIngredients[Number(event.currentTarget.dataset.index)]
    this.openIngredientPopup(ingredient)
  },

  onSelectIngredient(event) {
    this.openIngredientPopup(event.detail.ingredient)
  },

  openIngredientPopup(ingredient) {
    if (!ingredient) return
    this.setData({ selectedIngredient: ingredient, popupVisible: true })
  },

  onPopupVisibleChange(event) {
    const visible = event.detail.visible
    this.setData({
      popupVisible: visible,
      selectedIngredient: visible ? this.data.selectedIngredient : null
    })
  },

  onPopupCancel() {
    this.setData({ popupVisible: false, selectedIngredient: null })
  },

  onPopupConfirm(event) {
    const ingredient = event.detail.ingredient
    const merged = this.data.ingredients.some((item) => isSameIngredient(item, ingredient))
    const ingredients = ingredientWorkbench.addIngredient(
      this.data.ingredients,
      ingredient,
      event.detail.amount
    )
    const recipe = customRecipeService.saveDraft({
      ...this.data.recipe,
      ingredients
    })
    ingredientService.recordRecentIngredient(ingredient)
    if (this.openerEventChannel && typeof this.openerEventChannel.emit === 'function') {
      this.openerEventChannel.emit('ingredientsUpdated', { ingredients, merged })
    }
    this.setData({ recipe, ingredients, popupVisible: false, selectedIngredient: null })
    wx.navigateBack()
  }
})
