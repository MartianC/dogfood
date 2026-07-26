Component({
  properties: {
    visible: { type: Boolean, value: false },
    dogs: { type: Array, value: [] },
    loading: { type: Boolean, value: false }
  },

  data: {
    title: '',
    dogIndex: -1,
    errorText: ''
  },

  methods: {
    onVisibleChange(event) {
      const visible = event.detail.visible
      this.triggerEvent('visiblechange', { visible })
    },

    onDogChange(event) {
      this.setData({ dogIndex: Number(event.detail.value) })
    },

    onTitleChange(event) {
      this.setData({
        title: event.detail.value,
        errorText: event.detail.value.trim() ? '' : this.data.errorText
      })
    },

    onCancel() {
      this.triggerEvent('cancel')
    },

    onConfirm() {
      const title = this.data.title.trim()
      if (!title) {
        this.setData({ errorText: '请填写食谱名称' })
        return
      }
      const dog = this.data.dogs[this.data.dogIndex]
      this.triggerEvent('confirm', {
        title,
        targetDogId: dog ? dog.id : '',
        targetDogName: dog ? dog.name : ''
      })
    },

    reset() {
      this.setData({ title: '', dogIndex: -1, errorText: '' })
    }
  }
})
