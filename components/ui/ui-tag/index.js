Component({
  properties: {
    variant: { type: String, value: 'neutral' },
    size: { type: String, value: 'medium' },
    removable: { type: Boolean, value: false },
    eventValue: { type: String, value: '' },
  },
  methods: {
    handleRemove() {
      if (!this.properties.removable) return
      this.triggerEvent('remove', { eventValue: this.properties.eventValue })
    },
  },
})
