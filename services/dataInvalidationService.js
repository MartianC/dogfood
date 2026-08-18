const DATA_SCOPE = Object.freeze({
  MEALS: 'meals',
  PROFILE: 'profile'
})

const ALL_SCOPES = Object.freeze([
  DATA_SCOPE.MEALS,
  DATA_SCOPE.PROFILE
])

function normalizedScopes(scopes) {
  const values = scopes == null ? ALL_SCOPES : Array.isArray(scopes) ? scopes : [scopes]
  return [...new Set(values)].filter((scope) => ALL_SCOPES.includes(scope))
}

function createDataInvalidationState() {
  const revisions = {
    [DATA_SCOPE.MEALS]: 0,
    [DATA_SCOPE.PROFILE]: 0
  }

  function getSnapshot() {
    return { ...revisions }
  }

  function markDirty(scopes) {
    normalizedScopes(scopes).forEach((scope) => {
      revisions[scope] += 1
    })
    return getSnapshot()
  }

  function hasChanged(snapshot, scopes) {
    if (!snapshot || typeof snapshot !== 'object') return true
    return normalizedScopes(scopes).some((scope) => snapshot[scope] !== revisions[scope])
  }

  return {
    getSnapshot,
    markDirty,
    hasChanged
  }
}

const defaultState = createDataInvalidationState()

module.exports = {
  DATA_SCOPE,
  ALL_SCOPES,
  createDataInvalidationState,
  getSnapshot: defaultState.getSnapshot,
  markDirty: defaultState.markDirty,
  hasChanged: defaultState.hasChanged
}
