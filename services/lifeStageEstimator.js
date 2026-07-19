const DAY_MS = 24 * 60 * 60 * 1000
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function localDateText(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateText(value) {
  const match = String(value || '').match(DATE_PATTERN)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const stamp = Date.UTC(year, month - 1, day)
  const checked = new Date(stamp)

  if (
    checked.getUTCFullYear() !== year
    || checked.getUTCMonth() !== month - 1
    || checked.getUTCDate() !== day
  ) return null

  return { year, month, day, stamp }
}

function fullYearsBetween(birth, current) {
  let years = current.year - birth.year
  if (
    current.month < birth.month
    || (current.month === birth.month && current.day < birth.day)
  ) years -= 1
  return years
}

function unavailable(reason) {
  return {
    available: false,
    reason,
    ageDays: null,
    ageWeeks: null,
    ageYears: null,
    nutritionStage: null,
    energyStage: null,
    legacyAgeStage: '',
    label: reason === 'under_minimum_age' ? '幼龄犬' : '阶段待完善'
  }
}

function estimateLifeStage({ birthDate, today = localDateText() } = {}) {
  const birth = parseDateText(birthDate)
  const current = parseDateText(today)
  if (!birth || !current) return unavailable('invalid_birth_date')
  if (birth.stamp > current.stamp) return unavailable('future_birth_date')

  const ageDays = Math.floor((current.stamp - birth.stamp) / DAY_MS)
  const ageWeeks = Math.floor(ageDays / 7)
  const ageYears = fullYearsBetween(birth, current)

  if (ageDays < 56) {
    return { ...unavailable('under_minimum_age'), ageDays, ageWeeks, ageYears }
  }
  if (ageDays < 98) {
    return {
      available: true,
      reason: '',
      ageDays,
      ageWeeks,
      ageYears,
      nutritionStage: 'early_growth',
      energyStage: 'puppy',
      legacyAgeStage: 'puppy',
      label: '幼犬早期'
    }
  }
  if (ageYears < 1) {
    return {
      available: true,
      reason: '',
      ageDays,
      ageWeeks,
      ageYears,
      nutritionStage: 'late_growth',
      energyStage: 'puppy',
      legacyAgeStage: 'puppy',
      label: '幼犬晚期'
    }
  }
  if (ageYears < 7) {
    return {
      available: true,
      reason: '',
      ageDays,
      ageWeeks,
      ageYears,
      nutritionStage: 'adult',
      energyStage: 'adult',
      legacyAgeStage: 'adult',
      label: '成年犬'
    }
  }
  return {
    available: true,
    reason: '',
    ageDays,
    ageWeeks,
    ageYears,
    nutritionStage: 'adult',
    energyStage: 'senior',
    legacyAgeStage: 'senior',
    label: '老年犬'
  }
}

function decorateDog(dog, today) {
  const lifeStage = estimateLifeStage({ birthDate: dog && dog.birthDate, today })
  return {
    ...(dog || {}),
    lifeStage,
    ageStage: lifeStage.legacyAgeStage,
    lifeStageLabel: lifeStage.label,
    profileIncomplete: !lifeStage.available && lifeStage.reason !== 'under_minimum_age'
  }
}

module.exports = {
  estimateLifeStage,
  decorateDog
}
