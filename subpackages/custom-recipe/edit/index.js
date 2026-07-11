const dogService = require('../../../services/dogService')
const customRecipeService = require('../services/customRecipeService')
const recipeAdviceService = require('../services/recipeAdviceService')

Page({
  data: {
    recipeId: '',
    title: '',
    dogs: [],
    selectedDogIds: [],
    ingredients: []
  },

  async onLoad(options = {}) {
    const recipes = customRecipeService.listRecipes()
    const requested = options.id ? recipes.find((recipe) => recipe.id === options.id) : null
    const existing = requested || customRecipeService.getDraft()
    const draft = existing || customRecipeService.createDraft({ title: '未命名食谱' })
    const dogs = await dogService.listDogs()
    this.setData({
      recipeId: draft.id || '',
      dogs,
      selectedDogIds: Array.isArray(draft.targetDogIds) ? draft.targetDogIds : [],
      title: draft.title || '未命名食谱',
      ingredients: Array.isArray(draft.ingredients) ? draft.ingredients : []
    })
  },

  persistDraft() {
    return customRecipeService.saveDraft({
      ...customRecipeService.getDraft(),
      id: this.data.recipeId,
      title: this.data.title,
      ingredients: this.data.ingredients,
      targetDogIds: this.data.selectedDogIds,
      status: customRecipeService.getDraft() && customRecipeService.getDraft().status || 'draft'
    })
  },

  onTitle(event) {
    this.setData({ title: event.detail.value }, () => this.persistDraft())
  },

  onTargetChange(event) {
    this.setData({ selectedDogIds: event.detail.selectedDogIds }, () => this.persistDraft())
  },

  onIngredients(event) {
    this.setData({ ingredients: event.detail.ingredients }, () => this.persistDraft())
  },

  onAddIngredient() {
    this.setData({
      ingredients: [{ name: '', category: 'meat', perMealAmountGram: 0 }]
    }, () => this.persistDraft())
  },

  onSaveDraft() {
    this.persistDraft()
    wx.showToast({ title: '草稿已保存', icon: 'success' })
  },

  async onCheckAdvice() {
    const targetDogs = this.data.dogs.filter((dog) => this.data.selectedDogIds.includes(dog.id))
    const customRecipe = {
      id: this.data.recipeId,
      title: this.data.title,
      ingredients: this.data.ingredients
    }
    const advice = await recipeAdviceService.buildAdvice({ customRecipe, dogs: targetDogs, options: { algorithmMode: 'local' } })
    customRecipeService.saveDraft({
      ...customRecipe,
      ...advice,
      targetDogIds: this.data.selectedDogIds,
      status: 'checked'
    })
    wx.navigateTo({ url: '/subpackages/custom-recipe/advice/index' })
  }
})
