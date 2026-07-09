const { ingredientCategoryOptions } = require('../../data/options')

Component({
  properties: {
    ingredients: {
      type: Array,
      value: []
    }
  },
  data: {
    categoryOptions: ingredientCategoryOptions
  },
  methods: {
    onName(e) {
      this.updateItem(e.currentTarget.dataset.index, { name: e.detail.value })
    },
    onAmount(e) {
      this.updateItem(e.currentTarget.dataset.index, { perMealAmountGram: Number(e.detail.value || 0) })
    },
    onCategory(e) {
      const index = e.currentTarget.dataset.index
      const category = this.data.categoryOptions[Number(e.detail.value)].value
      this.updateItem(index, { category })
    },
    addItem() {
      this.triggerEvent('change', {
        ingredients: this.data.ingredients.concat({ name: '', category: 'meat', perMealAmountGram: 0 })
      })
    },
    removeItem(e) {
      const index = Number(e.detail.eventValue)
      this.triggerEvent('change', {
        ingredients: this.data.ingredients.filter((item, itemIndex) => itemIndex !== index)
      })
    },
    updateItem(index, patch) {
      const ingredients = this.data.ingredients.map((item, itemIndex) => (
        itemIndex === Number(index) ? { ...item, ...patch } : item
      ))
      this.triggerEvent('change', { ingredients })
    }
  }
})
