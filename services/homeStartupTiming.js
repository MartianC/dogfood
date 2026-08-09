/**
 * 首页启动关键时间点记录器。
 *
 * 该模块只负责记录一次首页启动过程中的时间点，不参与页面状态计算或请求编排，
 * 因此可以在 Node 测试和小程序运行时分别注入时钟与上报函数。
 */

const HOME_STARTUP_PHASES = Object.freeze([
  'page-created',
  'auth-ready',
  'shell-ready',
  'home-ready'
])

const PHASE_SET = new Set(HOME_STARTUP_PHASES)

function timestampOf(value) {
  const timestamp = value instanceof Date ? value.getTime() : Number(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function createHomeStartupTiming({ now = () => Date.now(), sink = () => {} } = {}) {
  let startedAt = null
  const marks = Object.create(null)
  const events = []

  function mark(phase, value) {
    if (!PHASE_SET.has(phase)) {
      throw new Error(`不支持的首页启动时间点：${phase}`)
    }
    // 每个时间点只采集首次发生时间，避免重复 onShow 或重试污染冷启动基线。
    if (Object.prototype.hasOwnProperty.call(marks, phase)) return marks[phase]

    const at = timestampOf(value === undefined ? now() : value)
    if (at === null) throw new TypeError('首页启动时间点必须是有效时间戳')
    if (startedAt === null) startedAt = at

    const event = Object.freeze({
      phase,
      at,
      elapsedMs: Math.max(0, at - startedAt)
    })
    marks[phase] = event
    events.push(event)
    sink(event)
    return event
  }

  function getSnapshot() {
    return {
      startedAt,
      events: events.slice(),
      marks: { ...marks }
    }
  }

  function elapsed(fromPhase, toPhase) {
    const from = marks[fromPhase]
    const to = marks[toPhase]
    if (!from || !to) return null
    return Math.max(0, to.at - from.at)
  }

  function reset() {
    startedAt = null
    events.length = 0
    HOME_STARTUP_PHASES.forEach((phase) => { delete marks[phase] })
  }

  return {
    phases: HOME_STARTUP_PHASES,
    mark,
    elapsed,
    getSnapshot,
    reset
  }
}

module.exports = {
  HOME_STARTUP_PHASES,
  createHomeStartupTiming,
  timestampOf
}
