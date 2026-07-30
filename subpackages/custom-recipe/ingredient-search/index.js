const ingredientService = require('../services/ingredientService')
const ingredientWorkbench = require('../services/ingredientWorkbench')
const nutrientIngredientService = require('../services/nutrientIngredientService')
const draftAdapters = require('../services/draftAdapters')
const { canAddIngredient } = require('../services/ingredientOperationRules')

function findRecipe(draftKind, recipeId) {
  return draftAdapters.getDraft(draftKind, recipeId)
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

function addSharedMealIngredient(draft, ingredient, amount) {
  const grams = Number(amount)
  if (!draft || !ingredient || !(grams > 0) || !canAddIngredient(ingredient)) {
    return draft && draft.ingredients || []
  }
  const foodId = String(ingredient.foodId || ingredient.ingredientId || ingredient.id || '')
  const conceptId = String(ingredient.conceptId || '')
  const variantId = String(ingredient.variantId || '')
  if (!foodId || !conceptId || !variantId) throw new Error('该食材缺少已发布目录身份，暂时无法加入')
  const existed = (draft.ingredients || []).find((item) => (
    item.conceptId === conceptId && item.variantId === variantId
  ))
  if (existed) {
    return draft.ingredients.map((item) => item === existed ? {
      ...item,
      perMealAmountGram: Number(item.perMealAmountGram || 0) + grams
    } : item)
  }
  const versions = draft.dataVersions || {}
  return (draft.ingredients || []).concat({
    schemaVersion: 1,
    ingredientId: foodId,
    foodId,
    conceptId,
    variantId,
    name: String(ingredient.name || ''),
    category: String(ingredient.category || 'other'),
    policyStatus: String(ingredient.policyStatus || 'unknown'),
    perMealAmountGram: grams,
    sourceRefs: [],
    dataVersions: {
      runtimeReleaseId: String(versions.runtimeReleaseId || ''),
      recipeVersion: versions.recipeVersion === null ? null : String(versions.recipeVersion || ''),
      mappingVersion: versions.mappingVersion === null ? null : String(versions.mappingVersion || ''),
      catalogVersion: String(versions.catalogVersion || ingredient.catalogVersion || ''),
      policyVersion: String(versions.policyVersion || ingredient.policyVersion || ''),
      nutritionSourceReleaseId: String(
        ingredient.sourceReleaseId || versions.nutritionSourceReleaseId || ''
      )
    }
  })
}

Page({
  data: {
    recipe: null,
    draftKind: 'customRecipe',
    draftId: '',
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
    catalogIngredients: [],
    catalogLoading: false,
    catalogError: false,
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
    const draftKind = options.draftKind === 'sharedMeal' ? 'sharedMeal' : 'customRecipe'
    const draftId = String(options.draftId || options.id || '')
    const recipe = findRecipe(draftKind, draftId)
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
      draftKind,
      draftId,
      ingredients,
      mode: isNutrientMode ? 'nutrient' : 'search',
      isNutrientMode,
      nutrientCode: String(options.nutrientCode || '').trim(),
      nutrientName,
      nutrientPreferredUnit: String(options.gapUnit || '').trim(),
      nutrientGapText: nutrientGapText(options, nutrientName),
      nutrientBasisText: nutrientBasisText(options),
      quickIngredients: []
    }, () => {
      if (!isNutrientMode) {
        this.loadCatalogIngredients()
        return
      }
      wx.setNavigationBarTitle({ title: `挑选富含${nutrientName}的食物` })
      this.loadNutrientResults()
    })
  },

  async loadCatalogIngredients() {
    this.setData({ catalogLoading: true, catalogError: false })
    try {
      const catalogIngredients = await ingredientService.loadIngredientCatalog()
      this.setData({
        catalogIngredients,
        catalogLoading: false,
        quickIngredients: ingredientService
          .getRecentIngredients(this.data.ingredients, catalogIngredients)
          .slice(0, 4)
      })
    } catch (error) {
      this.setData({ catalogIngredients: [], catalogLoading: false, catalogError: true })
    }
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
        quickIngredients: this.data.catalogIngredients.length
          ? ingredientService
            .getRecentIngredients(this.data.ingredients, this.data.catalogIngredients)
            .slice(0, 4)
          : []
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
      quickIngredients: this.data.catalogIngredients.length
        ? ingredientService
          .getRecentIngredients(this.data.ingredients, this.data.catalogIngredients)
          .slice(0, 4)
        : []
    })
  },

  onRetrySearch() {
    this.onSearchChange({ detail: { value: this.data.searchValue } })
  },

  onRetryCatalog() {
    ingredientService.clearCache()
    this.loadCatalogIngredients()
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
    let ingredients
    try {
      ingredients = this.data.draftKind === 'sharedMeal'
        ? addSharedMealIngredient(this.data.recipe, ingredient, event.detail.amount)
        : ingredientWorkbench.addIngredient(this.data.ingredients, ingredient, event.detail.amount)
      const recipe = draftAdapters.saveIngredients(
        this.data.draftKind,
        this.data.draftId,
        ingredients
      )
      ingredientService.recordRecentIngredient(ingredient)
      if (this.openerEventChannel && typeof this.openerEventChannel.emit === 'function') {
        this.openerEventChannel.emit('ingredientsUpdated', { ingredients, merged })
      }
      this.setData({ recipe, ingredients, popupVisible: false, selectedIngredient: null })
      wx.navigateBack()
    } catch (error) {
      wx.showToast({ title: error.message || '暂时无法加入食材', icon: 'none' })
    }
  }
})

module.exports = { addSharedMealIngredient }
