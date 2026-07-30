const dogService = require('../../../services/dogService')
const authService = require('../../../services/authService')
const {
  evaluateSharedMealDogEligibility
} = require('../services/sharedMealDogEligibility')
const {
  restoreDraft,
  refreshDraftDog,
  saveDogSelectionDraft
} = require('../services/sharedMealDraftService')

const REASON_TEXT = {
  under_eight_weeks: '狗狗还不到 8 周，不适合使用当前自动创建流程。',
  diagnosed_disease: '已确诊疾病需要兽医或宠物营养专业人士提供针对性建议。',
  pregnant: '妊娠期需要兽医或宠物营养专业人士提供针对性建议。',
  lactating: '哺乳期需要兽医或宠物营养专业人士提供针对性建议。',
  therapeutic_weight_loss: '治疗性减重需要专业人士制定方案。',
  therapeutic_weight_gain: '治疗性增重需要专业人士制定方案。'
}

function draftIdFromOptions(options = {}) {
  if (options.draftId) return String(options.draftId)
  const restored = restoreDraft()
  return restored.status === 'restored'
    ? restored.draft.id
    : `shared-meal-${Date.now()}`
}

Page({
  data: {
    draftId: '',
    dogs: [],
    loading: true,
    errorText: '',
    blockedText: ''
  },

  onLoad(options) {
    const draftId = draftIdFromOptions(options)
    const restored = restoreDraft(draftId)
    this.resumeExistingDraft = !options.draftId
      && restored.status === 'restored'
      && restored.draft.humanMenus.length > 0
    this.didAutoContinue = false
    this.setData({ draftId })
  },

  async onShow() {
    this.hasNavigated = false
    this.setData({ loading: true, errorText: '', blockedText: '' })
    try {
      if (authService.getAuthState() === 'guest' && !(await authService.login())) {
        this.setData({ loading: false, errorText: '登录失败，请稍后重试。' })
        return
      }
      const dogs = (await dogService.listDogs()).map((dog) => ({
        ...dog,
        eligibility: evaluateSharedMealDogEligibility(dog)
      }))
      const restored = restoreDraft(this.data.draftId)
      let currentDog = null
      if (restored.status === 'restored') {
        currentDog = dogs.find((dog) => dog.id === restored.draft.dog.id)
        if (currentDog) refreshDraftDog(currentDog)
      }
      this.setData({ dogs, loading: false })

      if (
        this.resumeExistingDraft
        && currentDog
        && currentDog.eligibility.status === 'eligible'
      ) {
        this.resumeExistingDraft = false
        this.hasNavigated = true
        wx.navigateTo({
          url: `/subpackages/shared-meal/compose/index?draftId=${encodeURIComponent(this.data.draftId)}`
        })
        return
      }

      const eligibleDogs = dogs.filter((dog) => dog.eligibility.status === 'eligible')
      if (!this.didAutoContinue && dogs.length === 1 && eligibleDogs.length === 1) {
        this.didAutoContinue = true
        this.continueWithDog(eligibleDogs.find(Boolean))
      }
    } catch (error) {
      this.setData({
        loading: false,
        errorText: '狗狗档案加载失败，请稍后重试。'
      })
    }
  },

  onDogTap(event) {
    const dog = this.data.dogs.find((item) => item.id === event.currentTarget.dataset.id)
    if (dog) this.continueWithDog(dog)
  },

  continueWithDog(dog) {
    if (this.hasNavigated) return
    const eligibility = dog.eligibility || evaluateSharedMealDogEligibility(dog)
    if (eligibility.status === 'blocked') {
      this.setData({
        blockedText: eligibility.reasonCodes.map((code) => REASON_TEXT[code]).filter(Boolean).join(' ')
      })
      return
    }

    const draft = saveDogSelectionDraft(dog, this.data.draftId)
    this.hasNavigated = true
    if (eligibility.status === 'incomplete') {
      const returnUrl = `/subpackages/shared-meal/dog-select/index?draftId=${draft.id}`
      wx.navigateTo({
        url: `/subpackages/dog-profile/dog-edit/index?id=${encodeURIComponent(dog.id)}&redirect=${encodeURIComponent(returnUrl)}`
      })
      return
    }
    wx.navigateTo({
      url: `/subpackages/shared-meal/menu-search/index?draftId=${encodeURIComponent(draft.id)}`
    })
  },

  onCreateDog() {
    const returnUrl = `/subpackages/shared-meal/dog-select/index?draftId=${this.data.draftId}`
    wx.navigateTo({
      url: `/subpackages/dog-profile/dog-quick-create/index?redirect=${encodeURIComponent(returnUrl)}`
    })
  }
})
