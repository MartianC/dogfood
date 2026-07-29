Component({
  properties: {
    value: { type: String, value: '' },
    loading: { type: Boolean, value: false },
    placeholder: { type: String, value: '搜索食材，如“鸡胸肉”' },
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
