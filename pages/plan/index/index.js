const mealPlanService = require('../../../services/mealPlanService')
const calculator = require('../../../utils/calculator')

const SHARE_COLORS = {
  surface: '#ffffff',
  text: '#17201b',
  primary: '#25684a',
  textSecondary: '#34423a',
  muted: '#6f7b73',
}

function withDisplay(items) {
  return (items || []).map((item) => ({
    ...item,
    displayAmount: calculator.formatGram(item.amountGram)
  }))
}

Page({
  data: {
    plan: null,
    totalItems: [],
    perMealItems: [],
    checkedMap: {}
  },

  async onShow() {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null
    if (tabBar) tabBar.setData({ selected: 'plan' })
    const app = getApp()
    const history = await mealPlanService.listHistory()
    const plan = app.globalData.latestPlan || history[history.length - 1] || null
    this.setData({
      plan,
      totalItems: plan ? withDisplay(plan.totalItems) : [],
      perMealItems: plan && plan.targetMode === 'singleDog' ? withDisplay(plan.dogMealSummaries[0].perMealItems) : [],
      checkedMap: plan ? mealPlanService.getCheckedItems(plan.id) : {}
    })
    await mealPlanService.syncPendingPlans()
  },

  onGoRecipes() {
    wx.switchTab({ url: '/pages/recipes/list/index' })
  },

  onCheckItem(e) {
    if (!this.data.plan) return
    const checkedMap = mealPlanService.setCheckedItem(this.data.plan.id, e.detail.key, e.detail.checked)
    this.setData({ checkedMap })
  },

  onExport() {
    if (!this.data.plan) return
    const ctx = wx.createCanvasContext('shareCanvas', this)
    ctx.setFillStyle(SHARE_COLORS.surface)
    ctx.fillRect(0, 0, 320, 420)
    ctx.setFillStyle(SHARE_COLORS.text)
    ctx.setFontSize(20)
    ctx.fillText(this.data.plan.recipeName || '狗饭清单', 24, 42)
    ctx.setFillStyle(SHARE_COLORS.primary)
    ctx.setFontSize(14)
    ctx.fillText(`${this.data.plan.periodDays} 天｜共 ${this.data.plan.totalPortions} 份`, 24, 72)
    ctx.setFillStyle(SHARE_COLORS.textSecondary)
    ctx.setFontSize(13)
    this.data.totalItems.slice(0, 8).forEach((item, index) => {
      ctx.fillText(`${item.name} ${item.displayAmount}`, 24, 112 + index * 28)
    })
    ctx.setFillStyle(SHARE_COLORS.muted)
    ctx.fillText('按每餐重量分装后冷冻保存', 24, 374)
    ctx.draw(false, () => {
      wx.canvasToTempFilePath({
        canvasId: 'shareCanvas',
        success: (res) => wx.previewImage({ urls: [res.tempFilePath] }),
        fail: () => wx.showToast({ title: '导出失败，请稍后再试', icon: 'none' })
      }, this)
    })
  },

  onShareAppMessage() {
    const plan = this.data.plan || {}
    return {
      title: `${plan.recipeName || '狗饭'} ${plan.periodDays || ''} 天批量制作清单`,
      path: '/pages/plan/index/index'
    }
  }
})
