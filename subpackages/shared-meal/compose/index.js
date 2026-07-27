const env = require('../../../config/env')
const rawAdapter = env.useCloudBase
  ? require('../../../services/adapters/cloudbase')
  : require('../../../services/adapters/mock')
const {
  restoreTrustedDraft,
  resetDraft,
  normalizeHumanRecipeDetail
} = require('../../../services/sharedMealDraftService')
const {
  evaluateSharedMealDogEligibility
} = require('../../../services/sharedMealDogEligibility')
const {
  calculateEnergyRequirement
} = require('../../../services/meal-assessment/energyRequirementService')
const { estimateLifeStage } = require('../../../services/lifeStageEstimator')

function energyTargetText(result) {
  if (!result.available) return '暂时无法计算，请返回完善档案。'
  const min = Math.round(result.mealTarget.min)
  const max = Math.round(result.mealTarget.max)
  return min === max ? `约 ${min} 千卡` : `约 ${min}–${max} 千卡`
}

Page({
  data: {
    draftId: '',
    dog: null,
    humanMenus: [],
    ingredients: [],
    energyTargetText: '',
    errorText: ''
  },

  async onLoad(options) {
    const draftId = String(options.draftId || '')
    this.setData({ draftId })
    const restored = await restoreTrustedDraft(draftId, async (humanMenuId) => (
      normalizeHumanRecipeDetail(await rawAdapter.getHumanRecipe(humanMenuId))
    ))
    if (restored.status !== 'restored') {
      this.setData({ errorText: '草稿已失效，请返回后重新开始。' })
      return
    }
    const draft = restored.draft
    const eligibility = evaluateSharedMealDogEligibility(draft.dog)
    if (eligibility.status !== 'eligible') {
      this.setData({ errorText: '当前狗狗档案不在自动创建适用范围内。' })
      return
    }
    const requirement = calculateEnergyRequirement({
      dog: draft.dog,
      lifeStage: estimateLifeStage({ birthDate: draft.dog.birthDate })
    })
    const ingredients = draft.ingredients.map((ingredient) => ({
      ...ingredient,
      amountText: ingredient.perMealAmountGram === null
        ? '待填写'
        : `${ingredient.perMealAmountGram} g`
    }))
    this.setData({
      dog: draft.dog,
      humanMenus: draft.humanMenus,
      ingredients,
      energyTargetText: energyTargetText(requirement)
    })
  },

  onRestart() {
    if (!resetDraft()) return
    wx.redirectTo({ url: '/subpackages/shared-meal/dog-select/index' })
  }
})

module.exports = {
  energyTargetText
}
