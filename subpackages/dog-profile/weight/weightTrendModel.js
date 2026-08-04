const {
  resolveCurrentWeight,
  sortWeightMeasurements
} = require('../../../services/weightContract')

function finiteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function trimNumber(value) {
  const number = finiteNumber(value)
  if (number === null) return ''
  return String(Number(number.toFixed(2)))
}

function weightText(value) {
  const text = trimNumber(value)
  return text ? `${text} kg` : '未记录'
}

function dateParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return null
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  }
}

function dateText(value) {
  const parts = dateParts(value)
  return parts ? `${parts.year}年${parts.month}月${parts.day}日` : '日期待确认'
}

function shortDateText(value) {
  const parts = dateParts(value)
  return parts ? `${parts.month}/${parts.day}` : '—'
}

function changeText(current, previous) {
  const currentNumber = finiteNumber(current)
  const previousNumber = finiteNumber(previous)
  if (currentNumber === null || previousNumber === null) return ''
  const delta = Number((currentNumber - previousNumber).toFixed(2))
  if (delta === 0) return '较上次持平'
  return `较上次 ${delta > 0 ? '+' : ''}${trimNumber(delta)} kg`
}

function currentWeightSourceText(source) {
  if (source === 'measurement') return '来自最近一次有效测量'
  if (source === 'legacy-profile') return '来自档案当前值，暂无测量日期'
  return '尚未记录体重'
}

function chartBounds(measurements) {
  const weights = measurements
    .map((item) => finiteNumber(item.weightKg))
    .filter((value) => value !== null)
  if (!weights.length) return { min: 0, max: 1 }

  const minWeight = Math.min(...weights)
  const maxWeight = Math.max(...weights)
  const span = maxWeight - minWeight
  const padding = Math.max(span * 0.16, 0.5)
  return {
    min: Math.max(0, Math.floor((minWeight - padding) * 10) / 10),
    max: Math.ceil((maxWeight + padding) * 10) / 10
  }
}

function pointStyle(x, y) {
  return `left: ${x.toFixed(2)}%; top: ${y.toFixed(2)}%;`
}

function segmentStyle(left, top, width, angle) {
  return `left: ${left.toFixed(2)}%; top: ${top.toFixed(2)}%; width: ${width.toFixed(2)}%; transform: rotate(${angle.toFixed(2)}deg);`
}

function chartModel(measurements) {
  const chronological = measurements.slice().reverse()
  if (!chronological.length) {
    return {
      points: [],
      segments: [],
      minLabel: '',
      maxLabel: '',
      startDateText: '',
      endDateText: ''
    }
  }

  const bounds = chartBounds(chronological)
  const range = Math.max(bounds.max - bounds.min, 0.1)
  const points = chronological.map((item, index) => {
    const x = chronological.length === 1 ? 50 : index / (chronological.length - 1) * 100
    const y = 100 - ((Number(item.weightKg) - bounds.min) / range) * 100
    return {
      id: item.id,
      x,
      y: Math.max(0, Math.min(100, y)),
      weightText: weightText(item.weightKg),
      measuredOn: item.measuredOn,
      dateText: shortDateText(item.measuredOn),
      isLatest: index === chronological.length - 1,
      style: pointStyle(x, Math.max(0, Math.min(100, y)))
    }
  })

  const segments = points.slice(1).map((point, index) => {
    const previous = points[index]
    const x1 = previous.x
    const y1 = previous.y
    const x2 = point.x
    const y2 = point.y
    const dx = x2 - x1
    const dy = y2 - y1
    const width = Math.sqrt(dx * dx + dy * dy * 0.64)
    const angle = Math.atan2(dy * 0.8, dx) * 180 / Math.PI
    return {
      id: `${previous.id}-${point.id}`,
      style: segmentStyle(x1, y1, width, angle)
    }
  })

  return {
    points,
    segments,
    minLabel: weightText(bounds.min),
    maxLabel: weightText(bounds.max),
    startDateText: shortDateText(chronological[0].measuredOn),
    endDateText: shortDateText(chronological[chronological.length - 1].measuredOn)
  }
}

function buildWeightView({ dog = {}, measurements = [] } = {}) {
  const sorted = sortWeightMeasurements(measurements)
  const current = resolveCurrentWeight({
    profileWeightKg: dog.weightKg,
    measurements: sorted
  })
  const chart = chartModel(sorted)
  const historyItems = sorted.map((item, index) => ({
    ...item,
    weightText: weightText(item.weightKg),
    measuredOnText: dateText(item.measuredOn),
    changeText: changeText(item.weightKg, sorted[index + 1] && sorted[index + 1].weightKg),
    isLatest: index === 0
  }))

  return {
    dogName: dog.name || '狗狗',
    currentWeightText: weightText(current.weightKg),
    currentMeasuredOnText: current.measuredOn
      ? `最近测量：${dateText(current.measuredOn)}`
      : current.weightKg === null
        ? '还没有体重测量记录'
        : '档案当前值，暂无测量日期',
    currentWeightSource: current.source,
    currentWeightSourceText: currentWeightSourceText(current.source),
    recordCount: sorted.length,
    recordCountText: `${sorted.length} 次测量`,
    hasMeasurements: sorted.length > 0,
    latestMeasurementId: sorted[0] ? sorted[0].id : '',
    historyItems,
    chartPoints: chart.points,
    chartSegments: chart.segments,
    chartMinLabel: chart.minLabel,
    chartMaxLabel: chart.maxLabel,
    chartStartDateText: chart.startDateText,
    chartEndDateText: chart.endDateText
  }
}

function mergeMeasurements(current, next) {
  const byId = new Map()
  ;[].concat(current || [], next || []).forEach((item) => {
    if (item && item.id) byId.set(item.id, item)
  })
  return sortWeightMeasurements(Array.from(byId.values()))
}

module.exports = {
  trimNumber,
  weightText,
  dateText,
  shortDateText,
  changeText,
  currentWeightSourceText,
  chartBounds,
  chartModel,
  buildWeightView,
  mergeMeasurements
}
