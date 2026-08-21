const STATUS_LABELS = {
  met: '满足',
  low: '偏低',
  high: '偏高',
  unavailable: '无法评估',
  not_specified: '未规定'
}

const EXPANDED_PANEL_ANIMATION_MS = 320
const SWIPE_CLOSE_DISTANCE = 48
const SCROLL_TOP_THRESHOLD = 2

function touchYOf(touch) {
  if (!touch) return NaN
  const clientY = Number(touch.clientY)
  return Number.isFinite(clientY) ? clientY : Number(touch.pageY)
}

function shortProfileName(standard) {
  const name = String(standard.profileName || '')
  if (standard.key === 'gb' && standard.profileCode === 'growth_gestation_lactation') return '幼犬及繁殖期犬粮'
  if (standard.key === 'fediaf') {
    if (/adult_mer_95/.test(standard.profileCode)) return '成年犬 · MER 95'
    if (/adult_mer_110/.test(standard.profileCode)) return '成年犬 · MER 110'
    if (/early_growth/.test(standard.profileCode)) return '早期生长与繁殖期'
    if (/late_growth/.test(standard.profileCode)) return '晚期生长'
  }
  return name
}

function formatValue(value, unit) {
  if (!Number.isFinite(value)) return '数据不足'
  const normalizedUnit = String(unit || '').trim()
  const valueText = normalizedUnit === '%'
    ? `${value}%`
    : `${value} ${normalizedUnit}`.trim()
  return valueText
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return ''
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}

function formatKcal(value) {
  const number = formatNumber(value)
  return number ? `${number} kcal` : ''
}

function formatTarget(target) {
  if (!target || !Number.isFinite(target.min) || !Number.isFinite(target.max)) return ''
  if (Math.abs(target.max - target.min) < 0.01) return formatKcal(target.min)
  return `${formatNumber(target.min)}–${formatNumber(target.max)} kcal`
}

function scaleSuggestionView(suggestion) {
  if (!suggestion || !suggestion.available) return { available: false }
  const scale = Number(suggestion.scale)
  return {
    ...suggestion,
    rawSuggestedIngredients: suggestion.suggestedIngredients || [],
    currentTotalGramText: `${formatNumber(suggestion.currentTotalGram)} g`,
    suggestedTotalGramText: `${formatNumber(suggestion.suggestedTotalGram)} g`,
    targetKcalText: formatKcal(suggestion.targetRange && suggestion.targetRange.min),
    suggestedIngredients: (suggestion.suggestedIngredients || []).map((item) => ({
      ...item,
      currentGramText: Number.isFinite(scale) && scale > 0
        ? `${formatNumber(Number(item.perMealAmountGram) / scale)} g`
        : '',
      suggestedGramText: `${formatNumber(Number(item.perMealAmountGram))} g`
    }))
  }
}

function energyView(energy = {}) {
  const currentKcalText = formatKcal(energy.currentKcal)
  const knownKcalText = Number(energy.knownKcal) > 0 ? formatKcal(energy.knownKcal) : ''
  const mealTargetText = formatTarget(energy.mealTarget)
  const rangeStartText = energy.mealTarget
    && Number.isFinite(energy.mealTarget.min)
    && Number.isFinite(energy.mealTarget.max)
    && energy.mealTarget.max > energy.mealTarget.min
    ? `高活动目标为范围，建议先从下界 ${formatKcal(energy.mealTarget.min)} 作为起始参考。`
    : ''
  return {
    ...energy,
    currentKcalText,
    knownKcalText,
    mealTargetText,
    rangeStartText,
    dailyTargetText: formatTarget(energy.dailyTarget),
    summaryText: energy.available
      ? `当前约 ${currentKcalText} · 估算目标 ${mealTargetText}`
      : knownKcalText
        ? `已知食材至少提供 ${knownKcalText}`
        : (energy.statusLabel || '暂无法判断本餐份量'),
    scaleSuggestion: scaleSuggestionView(energy.scaleSuggestion)
  }
}

function standardView(standard) {
  return {
    ...standard,
    shortProfileName: shortProfileName(standard),
    lowItems: (standard.lowItems || []).map((item) => ({
      ...item,
      currentText: formatValue(item.currentValue, item.unit)
    })),
    highItems: (standard.highItems || []).map((item) => ({
      ...item,
      currentText: formatValue(item.currentValue, item.unit),
      contributorsText: (item.contributors || []).map((entry) => `${entry.ingredientName} ${entry.percent}%`).join(' · ')
    }))
  }
}

