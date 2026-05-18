const dogService = require('../../../services/dogService')
const authService = require('../../../services/authService')
const { ageStageOptions } = require('../../../data/options')

Page({
  data: {
    redirect: '',
    form: {
      name: '',
      ageStage: 'adult',
      weightKg: '',
      dailyMeals: 2,
      allergens: [],
      avoidIngredients: []
    },
    allergenText: '',
    avoidText: '',
    ageStageOptions,
    ageIndex: 1
  },

  async onLoad(options) {
    this.setData({ redirect: decodeURIComponent(options.redirect || '') })
    if (authService.getAuthState() === 'guest') await authService.login()
  },

  setField(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ [`form.${key}`]: e.detail.value })
  },

  onAge(e) {
    const option = this.data.ageStageOptions[Number(e.detail.value)]
    this.setData({ ageIndex: Number(e.detail.value), 'form.ageStage': option.value })
  },

  splitText(text) {
    return String(text || '').split(/[、,，\s]+/).map((item) => item.trim()).filter(Boolean)
  },

  async onSave() {
    try {
      await dogService.createDog({
        ...this.data.form,
        weightKg: Number(this.data.form.weightKg),
        dailyMeals: Number(this.data.form.dailyMeals),
        allergens: this.splitText(this.data.allergenText),
        avoidIngredients: this.splitText(this.data.avoidText)
      })
      if (this.data.redirect) {
        wx.redirectTo({ url: this.data.redirect })
      } else {
        wx.navigateBack()
      }
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' })
    }
  },

  onAllergen(e) {
    this.setData({ allergenText: e.detail.value })
  },

  onAvoid(e) {
    this.setData({ avoidText: e.detail.value })
  }
})
