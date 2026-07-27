const humanRecipeService = require('../services/humanRecipeService')

Page({
  data: {
    searchValue: '',
    recipes: [],
    selectedRecipe: null,
    loading: false,
    errorText: ''
  },

  onLoad() {
    this.searchRecipes('')
  },

  async searchRecipes(query) {
    const requestId = (this.requestId || 0) + 1
    this.requestId = requestId
    this.setData({ loading: true, errorText: '', selectedRecipe: null })
    try {
      const result = await humanRecipeService.searchHumanRecipes({
        query,
        limit: 20
      })
      if (requestId !== this.requestId) return
      this.setData({ recipes: result.items, loading: false })
    } catch (error) {
      if (requestId !== this.requestId) return
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
      const selectedRecipe = await humanRecipeService.getHumanRecipe(recipe.id)
      this.setData({ selectedRecipe, loading: false })
    } catch (error) {
      this.setData({
        selectedRecipe: null,
        loading: false,
        errorText: '菜谱详情加载失败，请稍后重试。'
      })
    }
  },

  onToggleComponent(event) {
    const ingredientIndex = Number(event.currentTarget.dataset.ingredientIndex)
    const componentIndex = Number(event.currentTarget.dataset.componentIndex)
    const selectedRecipe = this.data.selectedRecipe
    const ingredient = selectedRecipe && selectedRecipe.ingredients[ingredientIndex]
    const component = ingredient && ingredient.components[componentIndex]
    if (!component || !component.canSelect) return
    this.setData({
      [`selectedRecipe.ingredients[${ingredientIndex}].components[${componentIndex}].selected`]:
        !component.selected
    })
  }
})
