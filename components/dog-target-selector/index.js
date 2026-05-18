Component({
  properties: {
    dogs: {
      type: Array,
      value: []
    },
    selectedDogIds: {
      type: Array,
      value: []
    }
  },
  observers: {
    'dogs, selectedDogIds': function (dogs, selectedDogIds) {
      this.setData({
        displayDogs: (dogs || []).map((dog) => ({
          ...dog,
          selected: (selectedDogIds || []).includes(dog.id)
        }))
      })
    }
  },
  data: {
    displayDogs: []
  },
  methods: {
    onToggle(e) {
      const id = e.currentTarget.dataset.id
      const selected = this.data.selectedDogIds.slice()
      const exists = selected.includes(id)
      const next = exists ? selected.filter((item) => item !== id) : selected.concat(id)
      this.triggerEvent('change', { selectedDogIds: next })
    },
    onAll() {
      this.triggerEvent('change', { selectedDogIds: this.data.dogs.map((dog) => dog.id) })
    }
  }
})
