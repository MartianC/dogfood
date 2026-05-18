const dogService = require('../../../services/dogService')
const authService = require('../../../services/authService')
const fileService = require('../../../services/fileService')
const { ageStageOptions, dietGoalOptions, allergenOptions } = require('../../../data/options')
const assets = require('../../../utils/assets')

function toText(list) {
  return (list || []).join('、')
}

function splitText(text) {
  return String(text || '').split(/[、,，\s]+/).map((item) => item.trim()).filter(Boolean)
}

Page({
  data: {
    id: '',
    form: {
      name: '',
      ageStage: 'adult',
      weightKg: '',
      dailyMeals: 2,
      avatarUrl: '',
      dietGoal: 'daily',
      allergens: [],
      avoidIngredients: []
    },
    allergenText: '',
    avoidText: '',
    ageStageOptions,
    dietGoalOptions,
    allergenOptions,
    ageIndex: 1,
    goalIndex: 0,
    defaultDogAvatar: assets.defaultDogAvatar
  },

  async onLoad(options) {
    if (authService.getAuthState() === 'guest') await authService.login()
    if (options.id) {
      const dogs = await dogService.listDogs()
      const dog = dogs.find((item) => item.id === options.id)
      if (dog) {
        this.setData({
          id: options.id,
          form: dog,
          allergenText: toText(dog.allergens),
          avoidText: toText(dog.avoidIngredients),
          ageIndex: ageStageOptions.findIndex((item) => item.value === dog.ageStage),
          goalIndex: dietGoalOptions.findIndex((item) => item.value === dog.dietGoal)
        })
      }
    }
  },

  setField(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ [`form.${key}`]: e.detail.value })
  },

  onAge(e) {
    const option = this.data.ageStageOptions[Number(e.detail.value)]
    this.setData({ ageIndex: Number(e.detail.value), 'form.ageStage': option.value })
  },

  onGoal(e) {
    const option = this.data.dietGoalOptions[Number(e.detail.value)]
    this.setData({ goalIndex: Number(e.detail.value), 'form.dietGoal': option.value })
  },

  onGoalTap(e) {
    const index = Number(e.currentTarget.dataset.index)
    const option = this.data.dietGoalOptions[index]
    this.setData({ goalIndex: index, 'form.dietGoal': option.value })
  },

  async onChooseAvatar() {
    try {
      const tempFilePath = await fileService.chooseLocalImage()
      if (!tempFilePath) return
      const avatarUrl = await fileService.saveLocalImage(tempFilePath)
      this.setData({ 'form.avatarUrl': avatarUrl })
    } catch (error) {
      wx.showToast({ title: '未选择头像', icon: 'none' })
    }
  },

  onAllergenText(e) {
    this.setData({ allergenText: e.detail.value })
  },

  onAvoidText(e) {
    this.setData({ avoidText: e.detail.value })
  },

  async onSave() {
    try {
      const payload = {
        ...this.data.form,
        weightKg: Number(this.data.form.weightKg),
        dailyMeals: Number(this.data.form.dailyMeals),
        allergens: splitText(this.data.allergenText),
        avoidIngredients: splitText(this.data.avoidText)
      }
      if (this.data.id) {
        await dogService.updateDog(this.data.id, payload)
      } else {
        await dogService.createDog(payload)
      }
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 400)
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' })
    }
  },

  async onDelete() {
    if (!this.data.id) return
    wx.showModal({
      title: '删除档案',
      content: '历史清单不会被删除，但后续不会再用该档案生成新清单。',
      success: async (res) => {
        if (!res.confirm) return
        await dogService.deleteDog(this.data.id)
        wx.navigateBack()
      }
    })
  }
})
