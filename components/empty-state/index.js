const assets = require('../../utils/assets')

Component({
  properties: {
    title: String,
    description: String,
    actionText: String,
    imageUrl: String
  },
  data: {
    defaultImage: assets.defaultRecipeImage
  },
  methods: {
    onAction() {
      this.triggerEvent('action')
    }
  }
})
