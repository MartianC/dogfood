const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildWeightView,
  chartModel,
  mergeMeasurements
} = require('../subpackages/dog-profile/weight/weightTrendModel')

function measurement(id, measuredOn, weightKg, createdAt = `${measuredOn}T08:00:00.000Z`) {
  return {
    schemaVersion: 1,
    id,
    dogId: 'dog-1',
    weightKg,
    measuredOn,
    createdAt
  }
}

test('体重趋势模型按测量日期倒序展示，并从最近测量计算当前体重', () => {
  const view = buildWeightView({
    dog: { id: 'dog-1', name: '布丁', weightKg: 8 },
    measurements: [
      measurement('m-1', '2026-08-01', 7.8),
      measurement('m-3', '2026-08-04', 8.2),
      measurement('m-2', '2026-08-02', 8)
    ]
  })

  assert.equal(view.currentWeightText, '8.2 kg')
  assert.equal(view.currentMeasuredOnText, '最近测量：2026年8月4日')
  assert.equal(view.currentWeightSourceText, '来自最近一次有效测量')
  assert.equal(view.recordCountText, '3 次测量')
  assert.deepEqual(view.historyItems.map((item) => item.id), ['m-3', 'm-2', 'm-1'])
  assert.equal(view.historyItems[0].changeText, '较上次 +0.2 kg')
  assert.equal(view.historyItems[2].changeText, '')
  assert.equal(view.chartPoints.length, 3)
  assert.equal(view.chartSegments.length, 2)
})

test('没有历史测量时保留旧档案当前体重，但不伪造测量日期', () => {
  const view = buildWeightView({
    dog: { id: 'dog-1', name: '布丁', weightKg: 8.5 },
    measurements: []
  })

  assert.equal(view.currentWeightText, '8.5 kg')
  assert.equal(view.currentMeasuredOnText, '档案当前值，暂无测量日期')
  assert.equal(view.currentWeightSourceText, '来自档案当前值，暂无测量日期')
  assert.equal(view.hasMeasurements, false)
  assert.deepEqual(view.chartPoints, [])
})

test('体重趋势空态不生成占位折线，合并分页结果时按 ID 去重', () => {
  assert.deepEqual(chartModel([]), {
    points: [],
    segments: [],
    minLabel: '',
    maxLabel: '',
    startDateText: '',
    endDateText: ''
  })

  const merged = mergeMeasurements(
    [measurement('m-1', '2026-08-01', 7.8)],
    [measurement('m-1', '2026-08-01', 7.9), measurement('m-2', '2026-08-02', 8)]
  )
  assert.deepEqual(merged.map((item) => item.id), ['m-2', 'm-1'])
  assert.equal(merged[1].weightKg, 7.9)
})
