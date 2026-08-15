const dogService = require('../../../services/dogService')
const authService = require('../../../services/authService')
const {
  evaluateSharedMealDogEligibility
} = require('../services/sharedMealDogEligibility')
const {
  restoreDraft,
  getDraftRecoveryDecision,
  continueDraftRecovery,
  restartDraftRecovery,
  refreshDraftDog,
  saveDogSelectionDraft
} = require('../services/sharedMealDraftService')

const REASON_TEXT = {
  under_eight_weeks: '爱宠还不到 8 周，不适合使用当前自动创建流程。',
  diagnosed_disease: '已确诊疾病需要兽医或宠物营养专业人士提供针对性建议。',
  pregnant: '妊娠期需要兽医或宠物营养专业人士提供针对性建议。',
  lactating: '哺乳期需要兽医或宠物营养专业人士提供针对性建议。',
  therapeutic_weight_loss: '治疗性减重需要专业人士制定方案。',
  therapeutic_weight_gain: '治疗性增重需要专业人士制定方案。'
}

function createDraftId() {
  return `shared-meal-${Date.now()}`
}

function formatRecoveryMenuSummary(humanMenus = []) {
  const titles = humanMenus.map((menu) => String(menu && menu.title || '').trim()).filter(Boolean)
  if (!titles.length) return '已选菜单待确认'
  return `已选 ${titles.length} 道菜 · ${titles.join('、')}`
}

function formatRecoveryTime(mealTime) {
  const date = new Date(mealTime)
  if (Number.isNaN(date.getTime())) return ''
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `草稿时间 ${month}月${day}日 ${hour}:${minute}`
}

