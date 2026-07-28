const env = require('../../../config/env')
const rawAdapter = env.useCloudBase
  ? require('../../../services/adapters/cloudbase')
  : require('../../../services/adapters/mock')
const {
  restoreTrustedDraft,
  restoreDraft,
  resetDraft,
  normalizeHumanRecipeDetail,
  saveDraft,
  updateDraftIngredients,
  updateDraftAssessment,
  buildAssessmentSnapshot,
  buildSaveIntent,
  confirmSaveIntent
} = require('../../../services/sharedMealDraftService')
const { evaluateSharedMealDogEligibility } = require('../../../services/sharedMealDogEligibility')
const { calculateEnergyRequirement } = require('../../../services/meal-assessment/energyRequirementService')
const mealAssessmentService = require('../../../services/meal-assessment/mealAssessmentService')
const nutritionDataService = require('../../../services/meal-assessment/nutritionDataService')
const sharedMealRecordService = require('../../../services/sharedMealRecordService')
const { estimateLifeStage } = require('../../../services/lifeStageEstimator')

function energyTargetText(result) {
  if (!result.available) return '暂时无法计算，请返回完善档案。'
  const min = Math.round(result.mealTarget.min)
  const max = Math.round(result.mealTarget.max)
  return min === max ? `约 ${min} 千卡` : `约 ${min}–${max} 千卡`
}

function ingredientRows(ingredients = []) {
  return ingredients.map((ingredient, index) => ({
    ...ingredient,
    index,
    amountInput: ingredient.perMealAmountGram === null
      ? ''
      : String(ingredient.perMealAmountGram),
    sourceText: ingredient.sourceRefs.length
      ? `来自 ${ingredient.sourceRefs.length} 项人饭原料`
      : '额外添加'
  }))
}

