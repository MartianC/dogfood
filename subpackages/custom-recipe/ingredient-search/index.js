const ingredientService = require('../services/ingredientService')
const ingredientWorkbench = require('../services/ingredientWorkbench')
const nutrientIngredientService = require('../services/nutrientIngredientService')
const draftAdapters = require('../services/draftAdapters')
const { canAddIngredient } = require('../services/ingredientOperationRules')
const dogService = require('../../../services/dogService')
const {
  applyDogAllergyPolicy,
  applyDogAllergyPolicies
} = require('../../../services/dogIngredientPolicy')

const INGREDIENT_PAGE_SIZE = 20

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

function appendUniqueIngredients(current = [], next = []) {
  const seen = new Set(current.map((item) => item.id || item.foodId || item.name))
  return current.concat(next.filter((item) => {
    const key = item.id || item.foodId || item.name
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  }))
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
  const versions = draft.dataVersions || ingredient.dataVersions || {}
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
        versions.nutritionSourceReleaseId || ingredient.sourceReleaseId || ''
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
    catalogLoadingMore: false,
    catalogError: false,
    catalogLoadMoreError: false,
    catalogHasMore: false,
    searchValue: '',
    searchResults: [],
    searchLoading: false,
    searchLoadingMore: false,
    searchError: false,
    searchLoadMoreError: false,
    searchHasMore: false,
    hasSearchQuery: false,
    selectedIngredient: null,
    popupVisible: false,
    targetDog: null
  },

  async onLoad(rawOptions = {}) {
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
    let targetDog = recipe.dog || null
    if (!targetDog && Array.isArray(recipe.targetDogIds) && recipe.targetDogIds.length) {
      const dogs = await dogService.listDogs()
      targetDog = dogs.find((dog) => recipe.targetDogIds.includes(dog.id)) || null
    }
    this.setData({
      recipe,
      targetDog,
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

  async loadCatalogIngredients({ append = false } = {}) {
    const offset = append ? this.data.catalogIngredients.length : 0
    this.setData(append
      ? { catalogLoadingMore: true, catalogLoadMoreError: false }
      : {
          catalogIngredients: [],
          catalogLoading: true,
          catalogError: false,
          catalogHasMore: false
        })
    try {
      const page = await ingredientService.loadIngredientPage({
        offset,
        limit: INGREDIENT_PAGE_SIZE
      })
      const projectedItems = applyDogAllergyPolicies(page.items, this.data.targetDog)
      const catalogIngredients = append
        ? appendUniqueIngredients(this.data.catalogIngredients, projectedItems)
        : projectedItems
      this.setData({
        catalogIngredients,
        catalogLoading: false,
        catalogLoadingMore: false,
        catalogLoadMoreError: false,
        catalogHasMore: page.hasMore,
        quickIngredients: ingredientService
          .getRecentIngredients(this.data.ingredients, catalogIngredients)
          .slice(0, 4)
      })
      return true
    } catch (error) {
      this.setData(append
        ? { catalogLoadingMore: false, catalogLoadMoreError: true }
        : {
            catalogIngredients: [],
            catalogLoading: false,
            catalogError: true,
            catalogHasMore: false
          })
      return false
    }
  },

  loadNextCatalogPage() {
    if (
      !this.data.catalogHasMore
      || this.data.catalogLoading
      || this.data.catalogLoadingMore
    ) return Promise.resolve(false)
    if (this.catalogPageRequest) return this.catalogPageRequest
    const request = this.loadCatalogIngredients({ append: true })
    this.catalogPageRequest = request
    return request.finally(() => {
      if (this.catalogPageRequest === request) this.catalogPageRequest = null
    })
  },

  async loadIngredientSearchResults(query, searchValue, requestId, append = false) {
    const offset = append ? this.data.searchResults.length : 0
    this.setData(append
      ? { searchLoadingMore: true, searchLoadMoreError: false }
      : {
          searchValue,
          searchResults: [],
          searchLoading: true,
          searchError: false,
          searchHasMore: false,
          searchLoadMoreError: false,
          hasSearchQuery: true
        })
    try {
      const page = await ingredientService.loadIngredientPage({
        keyword: query,
        offset,
        limit: INGREDIENT_PAGE_SIZE
      })
      const projectedItems = applyDogAllergyPolicies(page.items, this.data.targetDog)
      if (requestId !== this.searchRequestId) return false
      this.setData({
        searchResults: append
          ? appendUniqueIngredients(this.data.searchResults, projectedItems)
          : projectedItems,
        searchLoading: false,
        searchLoadingMore: false,
        searchError: false,
        searchLoadMoreError: false,
        searchHasMore: page.hasMore
      })
      return true
    } catch (error) {
      if (requestId !== this.searchRequestId) return false
      this.setData(append
        ? { searchLoadingMore: false, searchLoadMoreError: true }
        : {
            searchResults: [],
            searchLoading: false,
            searchError: true,
            searchHasMore: false
          })
      return false
    }
  },

  loadNextSearchPage() {
    if (
      !this.data.searchHasMore
      || this.data.searchLoading
      || this.data.searchLoadingMore
    ) return Promise.resolve(false)
    if (this.searchPageRequest) return this.searchPageRequest
    const requestId = this.searchRequestId
    const query = this.data.searchValue.trim()
    const request = this.loadIngredientSearchResults(
      query,
      this.data.searchValue,
      requestId,
      true
    )
    this.searchPageRequest = request
    return request.finally(() => {
      if (this.searchPageRequest === request) this.searchPageRequest = null
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
      const projectedResults = applyDogAllergyPolicies(searchResults, this.data.targetDog)
      const nextData = { searchResults: projectedResults, searchLoading: false }
      if (!keyword) {
        nextData.nutrientDefaultResults = projectedResults
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
    this.searchPageRequest = null
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
        searchLoadingMore: false,
        searchError: false,
        searchLoadMoreError: false,
        searchHasMore: false,
        hasSearchQuery: false,
        quickIngredients: this.data.catalogIngredients.length
          ? ingredientService
            .getRecentIngredients(this.data.ingredients, this.data.catalogIngredients)
            .slice(0, 4)
          : []
      })
      return
    }
    if (!this.data.isNutrientMode) {
      return this.loadIngredientSearchResults(query, searchValue, requestId)
    }
    this.setData({
      searchValue,
      searchResults: [],
      searchLoading: true,
      searchError: false,
      hasSearchQuery: true
    })
    try {
      const searchResults = await nutrientIngredientService.loadNutrientIngredients({
        nutrientCode: this.data.nutrientCode,
        nutrientName: this.data.nutrientName,
        preferredUnit: this.data.nutrientPreferredUnit,
        currentIngredients: this.data.ingredients,
        keyword: query
      })
      if (requestId !== this.searchRequestId) return
      this.setData({ searchResults, searchLoading: false })
    } catch (error) {
      if (requestId !== this.searchRequestId) return
      this.setData({ searchResults: [], searchLoading: false, searchError: true })
    }
  },

  onSearchAction() {
    this.searchRequestId = (this.searchRequestId || 0) + 1
    this.searchPageRequest = null
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
      searchLoadingMore: false,
      searchError: false,
      searchLoadMoreError: false,
      searchHasMore: false,
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

  onRetryCatalogMore() {
    return this.loadNextCatalogPage()
  },

  onRetrySearchMore() {
    return this.loadNextSearchPage()
  },

  onReachBottom() {
    if (this.data.isNutrientMode) return Promise.resolve(false)
    return this.data.hasSearchQuery
      ? this.loadNextSearchPage()
      : this.loadNextCatalogPage()
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
    const projected = applyDogAllergyPolicy(ingredient, this.data.targetDog)
    if (!canAddIngredient(projected)) {
      wx.showToast({ title: projected.blockedReason || '该食材不能加入', icon: 'none' })
      return
    }
    this.setData({ selectedIngredient: projected, popupVisible: true })
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
    const ingredient = applyDogAllergyPolicy(event.detail.ingredient, this.data.targetDog)
    if (!canAddIngredient(ingredient)) {
      wx.showToast({ title: ingredient.blockedReason || '该食材不能加入', icon: 'none' })
      return
    }
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