Page({
  data: {
    draftId: '',
    skipHumanMenuSelection: false,
    dogs: [],
    loading: true,
    errorText: '',
    blockedText: '',
    recoveryStatus: 'none',
    recoveryVisible: false,
    recoveryDogName: '',
    recoveryMenuSummary: '',
    recoveryTimeText: ''
  },

  onLoad(options) {
    const explicitDraftId = options.draftId ? String(options.draftId) : ''
    const skipHumanMenuSelection = String(options.skipHumanMenu || '') === '1'
    const restored = explicitDraftId ? restoreDraft(explicitDraftId) : null
    this.resumeAfterProfileUpdate = Boolean(
      explicitDraftId
      && restored.status === 'restored'
      && restored.draft.humanMenus.length > 0
    )
    this.recoveryDecision = explicitDraftId || skipHumanMenuSelection
      ? { status: 'none', draft: null }
      : getDraftRecoveryDecision()
    this.recoveryExpectedId = this.recoveryDecision.status === 'resumable'
      ? this.recoveryDecision.draft.id
      : ''
    this.initialEntryPending = true
    this.recoveryDismissed = false
    this.didAutoContinue = false
    this.setData({
      draftId: explicitDraftId || this.recoveryExpectedId || createDraftId(),
      skipHumanMenuSelection,
      recoveryStatus: explicitDraftId || skipHumanMenuSelection ? 'none' : 'loading',
      recoveryVisible: !explicitDraftId && !skipHumanMenuSelection
    })
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
      }
      this.setData({ dogs, loading: false })

      if (!this.initialEntryPending) return
      this.initialEntryPending = false

      if (this.recoveryDismissed) return

      if (this.resumeAfterProfileUpdate) {
        this.continueAfterProfileUpdate(restored, currentDog)
        return
      }

      if (this.recoveryDecision.status === 'resumable') {
        const draft = this.recoveryDecision.draft
        this.setData({
          draftId: draft.id,
          recoveryStatus: 'resumable',
          recoveryVisible: true,
          recoveryDogName: String(draft.dog.name || '这只爱宠'),
          recoveryMenuSummary: formatRecoveryMenuSummary(draft.humanMenus),
          recoveryTimeText: formatRecoveryTime(draft.mealTime)
        })
        return
      }

      if (this.recoveryDecision.status === 'invalid') {
        this.setData({
          recoveryStatus: 'invalid',
          recoveryVisible: true
        })
        return
      }

      this.setData({ recoveryStatus: 'none', recoveryVisible: false })
      const eligibleDogs = dogs.filter((dog) => dog.eligibility.status === 'eligible')
      if (!this.didAutoContinue && dogs.length === 1 && eligibleDogs.length === 1) {
        this.didAutoContinue = true
        this.continueWithDog(eligibleDogs.find(Boolean))
      }
    } catch (error) {
      this.setData({
        loading: false,
        errorText: '爱宠档案加载失败，请稍后重试。'
      })
    }
  },

  continueAfterProfileUpdate(restored, currentDog) {
    if (restored.status !== 'restored' || !currentDog) {
      this.setData({ errorText: '没有找到草稿对应的爱宠档案，请重新选择。' })
      return
    }
    if (currentDog.eligibility.status === 'blocked') {
      this.setData({
        blockedText: currentDog.eligibility.reasonCodes
          .map((code) => REASON_TEXT[code])
          .filter(Boolean)
          .join(' ')
      })
      return
    }
    if (currentDog.eligibility.status === 'incomplete') {
      this.setData({ errorText: '爱宠档案仍需完善，请检查后再继续。' })
      return
    }
    refreshDraftDog(currentDog)
    this.hasNavigated = true
    wx.navigateTo({
      url: `/subpackages/shared-meal/compose/index?draftId=${encodeURIComponent(restored.draft.id)}`
    })
  },

  onRecoverySheetTap() {},

  onCloseRecovery() {
    this.didAutoContinue = true
    this.recoveryDismissed = true
    this.recoveryExpectedId = ''
    this.setData({
      draftId: createDraftId(),
      recoveryStatus: 'none',
      recoveryVisible: false
    })
  },

  onContinueRecovery() {
    if (this.hasNavigated) return
    const draft = continueDraftRecovery(this.recoveryExpectedId || this.data.draftId)
    if (!draft) {
      this.setData({ recoveryStatus: 'invalid', recoveryVisible: true })
      return
    }
    const currentDog = this.data.dogs.find((dog) => dog.id === draft.dog.id)
    if (!currentDog || currentDog.eligibility.status === 'blocked') {
      this.recoveryExpectedId = draft.id
      this.setData({ recoveryStatus: 'invalid', recoveryVisible: true })
      return
    }
    refreshDraftDog(currentDog)
    this.didAutoContinue = true
    this.hasNavigated = true
    if (currentDog.eligibility.status === 'incomplete') {
      const returnUrl = `/subpackages/shared-meal/dog-select/index?draftId=${draft.id}`
      wx.navigateTo({
        url: `/subpackages/dog-profile/dog-edit/index?id=${encodeURIComponent(currentDog.id)}&redirect=${encodeURIComponent(returnUrl)}`
      })
      return
    }
    wx.navigateTo({
      url: `/subpackages/shared-meal/compose/index?draftId=${encodeURIComponent(draft.id)}`
    })
  },

  onRestartRecovery() {
    restartDraftRecovery(this.recoveryExpectedId || undefined)
    this.didAutoContinue = true
    this.recoveryExpectedId = ''
    this.setData({
      draftId: createDraftId(),
      recoveryStatus: 'none',
      recoveryVisible: false
    })
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
      const skipHumanMenuParam = this.data.skipHumanMenuSelection ? '&skipHumanMenu=1' : ''
      const returnUrl = `/subpackages/shared-meal/dog-select/index?draftId=${draft.id}${skipHumanMenuParam}`
      wx.navigateTo({
        url: `/subpackages/dog-profile/dog-edit/index?id=${encodeURIComponent(dog.id)}&redirect=${encodeURIComponent(returnUrl)}`
      })
      return
    }
    wx.navigateTo({
      url: this.data.skipHumanMenuSelection
        ? `/subpackages/shared-meal/compose/index?draftId=${encodeURIComponent(draft.id)}`
        : `/subpackages/shared-meal/menu-search/index?draftId=${encodeURIComponent(draft.id)}`
    })
  },

  onCreateDog() {
    const skipHumanMenuParam = this.data.skipHumanMenuSelection ? '&skipHumanMenu=1' : ''
    const returnUrl = `/subpackages/shared-meal/dog-select/index?draftId=${this.data.draftId}${skipHumanMenuParam}`
    wx.navigateTo({
      url: `/subpackages/dog-profile/dog-quick-create/index?redirect=${encodeURIComponent(returnUrl)}`
    })
  }
})

module.exports = {
  formatRecoveryMenuSummary,
  formatRecoveryTime
}
