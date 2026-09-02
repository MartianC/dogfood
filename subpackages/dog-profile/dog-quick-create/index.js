const dogService = require('../../../services/dogService')
const authService = require('../../../services/authService')
const fileService = require('../services/fileService')
const {
  breedOptions,
  dailyMealOptions,
  activityDurationBands,
  bodyConditionOptions,
  reproductiveStatusOptions
} = require('../data/options')
const { estimateLifeStage } = require('../../../services/lifeStageEstimator')
const { deriveActivityLevel } = require('../../../services/dogProfileDerivations')
const assets = require('../../../utils/assets')

const onboardingBodyConditionOptions = ['ideal', 'thin', 'overweight']
  .map((value) => bodyConditionOptions.find((item) => item.value === value))

function navigationMetrics() {
  const fallbackStatusBarHeight = 20
  const fallbackNavigationContentHeight = 44
  let windowInfo = {}
  let menuButton = {}

  if (typeof wx !== 'undefined') {
    try {
      windowInfo = typeof wx.getWindowInfo === 'function'
        ? wx.getWindowInfo()
        : (typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : {})
      menuButton = typeof wx.getMenuButtonBoundingClientRect === 'function'
        ? wx.getMenuButtonBoundingClientRect()
        : {}
    } catch (error) {
      windowInfo = {}
      menuButton = {}
    }
  }

  const statusBarHeightPx = Number(windowInfo.statusBarHeight) || fallbackStatusBarHeight
  const menuTop = Number(menuButton.top)
  const menuHeight = Number(menuButton.height)
  const hasMenuMetrics = menuTop >= statusBarHeightPx && menuHeight > 0
  const navigationContentHeight = hasMenuMetrics
    ? (menuTop - statusBarHeightPx) * 2 + menuHeight
    : fallbackNavigationContentHeight
  const navigationBarHeightPx = statusBarHeightPx + navigationContentHeight

  return {
    statusBarHeightPx,
    navigationBarHeightPx,
    pageTopPaddingPx: navigationBarHeightPx + 8
  }
}

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
    dailyMealsError: /每日餐数/.test(message) ? message : '',
    dailyActivityHoursError: /活动时长/.test(message) ? message : '',
    weightError: /体重/.test(message) ? message : '',
    genderError: /性别/.test(message) ? message : ''
  }
}

function stepState(step) {
  const states = {
    2: { stepText: '1 / 4' },
    3: { stepText: '2 / 4' },
    4: { stepText: '3 / 4' },
    5: { stepText: '4 / 4' }
  }
  return states[step] || states[2]
}

function payloadFromForm(form) {
  return {
    ...form,
    weightKg: Number(form.weightKg),
    dailyMeals: Number(form.dailyMeals),
    dailyActivityHours: Number(form.dailyActivityHours),
    specialNutritionNeeds: {
      ...(form.specialNutritionNeeds || {}),
      reproductiveStatus: form.specialNutritionNeeds && form.specialNutritionNeeds.reproductiveStatus
    }
  }
}

const initialStep = 2
const initialForm = {
  name: '',
  birthDate: '',
  breed: '',
  gender: 'female',
  weightKg: '',
  dailyMeals: 1,
  dailyActivityHours: 1.5,
  activityLevel: 'moderateLowImpact',
  bodyCondition: 'ideal',
  neutered: null,
  avatarUrl: '',
  dietGoal: 'daily',
  specialNutritionNeeds: {
    hasDisease: null,
    reproductiveStatus: 'none',
    therapeuticWeightManagement: null
  },
  allergens: [],
  avoidIngredients: []
}

