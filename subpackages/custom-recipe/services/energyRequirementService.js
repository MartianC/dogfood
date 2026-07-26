const { deriveActivityLevel } = require('../../../services/dogProfileDerivations')

const ACTIVITY_FACTORS = {
  low: { min: 95, max: 95 },
  moderateLowImpact: { min: 110, max: 110 },
  moderateHighImpact: { min: 125, max: 125 },
  high: { min: 150, max: 175 }
}

function unavailable(reason) {
  return {
    available: false,
    reason,
    dailyTarget: null,
    mealTarget: null,
    factorRange: null,
    provisional: false,
    basisCode: ''
  }
}

function targetsFromFactor(weightKg, dailyMeals, factorRange, provisional, basisCode) {
  const metabolicWeight = Math.pow(weightKg, 0.75)
  const dailyTarget = {
    min: factorRange.min * metabolicWeight,
    max: factorRange.max * metabolicWeight
  }
  return {
    available: true,
    reason: '',
    dailyTarget,
    mealTarget: {
      min: dailyTarget.min / dailyMeals,
      max: dailyTarget.max / dailyMeals
    },
    factorRange,
    provisional,
    basisCode
  }
}

function calculateEnergyRequirement({ dog = {}, lifeStage = {} }) {
  const weightKg = Number(dog.weightKg)
  const dailyMeals = Number(dog.dailyMeals)

  if (!lifeStage.available) {
    return unavailable(lifeStage.reason || 'life_stage_unavailable')
  }
  if (!Number.isFinite(weightKg) || !(weightKg > 0)) {
    return unavailable('invalid_weight')
  }
  if (!Number.isFinite(dailyMeals) || !(dailyMeals > 0)) {
    return unavailable('invalid_daily_meals')
  }
  if (!['puppy', 'adult', 'senior'].includes(lifeStage.energyStage)) {
    return unavailable('unsupported_energy_stage')
  }

  if (lifeStage.energyStage === 'puppy') {
    const expectedAdultWeightKg = Number(dog.expectedAdultWeightKg)
    if (!Number.isFinite(expectedAdultWeightKg) || !(expectedAdultWeightKg > 0)) {
      return unavailable(dog.adultWeightEstimateReason || 'breed_estimate_unavailable')
    }
    if (expectedAdultWeightKg < weightKg) {
      return unavailable('breed_estimate_inconsistent')
    }
    const factor = 254.1 - 135 * (weightKg / expectedAdultWeightKg)
    return targetsFromFactor(
      weightKg,
      dailyMeals,
      { min: factor, max: factor },
      false,
      'fediaf_growth'
    )
  }

  const hasActivityDuration = dog.dailyActivityHours !== undefined &&
    dog.dailyActivityHours !== null &&
    dog.dailyActivityHours !== ''
  const derivedLevel = deriveActivityLevel(dog.dailyActivityHours)
  const activityDuration = Number(dog.dailyActivityHours)
  const usesHalfHourStep = Number.isInteger(activityDuration * 2)
  if (hasActivityDuration && (!derivedLevel || !usesHalfHourStep)) {
    return unavailable('invalid_activity_duration')
  }
  const legacyLevel = dog.activityLevel === 'normal'
    ? 'moderateLowImpact'
    : dog.activityLevel
  const activityLevel = derivedLevel || legacyLevel
  const configured = ACTIVITY_FACTORS[activityLevel]
  const fallback = lifeStage.energyStage === 'senior'
    ? ACTIVITY_FACTORS.low
    : ACTIVITY_FACTORS.moderateLowImpact
  return targetsFromFactor(
    weightKg,
    dailyMeals,
    configured || fallback,
    !configured,
    configured
      ? (derivedLevel ? 'fediaf_activity_duration' : 'fediaf_activity_legacy')
      : 'fediaf_age_default'
  )
}

module.exports = {
  ACTIVITY_FACTORS,
  calculateEnergyRequirement
}
