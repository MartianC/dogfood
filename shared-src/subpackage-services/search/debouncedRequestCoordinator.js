function createDebouncedRequestCoordinator(options = {}) {
  const delay = Number.isFinite(options.delay) && options.delay >= 0 ? options.delay : 300
  const setTimer = options.setTimer || setTimeout
  const clearTimer = options.clearTimer || clearTimeout
  const inFlight = new Map()
  let scheduled = null

  function run(key, task) {
    const requestKey = String(key || '')
    if (inFlight.has(requestKey)) return inFlight.get(requestKey)
    const promise = Promise.resolve()
      .then(task)
      .finally(() => {
        if (inFlight.get(requestKey) === promise) inFlight.delete(requestKey)
      })
    inFlight.set(requestKey, promise)
    return promise
  }

  function cancelScheduled(result = false) {
    if (!scheduled) return
    clearTimer(scheduled.timer)
    scheduled.resolve(result)
    scheduled = null
  }

  function schedule(key, task) {
    cancelScheduled(false)
    return new Promise((resolve, reject) => {
      const request = {
        resolve,
        timer: setTimer(() => {
          if (scheduled !== request) return
          scheduled = null
          run(key, task).then(resolve, reject)
        }, delay)
      }
      scheduled = request
    })
  }

  function runNow(key, task) {
    cancelScheduled(false)
    return run(key, task)
  }

  function cancel() {
    cancelScheduled(false)
  }

  return { schedule, runNow, cancel }
}

module.exports = { createDebouncedRequestCoordinator }
