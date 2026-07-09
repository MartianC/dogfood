Component({
  properties: {
    imageUrl: { type: String, value: '' },
    title: { type: String, value: '暂无内容' },
    description: { type: String, value: '' },
    actionText: { type: String, value: '' },
  },
  methods: {
    handleAction() {
      this.triggerEvent('action')
    },
  },
})
