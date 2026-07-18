const ingredientService = require('../../../services/ingredientService')
const customRecipeService = require('../services/customRecipeService')
const ingredientWorkbench = require('../services/ingredientWorkbench')
const nutrientIngredientService = require('../services/nutrientIngredientService')

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

function decodeOption(value) {
  const text = String(value || '')
  try {
    return decodeURIComponent(text)
  } catch (error) {
    return text
  }
}

function nutrientBasisText(options) {
  const standardLabel = String(options.standardLabel || '').trim()
  const profileName = String(options.profileName || '').trim()
  return [standardLabel, profileName].filter(Boolean).join(' · ') || '当前营养参考标准'
}

function nutrientGapText(options, nutrientName) {
  const value = String(options.gapValue || '').trim()
  const unit = String(options.gapUnit || '').trim()
  if (!value) return `${nutrientName}缺口待计算`
  return `${nutrientName}缺口 ${value}${unit ? ` ${unit}` : ''} / 100g`
}

Page({
  data: {
    recipe: null,
    ingredients: [],
    mode: 'search',
    isNutrientMode: false,
    nutrientCode: '',
    nutrientName: '',
    nutrientPreferredUnit: '',
    nutrientGapText: '',
    nutrientBasisText: '',
    nutrientDefaultResults: [],
    nutrientDefaultLoaded: false,
    quickIngredients: [],
    searchValue: '',
    searchResults: [],
    searchLoading: false,
    searchError: false,
    hasSearchQuery: false,
    selectedIngredient: null,
    popupVisible: false
  },

  onLoad(rawOptions = {}) {
    const options = Object.keys(rawOptions).reduce((result, key) => {
      result[key] = decodeOption(rawOptions[key])
      return result
    }, {})
    const recipe = findRecipe(String(options.id || ''))
    if (!recipe) {
      wx.showToast({ title: '未找到当前食谱', icon: 'none' })
      return
    }
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : []
    const isNutrientMode = options.mode === 'nutrient'
    const nutrientName = String(options.nutrientName || '').trim() || '营养元素'
    this.openerEventChannel = typeof this.getOpenerEventChannel === 'function'
      ? this.getOpenerEventChannel()
      : null
    this.setData({
      recipe,
      ingredients,
      mode: isNutrientMode ? 'nutrient' : 'search',
      isNutrientMode,
      nutrientCode: String(options.nutrientCode || '').trim(),
      nutrientName,
      nutrientPreferredUnit: String(options.gapUnit || '').trim(),
      nutrientGapText: nutrientGapText(options, nutrientName),
      nutrientBasisText: nutrientBasisText(options),
      quickIngredients: ingredientService.getRecentIngredients(ingredients).slice(0, 4)
    }, () => {
      if (!isNutrientMode) return
      wx.setNavigationBarTitle({ title: `挑选富含${nutrientName}的食物` })
      this.loadNutrientResults()
    })
  },

  async loadNutrientResults(keyword = '', searchValue = '', requestId) {
    const activeRequestId = requestId || (this.searchRequestId || 0) + 1
    this.searchRequestId = activeRequestId
    this.setData({
      searchValue,
      searchResults: [],
      searchLoading: true,
      searchError: false,
      hasSearchQuery: Boolean(keyword)
    })
    try {
      const searchResults = await nutrientIngredientService.loadNutrientIngredients({
        nutrientCode: this.data.nutrientCode,
        nutrientName: this.data.nutrientName,
        preferredUnit: this.data.nutrientPreferredUnit,
        currentIngredients: this.data.ingredients,
        keyword
      })
      if (activeRequestId !== this.searchRequestId) return
      const nextData = { searchResults, searchLoading: false }
      if (!keyword) {
        nextData.nutrientDefaultResults = searchResults
        nextData.nutrientDefaultLoaded = true
      }
      this.setData(nextData)
    } catch (error) {
      if (activeRequestId !== this.searchRequestId) return
      this.setData({ searchResults: [], searchLoading: false, searchError: true })
    }
  },

  async onSearchChange(event) {
    const searchValue = String(event.detail.value || '')
    const query = searchValue.trim()
    const requestId = (this.searchRequestId || 0) + 1
    this.searchRequestId = requestId
    if (!query) {
      if (this.data.isNutrientMode) {
        if (this.data.nutrientDefaultLoaded) {
          this.setData({
            searchValue,
            searchResults: this.data.nutrientDefaultResults,
            searchLoading: false,
            searchError: false,
            hasSearchQuery: false
          })
        } else {
          await this.loadNutrientResults('', searchValue, requestId)
        }
        return
      }
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
      const searchResults = this.data.isNutrientMode
        ? await nutrientIngredientService.loadNutrientIngredients({
          nutrientCode: this.data.nutrientCode,
          nutrientName: this.data.nutrientName,
          preferredUnit: this.data.nutrientPreferredUnit,
          currentIngredients: this.data.ingredients,
          keyword: query
        })
        : await ingredientService.searchIngredients(query)
      if (requestId !== this.searchRequestId) return
      this.setData({ searchResults, searchLoading: false })
    } catch (error) {
      if (requestId !== this.searchRequestId) return
      this.setData({ searchResults: [], searchLoading: false, searchError: true })
    }
  },

  onSearchAction() {
    this.searchRequestId = (this.searchRequestId || 0) + 1
    if (this.data.isNutrientMode) {
      if (this.data.nutrientDefaultLoaded) {
        this.setData({
          searchValue: '',
          searchResults: this.data.nutrientDefaultResults,
          searchLoading: false,
          searchError: false,
          hasSearchQuery: false
        })
      } else {
        this.loadNutrientResults('', '', this.searchRequestId)
      }
      return
    }
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
