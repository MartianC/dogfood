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
  methods: {
    onTap() {
      this.triggerEvent('taprecipe', { recipe: this.data.recipe })
    }
  }
})
