Component({
  properties: {
    visible: { type: Boolean, value: false },
    ingredient: { type: Object, value: {} }
  },

  data: {
    amount: '',
    errorText: ''
  },

  observers: {
    'visible, ingredient': function resetPopup(visible, ingredient) {
      if (visible && ingredient) this.setData({ amount: '', errorText: '' })
    }
  },

  methods: {
    onVisibleChange(event) {
      this.triggerEvent('visiblechange', { visible: event.detail.visible })
    },

    onAmountChange(event) {
      this.setData({ amount: event.detail.value, errorText: '' })
    },

    onCancel() {
      this.triggerEvent('cancel')
    },

    onConfirm() {
      const amount = Number(this.data.amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        this.setData({ errorText: '请输入大于 0 的克重' })
        return
      }
      this.triggerEvent('confirm', { ingredient: this.data.ingredient, amount })
    }
  }
})
