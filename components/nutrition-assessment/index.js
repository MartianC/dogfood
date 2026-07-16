const STATUS_LABELS = {
  met: '满足',
  low: '偏低',
  high: '偏高',
  unavailable: '无法评估',
  not_specified: '未规定'
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
  return Number.isFinite(value) ? `${value} ${unit || ''}`.trim() : '数据不足'
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
    loading: { type: Boolean, value: false }
  },

  data: {
    viewAssessment: null,
    profileSelectorVisible: false,
    profileSelectorKey: '',
    profileSelectorTitle: '',
    profileOptions: [],
    pendingProfileCode: '',
    elementsVisible: false,
    elementFilter: 'all',
    filteredElements: []
  },

  observers: {
    assessment(value) {
      if (!value) {
        this.setData({ viewAssessment: null, filteredElements: [] })
        return
      }
      const viewAssessment = {
        ...value,
        standards: (value.standards || []).map(standardView),
        elements: (value.elements || []).map(elementView)
      }
      this.setData({ viewAssessment }, () => this.applyElementFilter())
    }
  },

  methods: {
    onProfileSheetTap() {},

    onToggle() {
      this.triggerEvent('toggle', { expanded: !this.properties.expanded })
    },

    onOpenProfileSelector(event) {
      const key = event.currentTarget.dataset.key
      const standard = (this.data.viewAssessment.standards || []).find((item) => item.key === key)
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
      const standard = this.data.viewAssessment.standards.find((item) => item.key === standardKey)
      const item = standard && standard.lowItems.find((entry) => entry.code === code)
      this.triggerEvent('nutrientselect', { standardKey, item })
    },

    onHighAction(event) {
      const standardKey = event.currentTarget.dataset.standard
      const code = event.currentTarget.dataset.code
      const standard = this.data.viewAssessment.standards.find((item) => item.key === standardKey)
      const item = standard && standard.highItems.find((entry) => entry.code === code)
      this.triggerEvent('adjustingredients', { standardKey, item })
    },

    onToggleElements() {
      this.setData({ elementsVisible: !this.data.elementsVisible })
    },

    onRetry() {
      this.triggerEvent('retry')
    },

    onElementFilter(event) {
      this.setData({ elementFilter: event.currentTarget.dataset.filter }, () => this.applyElementFilter())
    },

    applyElementFilter() {
      const assessment = this.data.viewAssessment
      if (!assessment) return
      const filter = this.data.elementFilter
      const filteredElements = (assessment.elements || []).filter((item) => {
        const statuses = [item.gb.status, item.fediaf.status]
        if (filter === 'adjust') return statuses.includes('low') || statuses.includes('high')
        if (filter === 'met') return statuses.includes('met') && !statuses.includes('low') && !statuses.includes('high')
        if (filter === 'unavailable') return statuses.includes('unavailable')
        return true
      })
      this.setData({ filteredElements })
    }
  }
})
