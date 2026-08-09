Component({
  properties: {
    variant: { type: String, value: 'primary' },
    size: { type: String, value: 'large' },
    block: { type: Boolean, value: true },
    disabled: { type: Boolean, value: false },
    loading: { type: Boolean, value: false },
    openType: { type: String, value: '' },
    ariaLabel: { type: String, value: '' },
    eventValue: { type: String, value: '' },
  },
  methods: {
    handleTap(event) {
      if (this.properties.disabled || this.properties.loading) return
      this.triggerEvent('tap', {
        ...event.detail,
        eventValue: this.properties.eventValue,
      })
    },
    handleChooseAvatar(event) {
      if (this.properties.disabled || this.properties.loading) return
      this.triggerEvent('chooseavatar', event.detail)
    },
  },
})
