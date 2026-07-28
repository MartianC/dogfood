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

function optionIndex(options, value, fallback = 0) {
  const index = options.findIndex((item) => item.value === value)
  return index >= 0 ? index : fallback
}

function profileErrors(message) {
  return {
    birthDateError: /出生日期/.test(message) ? message : '',
    breedError: /品种/.test(message) ? message : '',
    dailyActivityHoursError: /活动时长/.test(message) ? message : ''
  }
}

function activityHoursValue(value, fallback = null) {
  if (value === '' || value === null || value === undefined) return fallback
  const hours = Number(value)
  return Number.isFinite(hours) ? hours : fallback
}

function formFromDog(dog, { defaultActivityHours = null } = {}) {
  const specialNutritionNeeds = dog.specialNutritionNeeds || {}
  return {
    name: dog.name || '',
    birthDate: dog.birthDate || '',
    breed: dog.breed || '',
    weightKg: dog.weightKg || '',
    dailyMeals: dog.dailyMeals || 2,
    dailyActivityHours: activityHoursValue(dog.dailyActivityHours, defaultActivityHours),
    bodyCondition: dog.bodyCondition || 'ideal',
    neutered: Boolean(dog.neutered),
    avatarUrl: dog.avatarUrl || '',
    dietGoal: dog.dietGoal || 'daily',
    specialNutritionNeeds: {
      hasDisease: Object.prototype.hasOwnProperty.call(specialNutritionNeeds, 'hasDisease')
        ? specialNutritionNeeds.hasDisease
        : null,
      reproductiveStatus: Object.prototype.hasOwnProperty.call(specialNutritionNeeds, 'reproductiveStatus')
        ? specialNutritionNeeds.reproductiveStatus
        : null,
      therapeuticWeightManagement: Object.prototype.hasOwnProperty.call(
        specialNutritionNeeds,
        'therapeuticWeightManagement'
      ) ? specialNutritionNeeds.therapeuticWeightManagement : null
    },
    allergens: Array.isArray(dog.allergens) ? dog.allergens : [],
    avoidIngredients: Array.isArray(dog.avoidIngredients) ? dog.avoidIngredients : []
  }
}

function profileState(form) {
  const stage = estimateLifeStage({ birthDate: form.birthDate })
  const estimate = estimateExpectedAdultWeight(form.breed)
  const activityLevel = deriveActivityLevel(form.dailyActivityHours)
  return {
    lifeStageLabel: stage.label,
    isPuppy: stage.available && stage.energyStage === 'puppy',
    expectedAdultWeightKg: estimate.expectedAdultWeightKg,
    adultWeightEstimateReason: estimate.adultWeightEstimateReason,
    activityLevel,
    activityLevelLabel: activityLabel(activityLevel),
    activityThumbLeft: form.dailyActivityHours === null ? 0 : Number(form.dailyActivityHours) / 6 * 100
  }
}

const initialForm = formFromDog({}, { defaultActivityHours: 1.5 })

Page({
  data: {
    id: '',
    redirect: '',
    form: initialForm,
    ...profileState(initialForm),
    breedOptions,
    dietGoalOptions,
    bodyConditionOptions,
    diseaseStatusOptions,
    reproductiveStatusOptions,
    therapeuticWeightManagementOptions,
    breedIndex: 0,
    goalIndex: 0,
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
    if (!options.id) return

    const dogs = await dogService.listDogs()
    const dog = dogs.find((item) => item.id === options.id)
    if (!dog) return

    const form = formFromDog(dog)
    this.setData({
      id: options.id,
      form,
      ...profileState(form),
      breedIndex: optionIndex(breedOptions, form.breed),
      goalIndex: optionIndex(dietGoalOptions, form.dietGoal)
    })
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
      if (this.data.id) await dogService.updateDog(this.data.id, payload)
      else await dogService.createDog(payload)
      wx.showToast({ title: '已保存', icon: 'success' })
      if (this.data.redirect) {
        wx.redirectTo({ url: this.data.redirect })
        return
      }
      setTimeout(() => wx.navigateBack(), 400)
    } catch (error) {
      const fieldErrors = profileErrors(error.message)
      this.setData(fieldErrors)
      if (!fieldErrors.birthDateError && !fieldErrors.breedError && !fieldErrors.dailyActivityHoursError) {
        wx.showToast({ title: error.message, icon: 'none' })
      }
    } finally {
      this.setData({ saving: false })
    }
  },

  async onDelete() {
    if (!this.data.id) return
    wx.showModal({
      title: '删除档案',
      content: '历史清单不会被删除，但后续不会再用该档案生成新清单。',
      success: async (result) => {
        if (!result.confirm) return
        await dogService.deleteDog(this.data.id)
        wx.navigateBack()
      }
    })
  }
})
