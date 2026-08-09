const test = require('node:test')
const assert = require('node:assert/strict')

const {
  HOME_STARTUP_PHASES,
  createHomeStartupTiming,
  timestampOf
} = require('../services/homeStartupTiming')

test('首页启动记录器按关键时间点记录相对耗时并支持快照', () => {
  let clock = 1000
  const reported = []
  const timing = createHomeStartupTiming({
    now: () => clock,
    sink: (event) => reported.push(event)
  })

  timing.mark('page-created')
  clock = 1040
  timing.mark('auth-ready')
  clock = 1065
  timing.mark('shell-ready')
  clock = 1200
  timing.mark('home-ready')

  assert.deepEqual(timing.phases, HOME_STARTUP_PHASES)
  assert.deepEqual(reported.map((event) => [event.phase, event.elapsedMs]), [
    ['page-created', 0],
    ['auth-ready', 40],
    ['shell-ready', 65],
    ['home-ready', 200]
  ])
  assert.equal(timing.elapsed('auth-ready', 'home-ready'), 160)
  assert.equal(timing.getSnapshot().events.length, 4)
  assert.equal(timing.getSnapshot().marks['shell-ready'].at, 1065)
})

test('重复时间点只保留首次记录，未完成阶段耗时返回 null', () => {
  const timing = createHomeStartupTiming({ now: () => 2000 })
  const first = timing.mark('page-created')
  const duplicate = timing.mark('page-created', 9999)

  assert.equal(duplicate, first)
  assert.equal(timing.getSnapshot().events.length, 1)
  assert.equal(timing.elapsed('page-created', 'auth-ready'), null)
})

test('时间点名称和时间值无效时明确失败', () => {
  const timing = createHomeStartupTiming({ now: () => 3000 })

  assert.throws(() => timing.mark('unknown'), /不支持的首页启动时间点/)
  assert.throws(() => timing.mark('auth-ready', 'invalid'), /必须是有效时间戳/)
  assert.equal(timestampOf(new Date(3000)), 3000)
  assert.equal(timestampOf('invalid'), null)
})

test('重置后可以独立记录下一次首页启动', () => {
  const timing = createHomeStartupTiming({ now: () => 4000 })
  timing.mark('page-created')
  timing.reset()
  assert.deepEqual(timing.getSnapshot(), { startedAt: null, events: [], marks: {} })
  timing.mark('page-created', 5000)
  assert.equal(timing.getSnapshot().startedAt, 5000)
})
