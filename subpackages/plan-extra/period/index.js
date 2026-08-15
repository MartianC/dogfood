const dogService = require('../../../services/dogService')
const planCalculatorService = require('../services/planCalculatorService')
const mealPlanService = require('../../../services/mealPlanService')
const customRecipeService = require('../services/customRecipeService')
const recipeUtils = require('../../../utils/recipe')
const calculator = require('../../../utils/calculator')

function withDisplay(items) {
  return (items || []).map((item) => ({ ...item, displayAmount: calculator.formatGram(item.amountGram) }))
}

Page({
  data: {
    recipe: null,
    dogs: [],
    selectedDogIds: [],
    periodDays: 15,
    preview: null,
    totalItems: [],
    purchaseSummary: ''
  },

  async onLoad(options) {
    const app = getApp()
    const dogs = await dogService.listDogs()
    let recipe
    if (options.source === 'custom') {
      const draft = customRecipeService.getDraft()
      recipe = {
        id: draft.id || '',
        customRecipeId: draft.id || '',
        sourceType: 'customRecipe',
        title: draft.title,
        baseWeightKg: 10,
        ingredients: (draft.ingredients || []).map((item) => ({
          name: item.name,
          category: item.category,
          ingredientId: item.ingredientId || item.foodId || '',
          foodId: item.foodId || item.ingredientId || '',
          conceptId: item.conceptId || '',
          variantId: item.variantId || '',
          policyStatus: item.policyStatus || '',
          dataVersions: item.dataVersions ? { ...item.dataVersions } : undefined,
          baseAmountGram: Number(item.perMealAmountGram || 0),
          ratioPercent: 0,
          allergenKey: item.allergenKey || ''
        })),
        steps: ['食材清洗并切成适合入口的小块', '肉类和蔬菜分别蒸熟或煮熟', '将食材混合均匀', '按每餐重量分装并标注日期']
      }
    } else {
      recipe = recipeUtils.findRecipeById(app.globalData.recipes, options.recipeId)
    }
    const selectedDogIds = dogs.length === 1 ? [dogs[0].id] : dogs.map((dog) => dog.id)
    this.setData({ recipe, dogs, selectedDogIds }, this.updatePreview)
  },

  onTargetChange(e) {
    this.setData({ selectedDogIds: e.detail.selectedDogIds }, this.updatePreview)
  },

  onPeriodChange(e) {
    this.setData({ periodDays: e.detail.periodDays }, this.updatePreview)
  },

  async updatePreview() {
    if (!this.data.recipe || !this.data.selectedDogIds.length) return
    try {
      const preview = await planCalculatorService.generate({
        recipe: this.data.recipe,
        dogs: this.data.dogs,
        periodDays: this.data.periodDays,
        targetDogIds: this.data.selectedDogIds,
        options: { algorithmMode: 'local' }
      })
      const totalItems = withDisplay(preview.totalItems)
      this.setData({
        preview,
        totalItems,
        purchaseSummary: totalItems.length ? `${totalItems[0].name} ${totalItems[0].displayAmount} 等` : '暂无采购项'
      })
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' })
    }
  },

  async onGenerate() {
    if (!this.data.preview) return
    const saved = await mealPlanService.savePlan(this.data.preview)
    getApp().setLatestPlan(saved)
    wx.redirectTo({ url: '/pages/plan/index/index' })
  }
})