Page({
  data: {
    draftId: '',
    dog: null,
    humanMenus: [],
    ingredients: [],
    energyTargetText: '',
    mealAssessment: null,
    nutritionLoading: false,
    nutritionExpanded: false,
    note: '',
    saving: false,
    errorText: ''
  },

  async onLoad(options) {
    const draftId = String(options.draftId || '')
    this.setData({ draftId })
    await this.loadDraft(true)
  },

  async onShow() {
    if (this.data.draftId && this.data.dog) await this.loadDraft(false)
  },

  async loadDraft(requireTrustedMenus) {
    const restored = requireTrustedMenus
      ? await restoreTrustedDraft(this.data.draftId, async (humanMenuId) => (
        normalizeHumanRecipeDetail(await rawAdapter.getHumanRecipe(humanMenuId))
      ))
      : restoreDraft(this.data.draftId)
    if (restored.status !== 'restored') {
      this.setData({ errorText: '草稿已失效，请返回后重新开始。' })
      return
    }
    const draft = restored.draft
    const eligibility = evaluateSharedMealDogEligibility(draft.dog)
    if (eligibility.status !== 'eligible') {
      this.setData({ errorText: '当前狗狗档案不在本功能适用范围内。' })
      return
    }
    if (requireTrustedMenus) saveDraft(draft)
    const requirement = calculateEnergyRequirement({
      dog: draft.dog,
      lifeStage: estimateLifeStage({ birthDate: draft.dog.birthDate })
    })
    this.setData({
      dog: draft.dog,
      humanMenus: draft.humanMenus,
      ingredients: ingredientRows(draft.ingredients),
      energyTargetText: energyTargetText(requirement),
      note: String(draft.note || ''),
      mealAssessment: draft.latestAssessment && draft.latestAssessment.energy
        ? draft.latestAssessment
        : null,
      errorText: ''
    }, () => this.refreshMealAssessment())
  },

  async refreshMealAssessment() {
    const restored = restoreDraft(this.data.draftId)
    if (restored.status !== 'restored') return
    const draft = restored.draft
    const requestId = (this.assessmentRequestId || 0) + 1
    this.assessmentRequestId = requestId
    this.setData({ nutritionLoading: true })
    let assessmentData
    try {
      assessmentData = await nutritionDataService.loadMealAssessmentData(draft.ingredients)
    } catch (error) {
      assessmentData = {
        standards: [],
        nutrientRecords: [],
        dataErrors: { standards: error, nutrients: error }
      }
    }
    if (requestId !== this.assessmentRequestId) return
    const assessment = mealAssessmentService.buildMealAssessment({
      ingredients: draft.ingredients,
      dog: draft.dog,
      ...assessmentData
    })
    const snapshot = buildAssessmentSnapshot(draft, assessment)
    updateDraftAssessment(draft.id, snapshot)
    this.setData({ mealAssessment: assessment, nutritionLoading: false })
  },

  onIngredientAmountInput(event) {
    const index = Number(event.currentTarget.dataset.index)
    const text = String(event.detail.value || '').trim()
    const amount = text === '' ? null : Number(text)
    if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) return
    const restored = restoreDraft(this.data.draftId)
    if (restored.status !== 'restored') return
    const ingredients = restored.draft.ingredients.map((item, itemIndex) => (
      itemIndex === index ? { ...item, perMealAmountGram: amount } : item
    ))
    updateDraftIngredients(this.data.draftId, ingredients)
    this.setData({ ingredients: ingredientRows(ingredients) }, () => this.refreshMealAssessment())
  },

  onRemoveIngredient(event) {
    const index = Number(event.currentTarget.dataset.index)
    const restored = restoreDraft(this.data.draftId)
    if (restored.status !== 'restored') return
    const ingredients = restored.draft.ingredients.filter((item, itemIndex) => itemIndex !== index)
    updateDraftIngredients(this.data.draftId, ingredients)
    this.setData({ ingredients: ingredientRows(ingredients) }, () => this.refreshMealAssessment())
  },

  onAddIngredient() {
    wx.navigateTo({
      url: `/subpackages/custom-recipe/ingredient-search/index?draftKind=sharedMeal&draftId=${encodeURIComponent(this.data.draftId)}`
    })
  },

  onNutritionToggle(event) {
    this.setData({ nutritionExpanded: event.detail.expanded })
  },

  onNutritionNutrientSelect(event) {
    const item = event.detail && event.detail.item
    if (!item) return
    const params = [
      'draftKind=sharedMeal',
      `draftId=${encodeURIComponent(this.data.draftId)}`,
      'mode=nutrient',
      `nutrientCode=${encodeURIComponent(item.code)}`,
      `nutrientName=${encodeURIComponent(item.name)}`,
      `gapValue=${encodeURIComponent(item.gapDisplayValue || '')}`,
      `gapUnit=${encodeURIComponent(item.gapDisplayUnit || '')}`
    ]
    wx.navigateTo({ url: `/subpackages/custom-recipe/ingredient-search/index?${params.join('&')}` })
  },

  onMealScaleConfirm(event) {
    const ingredients = event.detail && event.detail.ingredients
    if (!Array.isArray(ingredients) || !ingredients.length) return
    updateDraftIngredients(this.data.draftId, ingredients)
    this.setData({ ingredients: ingredientRows(ingredients) }, () => this.refreshMealAssessment())
  },

  onNoteInput(event) {
    const note = String(event.detail.value || '').slice(0, 200)
    const restored = restoreDraft(this.data.draftId)
    if (restored.status === 'restored') saveDraft({ ...restored.draft, note })
    this.setData({ note })
  },

  async persistRecord(saveIntent) {
    this.setData({ saving: true })
    try {
      const record = await sharedMealRecordService.save(saveIntent)
      resetDraft(this.data.draftId)
      wx.redirectTo({
        url: `/subpackages/shared-meal/record-detail/index?recordId=${encodeURIComponent(record.id)}`
      })
    } catch (error) {
      this.setData({ saving: false })
      wx.showToast({ title: error.message || '保存失败，请重试', icon: 'none' })
    }
  },

  onSave() {
    try {
      const saveIntent = buildSaveIntent(this.data.draftId, this.data.mealAssessment)
      if (saveIntent.warningConfirmation !== 'required') {
        this.persistRecord(saveIntent)
        return
      }
      wx.showModal({
        title: '仍要记录这顿吗？',
        content: '当前存在偏高项或关键数据缺失。保存只记录本餐，不代表本餐营养完整或适合长期重复喂养。',
        confirmText: '继续保存',
        success: (result) => {
          if (result.confirm) this.persistRecord(confirmSaveIntent(this.data.draftId))
        }
      })
    } catch (error) {
      wx.showToast({ title: error.message || '暂时无法保存', icon: 'none' })
    }
  },

  onRestart() {
    if (!resetDraft()) return
    wx.redirectTo({ url: '/subpackages/shared-meal/dog-select/index' })
  }
})

module.exports = { energyTargetText, ingredientRows }
