const { ageStageLabels, dietGoalLabels } = require('../../utils/risk')
const assets = require('../../utils/assets')

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
    dietGoalLabels,
    defaultDogAvatar: assets.defaultDogAvatar
  },
  methods: {
    onEdit() {
      if (!this.data.editable) return
      this.triggerEvent('editdog', { dog: this.data.dog })
    }
  }
})
