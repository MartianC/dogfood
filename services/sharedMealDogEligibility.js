const { estimateLifeStage } = require('./lifeStageEstimator')
const { estimateExpectedAdultWeight } = require('./dogProfileDerivations')
const { validateSpecialNutritionNeeds } = require('./dogProfileContract')

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isPositiveNumber(value) {
  if (value === '' || value === null || value === undefined) return false
  const number = Number(value)
  return Number.isFinite(number) && number > 0
}

function hasValidActivityDuration(value) {
  if (value === '' || value === null || value === undefined) return false
  const hours = Number(value)
  return Number.isFinite(hours)
    && hours >= 0
    && hours <= 6
    && Number.isInteger(hours * 2)
}

function evaluateSharedMealDogEligibility(dog = {}, { today } = {}) {
  const blockedReasons = []
  const incompleteReasons = []
  const lifeStage = estimateLifeStage({ birthDate: dog.birthDate, today })
  let needs = null
  try {
    needs = validateSpecialNutritionNeeds(dog.specialNutritionNeeds)
  } catch (error) {
    incompleteReasons.push('invalid_special_nutrition_needs')
  }

  if (lifeStage.reason === 'under_minimum_age') blockedReasons.push('under_eight_weeks')
  if (needs) {
    if (needs.hasDisease === true) blockedReasons.push('diagnosed_disease')
    if (needs.reproductiveStatus === 'pregnant') blockedReasons.push('pregnant')
    if (needs.reproductiveStatus === 'lactating') blockedReasons.push('lactating')
    if (needs.therapeuticWeightManagement === 'loss') {
      blockedReasons.push('therapeutic_weight_loss')
    }
    if (needs.therapeuticWeightManagement === 'gain') {
      blockedReasons.push('therapeutic_weight_gain')
    }
  }

  if (blockedReasons.length) return { status: 'blocked', reasonCodes: blockedReasons }

  if (!hasText(dog.birthDate) || !lifeStage.available) {
    incompleteReasons.push('missing_birth_date')
  }
  if (!hasText(dog.breed)) incompleteReasons.push('missing_breed')
  if (!isPositiveNumber(dog.weightKg)) incompleteReasons.push('invalid_weight')
  if (!isPositiveNumber(dog.dailyMeals)) incompleteReasons.push('invalid_daily_meals')
  if (!hasValidActivityDuration(dog.dailyActivityHours)) {
    incompleteReasons.push('missing_activity_duration')
  }
  if (!hasText(dog.bodyCondition)) incompleteReasons.push('missing_body_condition')

  if (lifeStage.available && lifeStage.energyStage === 'puppy') {
    const estimate = isPositiveNumber(dog.expectedAdultWeightKg)
      ? { expectedAdultWeightKg: Number(dog.expectedAdultWeightKg) }
      : estimateExpectedAdultWeight(dog.breed)
    if (!isPositiveNumber(estimate.expectedAdultWeightKg)) {
      incompleteReasons.push('missing_expected_adult_weight')
    }
  }

  if (needs) {
    if (needs.hasDisease === null) incompleteReasons.push('unconfirmed_disease_status')
    if (needs.reproductiveStatus === null) {
      incompleteReasons.push('unconfirmed_reproductive_status')
    }
    if (needs.therapeuticWeightManagement === null) {
      incompleteReasons.push('unconfirmed_therapeutic_weight_management')
    }
  }

  if (incompleteReasons.length) {
    return { status: 'incomplete', reasonCodes: incompleteReasons }
  }
  return { status: 'eligible', reasonCodes: [] }
}

module.exports = {
  evaluateSharedMealDogEligibility
}
