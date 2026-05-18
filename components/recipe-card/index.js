const assets = require('../../utils/assets')

Component({
  properties: {
    recipe: {
      type: Object,
      value: {}
    },
    showFit: {
      type: Boolean,
      value: true
    }
  },
  data: {
    defaultRecipeImage: assets.defaultRecipeImage
  },
  methods: {
    onTap() {
      this.triggerEvent('taprecipe', { recipe: this.data.recipe })
    }
  }
})
