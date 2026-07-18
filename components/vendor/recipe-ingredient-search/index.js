Component({
  properties: {
    value: { type: String, value: '' },
    loading: { type: Boolean, value: false },
    actionText: { type: String, value: '取消' }
  },

  methods: {
    onChange(event) {
      this.triggerEvent('change', { value: event.detail.value })
    },

    onActionClick() {
      this.triggerEvent('action')
    }
  }
})
