const dogService = require('../../../services/dogService')
const authService = require('../../../services/authService')
const fileService = require('../services/fileService')
const { ageStageOptions, dietGoalOptions } = require('../../../data/options')
const assets = require('../../../utils/assets')

Page({
  data: {
    redirect: '',
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
    ageIndex: 1,
    goalIndex: 0,
    defaultDogAvatar: assets.defaultDogAvatar
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
        const recipeMatch = this.data.redirect.match(/^\/pages\/recipes\/detail\/index\?id=([^&]+)/)
        if (recipeMatch) {
          wx.redirectTo({ url: `/subpackages/plan-extra/period/index?recipeId=${recipeMatch[1]}` })
          return
        }
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