function elementView(element) {
  return {
    ...element,
    currentText: formatValue(element.currentValue, element.currentUnit),
    gbStatusLabel: STATUS_LABELS[element.gb.status] || element.gb.status,
    fediafStatusLabel: STATUS_LABELS[element.fediaf.status] || element.fediaf.status
  }
}

Component({
  properties: {
    assessment: { type: Object, value: null },
    expanded: { type: Boolean, value: false },
    loading: { type: Boolean, value: false },
    compact: { type: Boolean, value: false }
  },

  data: {
    viewAssessment: null,
    expandedMounted: false,
    expandedPhase: 'closed',
    profileSelectorVisible: false,
    profileSelectorKey: '',
    profileSelectorTitle: '',
    profileOptions: [],
    pendingProfileCode: '',
    scalePreviewVisible: false,
    elementsVisible: false,
    elementFilter: 'all',
    filteredElements: []
  },

  observers: {
    expanded(value) {
      if (this.expandedCloseTimer) {
        clearTimeout(this.expandedCloseTimer)
        this.expandedCloseTimer = null
      }

      if (value) {
        this.expandedScrollTop = 0
        this.expandedTouchStartY = 0
        this.expandedTouchStartScrollTop = 0
        this.expandedTouchCloseTriggered = false
        this.setData({
          expandedMounted: true,
          expandedPhase: 'opening'
        }, () => {
          if (this.properties.expanded) this.setData({ expandedPhase: 'open' })
        })
        return
      }

      if (!this.data.expandedMounted) return
      this.setData({ expandedPhase: 'closing' })
      this.expandedCloseTimer = setTimeout(() => {
        if (!this.properties.expanded) {
          this.expandedScrollTop = 0
          this.expandedTouchStartY = 0
          this.expandedTouchStartScrollTop = 0
          this.expandedTouchCloseTriggered = false
          this.setData({
            expandedMounted: false,
            expandedPhase: 'closed'
          })
        }
        this.expandedCloseTimer = null
      }, EXPANDED_PANEL_ANIMATION_MS)
    },

    assessment(value) {
      if (!value) {
        this.setData({ viewAssessment: null, filteredElements: [], scalePreviewVisible: false })
        return
      }
      const density = value.nutritionDensity || {}
      const lifeStage = value.lifeStage || {}
      const energy = energyView(value.energy)
      const needsProfileCompletion = (
        (!lifeStage.available && lifeStage.reason !== 'under_minimum_age')
        || (!energy.available && !energy.mealTarget && !(energy.missingIngredients || []).length)
      )
      const viewAssessment = {
        ...value,
        energy,
        needsProfileCompletion,
        profileActionLabel: ['invalid_birth_date', 'future_birth_date'].includes(lifeStage.reason)
          ? '完善出生日期'
          : ['breed_estimate_unavailable', 'breed_estimate_inconsistent'].includes(energy.reason)
            ? '完善狗狗品种'
            : '完善狗狗档案',
        nutritionDensity: {
          ...density,
          standards: (density.standards || []).map(standardView),
          elements: (density.elements || []).map(elementView)
        }
      }
      this.setData({ viewAssessment }, () => this.applyElementFilter())
    }
  },

  methods: {
    onProfileSheetTap() {},

    onScaleSheetTap() {},

    onToggle() {
      this.triggerEvent('toggle', { expanded: !this.properties.expanded })
    },

    onExpandedScroll(event) {
      const scrollTop = Number(event.detail && event.detail.scrollTop)
      this.expandedScrollTop = Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0
    },

    onExpandedTouchStart(event) {
      const touch = event.touches && event.touches[0]
      if (!touch) return
      this.expandedTouchStartY = touchYOf(touch)
      this.expandedTouchStartScrollTop = this.expandedScrollTop || 0
      this.expandedTouchCloseTriggered = false
    },

    onExpandedTouchMove(event) {
      const touch = event.touches && event.touches[0]
      const startY = Number(this.expandedTouchStartY)
      const startScrollTop = Number(this.expandedTouchStartScrollTop)
      if (!touch || !Number.isFinite(startY) || this.expandedTouchCloseTriggered) return

      if (
        startScrollTop <= SCROLL_TOP_THRESHOLD
        && touchYOf(touch) - startY >= SWIPE_CLOSE_DISTANCE
      ) {
        this.expandedTouchCloseTriggered = true
        this.onToggle()
      }
    },

    onExpandedTouchEnd() {
      this.expandedTouchStartY = 0
      this.expandedTouchStartScrollTop = 0
      this.expandedTouchCloseTriggered = false
    },

    onExpandedTouchCancel() {
      this.expandedTouchStartY = 0
      this.expandedTouchStartScrollTop = 0
      this.expandedTouchCloseTriggered = false
    },

    onOpenProfileSelector(event) {
      const key = event.currentTarget.dataset.key
      const standard = (this.data.viewAssessment.nutritionDensity.standards || []).find((item) => item.key === key)
      if (!standard) return
      this.setData({
        profileSelectorVisible: true,
        profileSelectorKey: key,
        profileSelectorTitle: key === 'gb' ? '选择国标参考档案' : '选择 FEDIAF 参考档案',
        profileOptions: standard.profileOptions || [],
        pendingProfileCode: standard.profileCode
      })
    },

    onSelectProfile(event) {
      this.setData({ pendingProfileCode: event.currentTarget.dataset.code })
    },

    onCloseProfileSelector() {
      this.setData({ profileSelectorVisible: false })
    },

    onApplyProfile() {
      this.triggerEvent('profilechange', {
        key: this.data.profileSelectorKey,
        profileCode: this.data.pendingProfileCode
      })
      this.setData({ profileSelectorVisible: false })
    },

    onLowAction(event) {
      const standardKey = event.currentTarget.dataset.standard
      const code = event.currentTarget.dataset.code
      const standard = this.data.viewAssessment.nutritionDensity.standards.find((item) => item.key === standardKey)
      const item = standard && standard.lowItems.find((entry) => entry.code === code)
      this.triggerEvent('nutrientselect', { standardKey, item })
    },

    onHighAction(event) {
      const standardKey = event.currentTarget.dataset.standard
      const code = event.currentTarget.dataset.code
      const standard = this.data.viewAssessment.nutritionDensity.standards.find((item) => item.key === standardKey)
      const item = standard && standard.highItems.find((entry) => entry.code === code)
      this.triggerEvent('adjustingredients', { standardKey, item })
    },

    onToggleElements() {
      this.setData({ elementsVisible: !this.data.elementsVisible })
    },

    onRetry() {
      this.triggerEvent('retry')
    },

    onCompleteProfile() {
      this.triggerEvent('completeprofile')
    },

    onOpenScalePreview() {
      const suggestion = this.data.viewAssessment
        && this.data.viewAssessment.energy
        && this.data.viewAssessment.energy.scaleSuggestion
      if (!suggestion || !suggestion.available) return
      this.setData({ scalePreviewVisible: true })
    },

    onCloseScalePreview() {
      this.setData({ scalePreviewVisible: false })
    },

    onConfirmScalePreview() {
      const suggestion = this.data.viewAssessment
        && this.data.viewAssessment.energy
        && this.data.viewAssessment.energy.scaleSuggestion
      if (!suggestion || !suggestion.available) return
      this.triggerEvent('scaleconfirm', { ingredients: suggestion.rawSuggestedIngredients })
      this.setData({ scalePreviewVisible: false })
    },

    onElementFilter(event) {
      this.setData({ elementFilter: event.currentTarget.dataset.filter }, () => this.applyElementFilter())
    },

    applyElementFilter() {
      const assessment = this.data.viewAssessment
      if (!assessment) return
      const filter = this.data.elementFilter
      const filteredElements = (assessment.nutritionDensity.elements || []).filter((item) => {
        const statuses = [item.gb.status, item.fediaf.status]
        if (filter === 'adjust') return statuses.includes('low') || statuses.includes('high')
        if (filter === 'met') return statuses.includes('met') && !statuses.includes('low') && !statuses.includes('high')
        if (filter === 'unavailable') return statuses.includes('unavailable')
        return true
      })
      this.setData({ filteredElements })
    }
  },

  lifetimes: {
    attached() {
      if (this.properties.expanded) {
        this.expandedScrollTop = 0
        this.expandedTouchStartY = 0
        this.expandedTouchStartScrollTop = 0
        this.expandedTouchCloseTriggered = false
        this.setData({
          expandedMounted: true,
          expandedPhase: 'open'
        })
      }
    },

    detached() {
      if (this.expandedCloseTimer) clearTimeout(this.expandedCloseTimer)
    }
  }
})
