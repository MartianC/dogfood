const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createDebouncedRequestCoordinator
} = require('../shared-src/subpackage-services/search/debouncedRequestCoordinator')

function deferred() {
  let resolve
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

test('新的搜索输入会取消尚未执行的旧请求', async () => {
  const timers = []
  const coordinator = createDebouncedRequestCoordinator({
    delay: 300,
    setTimer(callback) {
      const timer = { callback, cancelled: false }
      timers.push(timer)
      return timer
    },
    clearTimer(timer) {
      timer.cancelled = true
    }
  })
  const calls = []
  const first = coordinator.schedule('鸡', () => calls.push('鸡'))
  const second = coordinator.schedule('鸡肉', () => calls.push('鸡肉'))

  assert.equal(await first, false)
  assert.equal(timers[0].cancelled, true)
  timers[1].callback()
  await second
  assert.deepEqual(calls, ['鸡肉'])
})

test('相同关键词复用进行中的请求', async () => {
  const pending = deferred()
  let calls = 0
  const coordinator = createDebouncedRequestCoordinator()
  const first = coordinator.runNow('南瓜', () => {
    calls += 1
    return pending.promise
  })
  const second = coordinator.runNow('南瓜', () => {
    calls += 1
    return Promise.resolve('重复')
  })

  assert.equal(first, second)
  assert.equal(calls, 0)
  await Promise.resolve()
  assert.equal(calls, 1)
  pending.resolve('完成')
  assert.equal(await second, '完成')
})
