Component({
  data: {
    buttonProps: {
      theme: 'primary',
      shape: 'circle',
      size: 'large'
    }
  },

  methods: {
    onClick() {
      this.triggerEvent('tap')
    }
  }
})
