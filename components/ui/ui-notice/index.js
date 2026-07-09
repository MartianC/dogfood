Component({
  properties: {
    variant: { type: String, value: 'neutral' },
    clickable: { type: Boolean, value: false },
  },
  methods: {
    handleTap(event) {
      if (!this.properties.clickable) return
      this.triggerEvent('tap', event.detail)
    },
  },
})
