const dogService = require('../../../services/dogService')
const authService = require('../../../services/authService')
const fileService = require('../services/fileService')
const {
  dietGoalOptions,
  breedOptions,
  activityDurationBands,
  bodyConditionOptions,
  diseaseStatusOptions,
  reproductiveStatusOptions,
  therapeuticWeightManagementOptions
} = require('../data/options')
const { estimateLifeStage } = require('../../../services/lifeStageEstimator')
const {
  deriveActivityLevel,
  estimateExpectedAdultWeight
} = require('../../../services/dogProfileDerivations')
const assets = require('../../../utils/assets')

function localDateText(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function activityLabel(level) {
  const band = activityDurationBands.find((item) => item.value === level)
  return band ? band.label : '待选择'
}

function profileErrors(message) {
  return {
    birthDateError: /出生日期/.test(message) ? message : '',
    breedError: /品种/.test(message) ? message : '',
    dailyActivityHoursError: /活动时长/.test(message) ? message : ''
  }
}

function activityHoursValue(value) {
  if (value === '' || value === null || value === undefined) return null
  const hours = Number(value)
  return Number.isFinite(hours) ? hours : null
}

const initialActivityLevel = deriveActivityLevel(1.5)

Page({
  data: {
    redirect: '',
    form: {
      name: '',
      birthDate: '',
      breed: '',
      weightKg: '',
      dailyMeals: 2,
      dailyActivityHours: 1.5,
      bodyCondition: 'ideal',
      neutered: false,
      avatarUrl: '',
      dietGoal: 'daily',
      specialNutritionNeeds: {
        hasDisease: null,
        reproductiveStatus: null,
        therapeuticWeightManagement: null
      },
      allergens: [],
      avoidIngredients: []
    },
    breedOptions,
    dietGoalOptions,
    bodyConditionOptions,
    diseaseStatusOptions,
    reproductiveStatusOptions,
    therapeuticWeightManagementOptions,
    breedIndex: 0,
    goalIndex: 0,
    lifeStageLabel: '阶段待完善',
    isPuppy: false,
    expectedAdultWeightKg: null,
    adultWeightEstimateReason: 'breed_estimate_unavailable',
    activityLevel: initialActivityLevel,
    activityLevelLabel: activityLabel(initialActivityLevel),
    activityThumbLeft: 25,
    birthDateError: '',
    breedError: '',
    dailyActivityHoursError: '',
    today: localDateText(),
    saving: false,
    defaultDogAvatar: assets.defaultDogAvatar
  },

  async onLoad(options) {
    this.setData({ redirect: decodeURIComponent(options.redirect || '') })
    if (authService.getAuthState() === 'guest') await authService.login()
  },

  setField(event) {
    const key = event.currentTarget.dataset.key
    this.setData({ [`form.${key}`]: event.detail.value })
  },

  onBirthDate(event) {
    const birthDate = event.detail.value
    const stage = estimateLifeStage({ birthDate })
    this.setData({
      'form.birthDate': birthDate,
      lifeStageLabel: stage.label,
      isPuppy: stage.available && stage.energyStage === 'puppy',
      birthDateError: stage.reason === 'future_birth_date' ? '出生日期不能晚于今天' : ''
    })
  },

  onBreed(event) {
    const breedIndex = Number(event.detail.value)
    const option = this.data.breedOptions[breedIndex]
    const estimate = estimateExpectedAdultWeight(option.value)
    this.setData({
      breedIndex,
      'form.breed': option.value,
      expectedAdultWeightKg: estimate.expectedAdultWeightKg,
      adultWeightEstimateReason: estimate.adultWeightEstimateReason,
      breedError: ''
    })
  },

  onActivityHours(event) {
    const dailyActivityHours = Number(event.detail.value)
    const activityLevel = deriveActivityLevel(dailyActivityHours)
    this.setData({
      'form.dailyActivityHours': dailyActivityHours,
      activityLevel,
      activityLevelLabel: activityLabel(activityLevel),
      activityThumbLeft: dailyActivityHours / 6 * 100,
      dailyActivityHoursError: ''
    })
  },

  onBodyCondition(event) {
    this.setData({ 'form.bodyCondition': event.currentTarget.dataset.value })
  },

  onNeutered(event) {
    this.setData({ 'form.neutered': event.currentTarget.dataset.value === 'true' })
  },

  onGoalTap(event) {
    const goalIndex = Number(event.currentTarget.dataset.index)
    const option = this.data.dietGoalOptions[goalIndex]
    this.setData({ goalIndex, 'form.dietGoal': option.value })
  },

  onSpecialNutritionNeed(event) {
    const { key, value } = event.currentTarget.dataset
    this.setData({ [`form.specialNutritionNeeds.${key}`]: value })
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

  async onSave() {
    if (this.data.saving) return

    const payload = {
      ...this.data.form,
      weightKg: Number(this.data.form.weightKg),
      dailyMeals: Number(this.data.form.dailyMeals),
      dailyActivityHours: activityHoursValue(this.data.form.dailyActivityHours)
    }

    this.setData({
      saving: true,
      birthDateError: '',
      breedError: '',
      dailyActivityHoursError: ''
    })

    try {
      dogService.validateDog(dogService.normalizeDog(payload))
      await dogService.createDog(payload)
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
      const fieldErrors = profileErrors(error.message)
      this.setData(fieldErrors)
      if (!fieldErrors.birthDateError && !fieldErrors.breedError && !fieldErrors.dailyActivityHoursError) {
        wx.showToast({ title: error.message, icon: 'none' })
      }
    } finally {
      this.setData({ saving: false })
    }
  }
})
