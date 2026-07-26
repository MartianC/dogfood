const dogService = require('../../../services/dogService')
const customRecipeService = require('../services/customRecipeService')
const ingredientWorkbench = require('../services/ingredientWorkbench')
const mealAssessmentService = require('../services/mealAssessmentService')
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
    targetDog: null,
    mealAssessment: null,
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
    }, () => this.refreshMealAssessment())
  },

  async onShow() {
    if (!this.data.recipeId) return
    const draft = customRecipeService.getDraft()
    if (!draft || draft.id !== this.data.recipeId) return
    const dogs = await dogService.listDogs()
    const ingredients = Array.isArray(draft.ingredients) ? draft.ingredients : []
    const targetDog = dogs.find((dog) => this.data.selectedDogIds.includes(dog.id)) || null
    this.setData({
      dogs,
      targetDog,
      targetDogName: (targetDog && targetDog.name) || this.data.targetDogName,
      ingredients,
      ingredientRows: withIngredientIndexes(ingredients),
      totalIngredientGram: ingredientWorkbench.totalIngredientGram(ingredients)
    }, () => this.refreshMealAssessment())
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

  applyIngredients(ingredients, merged = false) {
    this.setData({
      ingredients,
      ingredientRows: withIngredientIndexes(ingredients),
      totalIngredientGram: ingredientWorkbench.totalIngredientGram(ingredients)
    }, () => this.refreshMealAssessment())
    if (merged) wx.showToast({ title: '已合并食材克重', icon: 'none' })
  },

  onAddIngredient() {
    this.persistDraft()
    wx.navigateTo({
      url: `/subpackages/custom-recipe/ingredient-search/index?id=${encodeURIComponent(this.data.recipeId)}`,
      events: {
        ingredientsUpdated: ({ ingredients, merged }) => this.applyIngredients(ingredients, merged)
      }
    })
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
      this.refreshMealAssessment()
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
          this.refreshMealAssessment()
        })
      }
    })
  },

  async refreshMealAssessment() {
    const ingredients = this.data.ingredients
    const dog = this.data.targetDog
    if (!ingredients.length || !dog) {
      this.setData({ mealAssessment: null, nutritionLoading: false })
      return
    }
    const requestId = (this.mealAssessmentRequestId || 0) + 1
    this.mealAssessmentRequestId = requestId
    this.setData({ nutritionLoading: true })
    try {
      const foodSignature = ingredients.map((item) => item.ingredientId || item.id || '').sort().join('|')
      let assessmentData = this.mealAssessmentDataCache
      if (!assessmentData || this.mealAssessmentDataSignature !== foodSignature) {
        assessmentData = await nutritionDataService.loadMealAssessmentData(ingredients)
        if (requestId !== this.mealAssessmentRequestId) return
        this.mealAssessmentDataCache = assessmentData
        this.mealAssessmentDataSignature = foodSignature
      }
      if (requestId !== this.mealAssessmentRequestId) return
      const mealAssessment = mealAssessmentService.buildMealAssessment({
        ingredients,
        dog,
        profileOverrides: this.data.nutritionStandardProfiles,
        ...assessmentData
      })
      this.setData({ mealAssessment })
    } catch (error) {
      if (requestId !== this.mealAssessmentRequestId) return
      const mealAssessment = mealAssessmentService.buildMealAssessment({
        ingredients,
        dog,
        standards: [],
        nutrientRecords: [],
        profileOverrides: this.data.nutritionStandardProfiles,
        dataErrors: { standards: error, nutrients: error }
      })
      this.setData({ mealAssessment })
    } finally {
      if (requestId === this.mealAssessmentRequestId) this.setData({ nutritionLoading: false })
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
      this.refreshMealAssessment()
    })
  },

  onNutritionNutrientSelect(event) {
    const item = event.detail.item
    if (!item) {
      wx.showToast({ title: '暂时无法读取营养缺口', icon: 'none' })
      return
    }
    const standardKey = event.detail.standardKey
    const density = this.data.mealAssessment && this.data.mealAssessment.nutritionDensity
    const standard = density
      && density.standards
      && density.standards.find((entry) => entry.key === standardKey)
    const standardLabel = standardKey === 'gb' ? '国标' : 'FEDIAF'
    const params = [
      `id=${encodeURIComponent(this.data.recipeId)}`,
      'mode=nutrient',
      `nutrientCode=${encodeURIComponent(item.code)}`,
      `nutrientName=${encodeURIComponent(item.name)}`,
      `gapValue=${encodeURIComponent(item.gapDisplayValue)}`,
      `gapUnit=${encodeURIComponent(item.gapDisplayUnit)}`,
      `standardLabel=${encodeURIComponent(standardLabel)}`,
      `profileName=${encodeURIComponent(standard && standard.profileName || '')}`
    ]
    this.persistDraft()
    wx.navigateTo({
      url: `/subpackages/custom-recipe/ingredient-search/index?${params.join('&')}`,
      events: {
        ingredientsUpdated: ({ ingredients, merged }) => this.applyIngredients(ingredients, merged)
      }
    })
  },

  onNutritionAdjustIngredients() {
    this.setData({ nutritionExpanded: false })
    wx.showToast({ title: '请调整主要来源食材的克重', icon: 'none' })
  },

  onNutritionRetry() {
    this.mealAssessmentDataCache = null
    this.mealAssessmentDataSignature = ''
    this.refreshMealAssessment()
  },

  onCompleteDogProfile() {
    const dog = this.data.targetDog
    if (!dog || !dog.id) return
    this.persistDraft()
    wx.navigateTo({
      url: `/subpackages/dog-profile/dog-edit/index?id=${encodeURIComponent(dog.id)}`
    })
  },

  onMealScaleConfirm(event) {
    const ingredients = event.detail && event.detail.ingredients
    if (!Array.isArray(ingredients) || !ingredients.length) return
    this.setData({
      ingredients,
      ingredientRows: withIngredientIndexes(ingredients),
      totalIngredientGram: ingredientWorkbench.totalIngredientGram(ingredients)
    }, () => {
      this.persistDraft()
      this.refreshMealAssessment()
    })
  },

  onSaveRecipe() {
    this.persistDraft()
    wx.showToast({ title: '食谱已保存', icon: 'success' })
  }
})