Page({
  data: {
    ...navigationMetrics(),
    redirect: '',
    step: initialStep,
    ...stepState(initialStep),
    form: initialForm,
    breedOptions,
    dailyMealOptions,
    bodyConditionOptions: onboardingBodyConditionOptions,
    reproductiveStatusOptions,
    breedLabel: '',
    activityLevelLabel: activityLabel(initialForm.activityLevel),
    activityThumbLeft: initialForm.dailyActivityHours / 6 * 100,
    lifeStageLabel: '阶段待完善',
    nameError: '',
    breedError: '',
    birthDateError: '',
    genderError: '',
    weightError: '',
    neuteredError: '',
    dailyMealsError: '',
    dailyActivityHoursError: '',
    bodyConditionError: '',
    reproductiveStatusError: '',
    today: localDateText(),
    saving: false,
    defaultDogAvatar: assets.defaultDogAvatar
  },

  onLoad(options) {
    this.setData({ redirect: decodeURIComponent(options.redirect || '') })
  },

  setField(event) {
    const key = event.currentTarget.dataset.key
    const value = event.detail.value
    this.setData({
      [`form.${key}`]: value,
      [`${key}Error`]: ''
    })
  },

  onBirthDate(event) {
    const birthDate = event.detail.value
    const stage = estimateLifeStage({ birthDate })
    this.setData({
      'form.birthDate': birthDate,
      lifeStageLabel: stage.label,
      birthDateError: stage.reason === 'future_birth_date' ? '出生日期不能晚于今天' : ''
    })
  },

  applyBreed(value) {
    const option = this.data.breedOptions.find((item) => item.value === value)
    if (!option) return
    this.setData({
      'form.breed': option.value,
      breedLabel: option.label,
      breedError: ''
    })
  },

  onChooseBreed() {
    wx.navigateTo({
      url: '/subpackages/dog-profile/breed-select/index?selected=' + encodeURIComponent(this.data.form.breed || ''),
      events: {
        breedSelected: (payload) => this.applyBreed(payload.value)
      }
    })
  },

  onGender(event) {
    this.setData({
      'form.gender': event.currentTarget.dataset.value,
      genderError: ''
    })
  },

  onNeutered(event) {
    this.setData({
      'form.neutered': event.currentTarget.dataset.value === 'true',
      neuteredError: ''
    })
  },

  onActivityHours(event) {
    const dailyActivityHours = Number(event.detail.value)
    const activityLevel = deriveActivityLevel(dailyActivityHours)
    this.setData({
      'form.activityLevel': activityLevel,
      'form.dailyActivityHours': dailyActivityHours,
      activityLevelLabel: activityLabel(activityLevel),
      activityThumbLeft: dailyActivityHours / 6 * 100,
      dailyActivityHoursError: ''
    })
  },

  onDailyMeals(event) {
    this.setData({
      'form.dailyMeals': Number(event.currentTarget.dataset.value),
      dailyMealsError: ''
    })
  },

  onBodyCondition(event) {
    this.setData({
      'form.bodyCondition': event.currentTarget.dataset.value,
      bodyConditionError: ''
    })
  },

  onSpecialNutritionNeed(event) {
    const { key, value } = event.currentTarget.dataset
    this.setData({
      [`form.specialNutritionNeeds.${key}`]: value,
      reproductiveStatusError: ''
    })
  },

  async onChooseAvatar(event) {
    const tempFilePath = event && event.detail && event.detail.avatarUrl
    if (!tempFilePath) return
    try {
      const avatarUrl = await fileService.saveLocalImage(tempFilePath)
      this.setData({ 'form.avatarUrl': avatarUrl })
    } catch (error) {
      wx.showToast({ title: '头像保存失败，请重试', icon: 'none' })
    }
  },

  validateStep() {
    const form = this.data.form
    const errors = {}

    if (this.data.step === 2) {
      if (!String(form.name || '').trim()) errors.nameError = '请填写宠物姓名'
      if (!form.breed) errors.breedError = '请选择宠物品种'
    }

    if (this.data.step === 3) {
      const stage = estimateLifeStage({ birthDate: form.birthDate })
      if (!form.birthDate || stage.reason === 'invalid_birth_date') {
        errors.birthDateError = '请填写正确的出生日期'
      } else if (stage.reason === 'future_birth_date') {
        errors.birthDateError = '出生日期不能晚于今天'
      }
      if (!['female', 'male'].includes(form.gender)) errors.genderError = '请选择狗狗性别'
      if (!(Number(form.weightKg) > 0)) errors.weightError = '请填写狗狗体重'
      if (form.neutered === null) errors.neuteredError = '请选择绝育状态'
    }

    if (this.data.step === 4) {
      const dailyActivityHours = Number(form.dailyActivityHours)
      if (form.dailyActivityHours === '' || form.dailyActivityHours === null ||
        !Number.isFinite(dailyActivityHours) || dailyActivityHours < 0 || dailyActivityHours > 6) {
        errors.dailyActivityHoursError = '请选择活动水平'
      }
      if (![1, 2].includes(Number(form.dailyMeals))) {
        errors.dailyMealsError = '请选择每日餐数'
      }
      if (!['thin', 'ideal', 'overweight'].includes(form.bodyCondition)) {
        errors.bodyConditionError = '请选择体况'
      }
      if (!['none', 'pregnant', 'lactating'].includes(form.specialNutritionNeeds.reproductiveStatus)) {
        errors.reproductiveStatusError = '请选择生殖状态'
      }
    }

    this.setData(errors)
    return Object.keys(errors).length === 0
  },

  onNext() {
    if (this.data.step === 5) return this.onLoginAndCreate()
    if (!this.validateStep()) return
    const step = this.data.step + 1
    this.setData({ step, ...stepState(step) })
  },

  onPrevious() {
    if (this.data.saving) return
    if (this.data.step === 2) {
      wx.navigateBack()
      return
    }
    const step = this.data.step - 1
    this.setData({ step, ...stepState(step) })
  },

  async onLoginAndCreate() {
    if (this.data.saving || this.data.step !== 5) return
    if (!this.validateStep()) return

    this.setData({ saving: true })
    try {
      const loggedIn = authService.getAuthState() === 'guest'
        ? await authService.login()
        : true
      if (!loggedIn) return

      const payload = payloadFromForm(this.data.form)
      dogService.validateDog(dogService.normalizeDog(payload))
      await dogService.createDog(payload)
      this.redirectAfterCreation()
    } catch (error) {
      const fieldErrors = profileErrors(error.message || '')
      this.setData(fieldErrors)
      if (!Object.values(fieldErrors).some(Boolean)) {
        wx.showToast({ title: error.message || '建档失败，请重试', icon: 'none' })
      }
    } finally {
      this.setData({ saving: false })
    }
  },

  redirectAfterCreation() {
    if (!this.data.redirect) {
      wx.switchTab({ url: '/pages/home/index' })
      return
    }
    const recipeMatch = this.data.redirect.match(/^\/pages\/recipes\/detail\/index\?id=([^&]+)/)
    if (recipeMatch) {
      wx.redirectTo({ url: `/subpackages/plan-extra/period/index?recipeId=${recipeMatch[1]}` })
      return
    }
    wx.redirectTo({ url: this.data.redirect })
  },

  onSave() {
    return this.data.step === 5 ? this.onLoginAndCreate() : this.onNext()
  }
})
