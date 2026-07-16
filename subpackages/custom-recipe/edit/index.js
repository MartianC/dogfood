const dogService = require('../../../services/dogService')
const ingredientService = require('../../../services/ingredientService')
const customRecipeService = require('../services/customRecipeService')
const ingredientWorkbench = require('../services/ingredientWorkbench')
const nutritionAssessmentService = require('../services/nutritionAssessmentService')
const nutritionDataService = require('../services/nutritionDataService')

function withIngredientIndexes(ingredients) {
  return ingredientWorkbench.calculateIngredientRatios(ingredients).map((item, index) => ({
    ...item,
    index
  }))
}

Page({
  data: {
    recipeId: '',
    title: '',
    targetDogName: '',
    dogs: [],
    selectedDogIds: [],
    ingredients: [],
    ingredientRows: [],
    totalIngredientGram: 0,
    mode: 'edit',
    searchValue: '',
    recentIngredients: [],
    searchResults: [],
    searchLoading: false,
    searchError: false,
    hasSearchQuery: false,
    selectedIngredient: null,
    popupVisible: false,
    targetDog: null,
    nutritionAssessment: null,
    nutritionLoading: false,
    nutritionExpanded: false,
    nutritionStandardProfiles: {}
  },

  async onLoad(options = {}) {
    const recipes = customRecipeService.listRecipes()
    const requested = options.id ? recipes.find((recipe) => recipe.id === options.id) : null
    const existing = requested || customRecipeService.getDraft()
    const draft = existing || customRecipeService.createDraft({ title: '未命名食谱' })
    const dogs = await dogService.listDogs()
    const ingredients = Array.isArray(draft.ingredients) ? draft.ingredients : []
    const selectedDogIds = Array.isArray(draft.targetDogIds) ? draft.targetDogIds : []
    const targetDog = dogs.find((dog) => selectedDogIds.includes(dog.id))
    this.setData({
      recipeId: draft.id || '',
      dogs,
      selectedDogIds,
      targetDogName: draft.targetDogName || (targetDog && targetDog.name) || '',
      targetDog: targetDog || null,
      title: draft.title || '未命名食谱',
      ingredients,
      ingredientRows: withIngredientIndexes(ingredients),
      totalIngredientGram: ingredientWorkbench.totalIngredientGram(ingredients),
      nutritionStandardProfiles: draft.nutritionStandardProfiles || {}
    }, () => this.refreshNutritionAssessment())
  },

  persistDraft() {
    return customRecipeService.saveDraft({
      ...customRecipeService.getDraft(),
      id: this.data.recipeId,
      title: this.data.title,
      ingredients: this.data.ingredients,
      targetDogIds: this.data.selectedDogIds,
      targetDogName: this.data.targetDogName,
      nutritionStandardProfiles: this.data.nutritionStandardProfiles,
      status: customRecipeService.getDraft() && customRecipeService.getDraft().status || 'draft'
    })
  },

  async onAddIngredient() {
    this.setData({
      mode: 'search',
      searchValue: '',
      searchResults: [],
      searchError: false,
      hasSearchQuery: false,
      recentIngredients: ingredientService.getRecentIngredients(this.data.ingredients)
    })
  },

  onCancelSearch() {
    this.setData({ mode: 'edit', searchValue: '', searchResults: [], searchError: false, hasSearchQuery: false })
  },

  async onSearchChange(event) {
    const value = String(event.detail.value || '')
    const requestId = (this.searchRequestId || 0) + 1
    this.searchRequestId = requestId
    if (!value.trim()) {
      this.setData({
        searchValue: value,
        searchResults: [],
        searchError: false,
        hasSearchQuery: false,
        recentIngredients: ingredientService.getRecentIngredients(this.data.ingredients),
        searchLoading: false
      })
      return
    }
    this.setData({ searchValue: value, searchResults: [], searchError: false, hasSearchQuery: true, searchLoading: true })
    try {
      const searchResults = await ingredientService.searchIngredients(value)
      if (requestId !== this.searchRequestId) return
      this.setData({ searchResults, searchLoading: false, searchError: false })
    } catch (error) {
      if (requestId !== this.searchRequestId) return
      this.setData({ searchResults: [], searchLoading: false, searchError: true })
    }
  },

  onRetrySearch() {
    this.onSearchChange({ detail: { value: this.data.searchValue } })
  },

  onSelectIngredient(event) {
    this.setData({
      selectedIngredient: event.detail.ingredient,
      popupVisible: true
    })
  },

  onPopupVisibleChange(event) {
    this.setData({
      popupVisible: event.detail.visible,
      selectedIngredient: event.detail.visible ? this.data.selectedIngredient : null
    })
  },

  onPopupCancel() {
    this.setData({ popupVisible: false, selectedIngredient: null })
  },

  onPopupConfirm(event) {
    const ingredient = event.detail.ingredient
    const existingIngredient = this.data.ingredients.find((item) => (
      (item.ingredientId && item.ingredientId === ingredient.id) || item.name === ingredient.name
    ))
    const ingredients = ingredientWorkbench.addIngredient(
      this.data.ingredients,
      ingredient,
      event.detail.amount
    )
    ingredientService.recordRecentIngredient(ingredient)
    this.setData({
      ingredients,
      ingredientRows: withIngredientIndexes(ingredients),
      totalIngredientGram: ingredientWorkbench.totalIngredientGram(ingredients),
      mode: 'edit',
      popupVisible: false,
      selectedIngredient: null,
      searchValue: '',
      searchResults: [],
      searchError: false,
      hasSearchQuery: false
    }, () => {
      this.persistDraft()
      this.refreshNutritionAssessment()
    })
    if (existingIngredient) wx.showToast({ title: '已合并食材克重', icon: 'none' })
  },

  onIngredientAmountChange(event) {
    const ingredients = ingredientWorkbench.updateIngredientAmount(
      this.data.ingredients,
      event.detail.index,
      event.detail.value
    )
    this.setData({
      ingredients,
      ingredientRows: withIngredientIndexes(ingredients),
      totalIngredientGram: ingredientWorkbench.totalIngredientGram(ingredients)
    }, () => {
      this.persistDraft()
      this.refreshNutritionAssessment()
    })
  },

  onRemoveIngredient(event) {
    const index = Number(event.detail.index)
    const ingredient = this.data.ingredients[index]
    wx.showModal({
      title: '删除食材',
      content: `确定删除${ingredient ? `“${ingredient.name}”` : '这项食材'}吗？`,
      confirmText: '删除',
      success: (result) => {
        if (!result.confirm) return
        const ingredients = this.data.ingredients.filter((item, itemIndex) => itemIndex !== index)
        this.setData({
          ingredients,
          ingredientRows: withIngredientIndexes(ingredients),
          totalIngredientGram: ingredientWorkbench.totalIngredientGram(ingredients)
        }, () => {
          this.persistDraft()
          this.refreshNutritionAssessment()
        })
      }
    })
  },

  async refreshNutritionAssessment() {
    const ingredients = this.data.ingredients
    const dog = this.data.targetDog
    if (!ingredients.length || !dog) {
      this.setData({ nutritionAssessment: null, nutritionLoading: false })
      return
    }
    const requestId = (this.nutritionRequestId || 0) + 1
    this.nutritionRequestId = requestId
    this.setData({ nutritionLoading: true })
    try {
      const foodSignature = ingredients.map((item) => item.ingredientId || item.id || '').sort().join('|')
      if (!this.nutritionDataCache || this.nutritionDataSignature !== foodSignature) {
        this.nutritionDataCache = await nutritionDataService.loadNutritionData(ingredients)
        this.nutritionDataSignature = foodSignature
      }
      if (requestId !== this.nutritionRequestId) return
      const nutritionAssessment = nutritionAssessmentService.buildAssessment({
        ingredients,
        dog,
        profileOverrides: this.data.nutritionStandardProfiles,
        ...this.nutritionDataCache
      })
      this.setData({ nutritionAssessment, nutritionLoading: false })
    } catch (error) {
      if (requestId !== this.nutritionRequestId) return
      this.setData({
        nutritionLoading: false,
        nutritionAssessment: {
          available: false,
          status: 'unavailable',
          statusLabel: '暂无法评估',
          primaryAdvice: '营养数据暂时无法加载，请稍后重试',
          contextText: `${dog.name} · 每日 ${dog.dailyMeals} 餐`,
          basisText: '恢复数据连接后按食谱干物质密度评估',
          counts: { adjust: 0, met: 0, unavailable: ingredients.length },
          coverageText: '当前未能读取食材营养数据',
          missingIngredients: ingredients.map((item) => ({
            id: item.ingredientId || item.id || item.name,
            name: item.name,
            reason: '营养数据加载失败'
          })),
          standards: [],
          elements: []
        }
      })
    }
  },

  onNutritionToggle(event) {
    this.setData({ nutritionExpanded: event.detail.expanded })
  },

  onNutritionProfileChange(event) {
    const nutritionStandardProfiles = {
      ...this.data.nutritionStandardProfiles,
      [event.detail.key]: event.detail.profileCode
    }
    this.setData({ nutritionStandardProfiles }, () => {
      this.persistDraft()
      this.refreshNutritionAssessment()
    })
  },

  onNutritionNutrientSelect(event) {
    const item = event.detail.item
    wx.showToast({
      title: item ? `后续可筛选富含${item.name}的食物` : '食物筛选后续提供',
      icon: 'none'
    })
  },

  onNutritionAdjustIngredients() {
    this.setData({ nutritionExpanded: false })
    wx.showToast({ title: '请调整主要来源食材的克重', icon: 'none' })
  },

  onNutritionRetry() {
    this.nutritionDataCache = null
    this.nutritionDataSignature = ''
    this.refreshNutritionAssessment()
  },

  onSaveRecipe() {
    this.persistDraft()
    wx.showToast({ title: '食谱已保存', icon: 'success' })
  }
})
