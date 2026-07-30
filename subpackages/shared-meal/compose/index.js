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
  removeSourceIngredient,
  reincludeSourceIngredient,
  updateDraftIngredients,
  updateDraftAssessment,
  buildAssessmentSnapshot,
  buildSaveIntent,
  confirmSaveIntent
} = require('../services/sharedMealDraftService')
const { canAddIngredient } = require('../services/ingredientOperationRules')
const { evaluateSharedMealDogEligibility } = require('../services/sharedMealDogEligibility')
const { calculateEnergyRequirement } = require('../services/energyRequirementService')
const mealEnergyService = require('../services/mealEnergyService')
const mealAssessmentService = require('../services/mealAssessmentService')
const nutritionDataService = require('../services/nutritionDataService')
const sharedMealRecordService = require('../../../services/sharedMealRecordService')
const { estimateLifeStage } = require('../../../services/lifeStageEstimator')
const { measurementBasisText } = require('../utils/ingredientMeasurementBasis')

function energyTargetText(result) {
  if (!result.available) return '暂时无法计算，请返回完善档案。'
  const min = Math.round(result.mealTarget.min)
  const max = Math.round(result.mealTarget.max)
  return min === max ? `约 ${min} 千卡` : `约 ${min}–${max} 千卡`
}

function formatEnergyValue(value) {
  if (!Number.isFinite(value)) return ''
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}

function preparationStateByVariantId(humanMenus = []) {
  const states = new Map()
  humanMenus.forEach((menu) => {
    const ingredients = Array.isArray(menu.ingredients) ? menu.ingredients : []
    ingredients.forEach((ingredient) => {
      const components = Array.isArray(ingredient.components) ? ingredient.components : []
      components.forEach((component) => {
        const variantId = String(component.variantId || '')
        if (variantId && !states.has(variantId)) {
          states.set(variantId, component.preparationState)
        }
      })
    })
  })
  return states
}

function ingredientRows(ingredients = [], nutrientRecords = [], humanMenus = []) {
  const preparationStates = preparationStateByVariantId(humanMenus)
  const totalGram = ingredients.reduce((sum, ingredient) => {
    const amount = Number(ingredient.perMealAmountGram)
    return Number.isFinite(amount) && amount > 0 ? sum + amount : sum
  }, 0)
  return ingredients.map((ingredient, index) => ({
    ...ingredient,
    index,
    amountInput: ingredient.perMealAmountGram === null
      ? ''
      : String(ingredient.perMealAmountGram),
    measurementBasisText: measurementBasisText(
      ingredient.preparationState
      || preparationStates.get(String(ingredient.variantId || ''))
    ),
    energyText: (() => {
      const result = mealEnergyService.calculateMealEnergy({
        ingredients: [{ ...ingredient, perMealAmountGram: 100 }],
        nutrientRecords
      })
      const energy = result.ingredientEnergies[0]
      return energy
        ? `每 100g ${formatEnergyValue(energy.kcal)} kcal`
        : '每 100g 能量待完善'
    })(),
    ratioText: Number(ingredient.perMealAmountGram) > 0 && totalGram > 0
      ? `${Math.round(Number(ingredient.perMealAmountGram) / totalGram * 100)}%`
      : '—'
  }))
}

function hasSameSourceSelection(left, right) {
  return left.humanMenuId === right.humanMenuId
    && left.ingredientPosition === right.ingredientPosition
    && left.conceptId === right.conceptId
    && left.variantId === right.variantId
}

function humanMealGroups(humanMenus = [], sourceIngredientSelections = []) {
  return humanMenus.map((menu) => ({
    id: menu.id,
    title: menu.title,
    rows: (Array.isArray(menu.ingredients) ? menu.ingredients : []).flatMap((ingredient) => {
      const components = Array.isArray(ingredient.components) ? ingredient.components : []
      if (!components.length) {
        return [{
          key: `${menu.id}:${ingredient.position}:unmapped`,
          name: ingredient.sourceText || '未识别原料',
          detailText: '暂未识别，不能加入狗饭',
          state: 'unmapped',
          actionIcon: '',
          actionTone: 'default',
          actionLabel: '',
          actionDisabled: true
        }]
      }
      return components.map((component) => {
        const selection = {
          humanMenuId: menu.id,
          ingredientPosition: ingredient.position,
          conceptId: component.conceptId,
          variantId: component.variantId
        }
        const canAdd = canAddIngredient(component)
        const included = canAdd && sourceIngredientSelections.some((item) => (
          hasSameSourceSelection(item, selection)
        ))
        const name = component.displayName || ingredient.sourceText || '未命名原料'
        const state = canAdd ? (included ? 'included' : 'removed') : 'blocked'
        return {
          ...selection,
          key: `${menu.id}:${ingredient.position}:${component.conceptId}:${component.variantId}`,
          name,
          detailText: state === 'blocked'
            ? (component.blockedReason || '当前策略不允许加入狗饭。')
            : (included ? '已加入狗饭' : '已移除，可重新加入'),
          state,
          included,
          actionIcon: included ? 'minus-circle' : 'add-circle',
          actionTone: state === 'blocked' ? 'muted' : (included ? 'warning' : 'primary'),
          actionLabel: state === 'blocked'
            ? `${name}不可加入狗饭`
            : (included ? `从狗饭移除${name}` : `加入狗饭${name}`),
          actionDisabled: !canAdd
        }
      })
    })
  }))
}

