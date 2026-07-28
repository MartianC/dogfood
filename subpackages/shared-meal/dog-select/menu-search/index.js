const env = require('../../../../config/env')
const humanRecipeService = require('../../services/humanRecipeService')
const rawAdapter = env.useCloudBase
  ? require('../../../../services/adapters/cloudbase')
  : require('../../../../services/adapters/mock')
const {
  restoreDraft,
  createDraftFromMenus,
  saveDraft,
  normalizeHumanRecipeDetail
} = require('../../../../services/sharedMealDraftService')

Page({
  data: {
    draftId: '',
    searchValue: '',
    recipes: [],
    selectedRecipe: null,
    selectedCount: 0,
    loading: false,
    errorText: ''
  },

  onLoad(options) {
    this.setData({ draftId: String(options.draftId || '') })
    this.searchRecipes('')
  },

  async searchRecipes(query) {
    const requestId = (this.requestId || 0) + 1
    this.requestId = requestId
    this.setData({ loading: true, errorText: '', selectedRecipe: null, selectedCount: 0 })
    try {
      const result = await humanRecipeService.searchHumanRecipes({ query, limit: 20 })
      if (this.requestId !== requestId) return
      this.setData({ recipes: result.items, loading: false })
    } catch (error) {
      if (this.requestId !== requestId) return
      this.setData({
        recipes: [],
        loading: false,
        errorText: '菜谱加载失败，请稍后重试。'
      })
    }
  },

  onSearchChange(event) {
    const searchValue = String(event.detail.value || '')
    this.setData({ searchValue })
    this.searchRecipes(searchValue.trim())
  },

  onSearchAction() {
    this.setData({ searchValue: '' })
    this.searchRecipes('')
  },

  async onSelectRecipe(event) {
    const recipe = this.data.recipes[Number(event.currentTarget.dataset.index)]
    if (!recipe) return
    this.setData({ loading: true, errorText: '' })
    try {
      const selectedRecipe = normalizeHumanRecipeDetail(await rawAdapter.getHumanRecipe(recipe.id))
      const selectedCount = selectedRecipe.ingredients.reduce((count, ingredient) => (
        count + ingredient.components.filter((component) => component.selected).length
      ), 0)
      this.setData({ selectedRecipe, selectedCount, loading: false })
    } catch (error) {
      this.setData({
        selectedRecipe: null,
        selectedCount: 0,
        loading: false,
        errorText: '菜谱详情加载失败，请稍后重试。'
      })
    }
  },

  onToggleComponent(event) {
    const ingredientIndex = Number(event.currentTarget.dataset.ingredientIndex)
    const componentIndex = Number(event.currentTarget.dataset.componentIndex)
    const ingredient = this.data.selectedRecipe
      && this.data.selectedRecipe.ingredients[ingredientIndex]
    const component = ingredient && ingredient.components[componentIndex]
    if (!component || !component.canSelect || component.policyStatus === 'blocked') return
    const selected = !component.selected
    this.setData({
      [`selectedRecipe.ingredients[${ingredientIndex}].components[${componentIndex}].selected`]: selected,
      selectedCount: this.data.selectedCount + (selected ? 1 : -1)
    })
  },

  onConfirm() {
    const restored = restoreDraft(this.data.draftId)
    if (restored.status !== 'restored' || !this.data.selectedRecipe) {
      this.setData({ errorText: '草稿已失效，请返回后重新开始。' })
      return
    }
    const sourceIngredientSelections = []
    let dataVersions = null
    this.data.selectedRecipe.ingredients.forEach((ingredient) => {
      ingredient.components.forEach((component) => {
        if (!(component.selected && component.policyStatus !== 'blocked')) return
        if (!dataVersions) dataVersions = component.dataVersions
        sourceIngredientSelections.push({
          humanMenuId: this.data.selectedRecipe.id,
          ingredientPosition: ingredient.position,
          conceptId: component.conceptId,
          variantId: component.variantId
        })
      })
    })
    if (!sourceIngredientSelections.length || !dataVersions) return

    try {
      const draft = createDraftFromMenus({
        id: restored.draft.id,
        dog: restored.draft.dog,
        humanMenus: [this.data.selectedRecipe],
        sourceIngredientSelections,
        latestAssessment: restored.draft.latestAssessment,
        saveIntent: restored.draft.saveIntent,
        mealTime: restored.draft.mealTime,
        note: restored.draft.note,
        photoFileIds: restored.draft.photoFileIds,
        dataVersions
      })
      saveDraft(draft)
      wx.navigateTo({
        url: `/subpackages/shared-meal/compose/index?draftId=${encodeURIComponent(draft.id)}`
      })
    } catch (error) {
      this.setData({ errorText: '菜谱版本信息不完整，请刷新后重试。' })
    }
  }
})

module.exports = {
  normalizeRecipeDetail: normalizeHumanRecipeDetail
}
