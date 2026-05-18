const { ageStageLabels, dietGoalLabels } = require('../../utils/risk')

Component({
  properties: {
    dog: {
      type: Object,
      value: {}
    },
    editable: {
      type: Boolean,
      value: false
    }
  },
  data: {
    ageStageLabels,
    dietGoalLabels
  },
  methods: {
    onEdit() {
      this.triggerEvent('editdog', { dog: this.data.dog })
    }
  }
})
