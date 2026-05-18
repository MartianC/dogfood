const customRecipeService = require('../../../services/customRecipeService')

Page({
  data: {
    draft: null
  },

  onShow() {
    this.setData({ draft: customRecipeService.getDraft() })
  },

  onBackEdit() {
    wx.navigateBack()
  },

  async onChoosePeriod() {
    const saved = await customRecipeService.save(this.data.draft)
    customRecipeService.saveDraft({ ...this.data.draft, id: saved.id })
    wx.navigateTo({ url: '/subpackages/plan-extra/period/index?source=custom' })
  }
})
