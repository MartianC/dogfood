const auth = require('../../../utils/auth')
const dogService = require('../../../services/dogService')
const customRecipeService = require('../../../services/customRecipeService')
const recipeAdviceService = require('../../../services/recipeAdviceService')

Page({
  data: {
    title: '',
    dogs: [],
    selectedDogIds: [],
    ingredients: [
      { name: '鳕鱼', category: 'meat', perMealAmountGram: 160, allergenKey: 'fish' },
      { name: '南瓜', category: 'vegetable', perMealAmountGram: 80 },
      { name: '熟米饭', category: 'carb', perMealAmountGram: 70, allergenKey: 'grain' }
    ]
  },

  async onLoad() {
    const passed = await auth.requireAuth({ requireProfile: true, redirect: '/subpackages/custom-recipe/edit/index' })
    if (!passed) return
    const draft = customRecipeService.getDraft()
    const dogs = await dogService.listDogs()
    this.setData({
      dogs,
      selectedDogIds: draft && draft.targetDogIds ? draft.targetDogIds : dogs.map((dog) => dog.id),
      title: draft && draft.title ? draft.title : '家里简单饭',
      ingredients: draft && draft.ingredients ? draft.ingredients : this.data.ingredients
    })
  },

  onTitle(e) {
    this.setData({ title: e.detail.value })
  },

  onTargetChange(e) {
    this.setData({ selectedDogIds: e.detail.selectedDogIds })
  },

  onIngredients(e) {
    this.setData({ ingredients: e.detail.ingredients })
  },

  onSaveDraft() {
    customRecipeService.saveDraft({
      title: this.data.title,
      ingredients: this.data.ingredients,
      targetDogIds: this.data.selectedDogIds
    })
    wx.showToast({ title: '草稿已保存', icon: 'success' })
  },

  async onCheckAdvice() {
    const targetDogs = this.data.dogs.filter((dog) => this.data.selectedDogIds.includes(dog.id))
    const customRecipe = {
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
