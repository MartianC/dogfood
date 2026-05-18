Component({
  properties: {
    plan: {
      type: Object,
      value: {}
    }
  },
  methods: {
    exportImage() {
      this.triggerEvent('export')
    }
  }
})
