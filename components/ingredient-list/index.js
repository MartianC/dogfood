const calculator = require('../../utils/calculator')

Component({
  properties: {
    items: {
      type: Array,
      value: []
    },
    checkedMap: {
      type: Object,
      value: {}
    },
    showCheckbox: {
      type: Boolean,
      value: false
    },
    showPerMeal: {
      type: Boolean,
      value: false
    }
  },
  methods: {
    format(gram) {
      return calculator.formatGram(gram)
    },
    onCheck(e) {
      const { key } = e.currentTarget.dataset
      this.triggerEvent('checkitem', { key, checked: !this.data.checkedMap[key] })
    }
  }
})
