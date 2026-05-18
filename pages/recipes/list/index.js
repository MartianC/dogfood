const dogService = require('../../../services/dogService')
const authService = require('../../../services/authService')
const recipeUtils = require('../../../utils/recipe')
const { ageStageOptions, dietGoalOptions, allergenOptions } = require('../../../data/options')

Page({
  data: {
    keyword: '',
    authState: 'guest',
    dogs: [],
    recipes: [],
    filteredRecipes: [],
    modeIndex: 0,
    dogIndex: 0,
    ageIndex: -1,
    goalIndex: -1,
    allergenIndex: -1,
    modeOptions: [{ value: 'all', label: '全部食谱' }, { value: 'custom', label: '自定义筛选' }],
    ageOptions: ageStageOptions,
    goalOptions: dietGoalOptions,
    allergenOptions
  },

  async onShow() {
    const app = getApp()
    if (app.globalData.authReady) await app.globalData.authReady
    const dogs = await dogService.listDogs()
    const authState = authService.getAuthState()
    const modeOptions = dogs.length
      ? [
        { value: 'allDogs', label: '适合全部狗狗' },
        { value: 'singleDog', label: '适合某只狗狗' },
        { value: 'custom', label: '自定义筛选' }
      ]
      : [{ value: 'all', label: '全部食谱' }, { value: 'custom', label: '自定义筛选' }]
    this.setData({
      authState,
      dogs,
      modeOptions,
      modeIndex: 0,
      recipes: app.globalData.recipes
    }, this.applyFilters)
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value }, this.applyFilters)
  },

  onMode(e) {
    this.setData({ modeIndex: Number(e.detail.value) }, this.applyFilters)
  },

  onDog(e) {
    this.setData({ dogIndex: Number(e.detail.value) }, this.applyFilters)
  },

  onAge(e) {
    this.setData({ ageIndex: Number(e.detail.value) }, this.applyFilters)
  },

  onGoal(e) {
    this.setData({ goalIndex: Number(e.detail.value) }, this.applyFilters)
  },

  onAllergen(e) {
    this.setData({ allergenIndex: Number(e.detail.value) }, this.applyFilters)
  },

  applyFilters() {
    const mode = this.data.modeOptions[this.data.modeIndex].value
    const selectedDog = this.data.dogs[this.data.dogIndex]
    const customFilters = {
      ageStage: this.data.ageIndex >= 0 ? this.data.ageOptions[this.data.ageIndex].value : '',
      dietGoal: this.data.goalIndex >= 0 ? this.data.goalOptions[this.data.goalIndex].value : '',
      allergenKey: this.data.allergenIndex >= 0 ? this.data.allergenOptions[this.data.allergenIndex].value : ''
    }
    const filteredRecipes = recipeUtils.filterRecipes(this.data.recipes, {
      keyword: this.data.keyword,
      mode,
      dogs: this.data.dogs,
      selectedDogId: selectedDog ? selectedDog.id : '',
      customFilters
    })
    this.setData({ filteredRecipes })
  },

  onRecipeTap(e) {
    wx.navigateTo({ url: `/pages/recipes/detail/index?id=${e.detail.recipe.id}` })
  },

  onCustomRecipe() {
    wx.navigateTo({ url: '/subpackages/custom-recipe/edit/index' })
  }
})
