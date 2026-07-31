function pad(value) {
  return String(value).padStart(2, '0')
}

function localDateKey(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function dateKeyToLocalTimestamp(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ''))
  if (!match) return Date.now()
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime()
}

function calendarBounds(value) {
  const date = new Date(value)
  const anchor = Number.isNaN(date.getTime()) ? new Date() : date
  return {
    minDate: new Date(anchor.getFullYear(), anchor.getMonth() - 18, 1).getTime(),
    maxDate: new Date(anchor.getFullYear(), anchor.getMonth() + 19, 0, 23, 59, 59, 999).getTime()
  }
}

function createCalendarFormat(days) {
  const marked = new Set((Array.isArray(days) ? days : []).map((item) => item && item.dateKey).filter(Boolean))
  return (day) => {
    day.suffix = marked.has(localDateKey(day.date)) ? '已记' : ''
    return day
  }
}

Component({
  properties: {
    value: { type: String, value: '' },
    calendarDays: { type: Array, value: [] },
    loading: { type: Boolean, value: false }
  },

  data: {
    selectedTimestamp: Date.now(),
    minDate: 0,
    maxDate: 0,
    calendarFormat: createCalendarFormat([])
  },

  observers: {
    value(value) {
      const selectedTimestamp = dateKeyToLocalTimestamp(value)
      this.setData({ selectedTimestamp, ...calendarBounds(selectedTimestamp) })
    },

    calendarDays(days) {
      this.refreshCalendarFormat(days)
    }
  },

  lifetimes: {
    attached() {
      const selectedTimestamp = dateKeyToLocalTimestamp(this.data.value)
      this._calendarFormat = createCalendarFormat(this.data.calendarDays)
      this.setData({
        selectedTimestamp,
        ...calendarBounds(selectedTimestamp),
        calendarFormat: this._calendarFormat
      })
    },

    ready() {
      this.refreshCalendarFormat(this.data.calendarDays)
    }
  },

  methods: {
    refreshCalendarFormat(days) {
      const format = createCalendarFormat(days)
      this._calendarFormat = format
      this.setData({ calendarFormat: format })

      // TDesign 1.15.3 的 format 是函数型 prop，动态 setData 不会可靠传到子组件。
      // 兼容细节只留在适配层，页面仍只消费 calendarDays 契约。
      const calendar = this.selectComponent('#record-calendar__tdesign')
      if (calendar && calendar.base && typeof calendar.calcMonths === 'function') {
        calendar.base.format = format
        calendar.calcMonths()
      }
    },

    onSelect(event) {
      const dateKey = localDateKey(event && event.detail && event.detail.value)
      if (dateKey) this.triggerEvent('select', { dateKey })
    },

    onPanelChange(event) {
      const { year, month } = event && event.detail || {}
      this.triggerEvent('panelchange', { year, month })
    }
  }
})

module.exports = {
  localDateKey,
  dateKeyToLocalTimestamp,
  calendarBounds,
  createCalendarFormat
}