function humanMealSummary(groups = []) {
  const rows = groups.flatMap((group) => group.rows || [])
  if (!rows.length) return '人饭'
  const included = rows.filter((row) => row.state === 'included').length
  return `人饭 ${included}/${rows.length}`
}

function sourceSelectionFromDataset(dataset = {}) {
  return {
    humanMenuId: String(dataset.humanMenuId || ''),
    ingredientPosition: Number(dataset.ingredientPosition),
    conceptId: String(dataset.conceptId || ''),
    variantId: String(dataset.variantId || '')
  }
}

Page({
  data: {
    draftId: '',
    dog: null,
    humanMenus: [],
    humanMenuGroups: [],
    humanMealSummary: '人饭',
    sourcePickerExpanded: false,
    ingredients: [],
    nutrientRecords: [],
    energyTargetText: '',
    mealAssessment: null,
    nutritionLoading: false,
    nutritionExpanded: false,
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
    const groups = humanMealGroups(
      draft.humanMenus,
      draft.sourceIngredientSelections
    )
    this.setData({
      dog: draft.dog,
      humanMenus: draft.humanMenus,
      humanMenuGroups: groups,
      humanMealSummary: humanMealSummary(groups),
      ingredients: ingredientRows(draft.ingredients, [], draft.humanMenus),
      nutrientRecords: [],
      energyTargetText: energyTargetText(requirement),
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
    this.setData({
      ingredients: ingredientRows(
        draft.ingredients,
        assessmentData.nutrientRecords,
        draft.humanMenus
      ),
      nutrientRecords: assessmentData.nutrientRecords,
      mealAssessment: assessment,
      nutritionLoading: false
    })
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
    this.setData({
      ingredients: ingredientRows(ingredients, this.data.nutrientRecords, this.data.humanMenus)
    }, () => this.refreshMealAssessment())
  },

  onRemoveIngredient(event) {
    const index = Number(event.currentTarget.dataset.index)
    const restored = restoreDraft(this.data.draftId)
    if (restored.status !== 'restored') return
    const ingredient = restored.draft.ingredients[index]
    if (!ingredient) return
    const sourceSelections = restored.draft.sourceIngredientSelections.filter((selection) => (
      selection.conceptId === ingredient.conceptId
      && selection.variantId === ingredient.variantId
    ))
    const next = sourceSelections.length
      ? sourceSelections.reduce(removeSourceIngredient, restored.draft)
      : updateDraftIngredients(
          this.data.draftId,
          restored.draft.ingredients.filter((item, itemIndex) => itemIndex !== index)
        )
    if (sourceSelections.length) saveDraft(next)
    const groups = humanMealGroups(next.humanMenus, next.sourceIngredientSelections)
    this.setData({
      humanMenuGroups: groups,
      humanMealSummary: humanMealSummary(groups),
      ingredients: ingredientRows(next.ingredients, this.data.nutrientRecords, next.humanMenus),
      mealAssessment: null
    }, () => this.refreshMealAssessment())
  },

  onAddIngredient() {
    wx.navigateTo({
      url: `/subpackages/custom-recipe/ingredient-search/index?draftKind=sharedMeal&draftId=${encodeURIComponent(this.data.draftId)}`
    })
  },

  onToggleHumanMealPicker() {
    this.setData({ sourcePickerExpanded: !this.data.sourcePickerExpanded })
  },

  onDismissHumanMealPicker() {
    this.setData({ sourcePickerExpanded: false })
  },

  onSourcePickerContentTap() {},

  onToggleSourceIngredient(event) {
    const selection = sourceSelectionFromDataset(event.currentTarget.dataset)
    const restored = restoreDraft(this.data.draftId)
    if (restored.status !== 'restored') return
    const isIncluded = restored.draft.sourceIngredientSelections.some((item) => (
      hasSameSourceSelection(item, selection)
    ))
    try {
      const next = isIncluded
        ? removeSourceIngredient(restored.draft, selection)
        : reincludeSourceIngredient(restored.draft, selection)
      saveDraft(next)
      const groups = humanMealGroups(next.humanMenus, next.sourceIngredientSelections)
      this.setData({
        humanMenuGroups: groups,
        humanMealSummary: humanMealSummary(groups),
        ingredients: ingredientRows(next.ingredients, this.data.nutrientRecords, next.humanMenus),
        mealAssessment: null
      }, () => this.refreshMealAssessment())
    } catch (error) {
      wx.showToast({ title: error.message || '暂时无法更新来源食材', icon: 'none' })
    }
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
    this.setData({
      ingredients: ingredientRows(ingredients, this.data.nutrientRecords, this.data.humanMenus)
    }, () => this.refreshMealAssessment())
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
  }
})

module.exports = {
  energyTargetText,
  ingredientRows,
  humanMealGroups,
  humanMealSummary,
  sourceSelectionFromDataset
}
