const COOKED_PREPARATION_STATES = new Set([
  'baked',
  'boiled',
  'braised',
  'cooked',
  'fried',
  'grilled',
  'poached',
  'roasted',
  'sauteed',
  'simmered',
  'steamed'
])
const DRY_PREPARATION_STATES = new Set(['dehydrated', 'dried', 'dry'])

function normalizePreparationState(value) {
  return String(value || '').trim().toLowerCase()
}

function measurementBasisText(preparationState) {
  const normalized = normalizePreparationState(preparationState)
  if (normalized === 'raw') return '按生重称量'
  if (COOKED_PREPARATION_STATES.has(normalized)) return '按熟重称量'
  if (DRY_PREPARATION_STATES.has(normalized)) return '按干重称量'
  return '按当前记录口径称量'
}

module.exports = { measurementBasisText }
