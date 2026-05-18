Component({
  properties: {
    authState: {
      type: String,
      value: 'guest'
    }
  },
  methods: {
    onLogin() {
      this.triggerEvent('login')
    }
  }
})
