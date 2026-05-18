const mealPlanService = require('../../../services/mealPlanService')

Page({
  data: {
    plans: []
  },

  async onShow() {
    const plans = await mealPlanService.listHistory()
    this.setData({ plans: plans.slice().reverse() })
  },

  onGoRecipes() {
    wx.switchTab({ url: '/pages/recipes/list/index' })
  }
})
