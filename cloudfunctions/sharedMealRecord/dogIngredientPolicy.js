function text(value) {
  return String(value || '').trim()
}

function normalizeName(value) {
  return text(value).toLocaleLowerCase().replace(/[\s·・_\-—]+/g, '')
}

function parseAllergyEntry(value) {
  const raw = text(value)
  if (!raw.startsWith('concept:')) return { conceptId: '', name: raw }
  const separator = raw.indexOf('|')
  try {
    return {
      conceptId: decodeURIComponent(raw.slice(8, separator < 0 ? undefined : separator)),
      name: separator < 0 ? '' : decodeURIComponent(raw.slice(separator + 1))
    }
  } catch (error) {
    return { conceptId: '', name: raw }
  }
}

function isIngredientAllergen(ingredient = {}, dog = {}) {
  const conceptId = text(ingredient.conceptId || ingredient.concept_id)
  const names = [
    ingredient.name,
    ingredient.canonical_name_zh,
    ingredient.display_name_zh,
    ingredient.allergenKey
  ].map(normalizeName).filter(Boolean)
  return (Array.isArray(dog.allergens) ? dog.allergens : []).some((entry) => {
    const allergy = parseAllergyEntry(entry)
    return (allergy.conceptId && conceptId && allergy.conceptId === conceptId)
      || (!allergy.conceptId && names.includes(normalizeName(allergy.name)))
  })
}

module.exports = { isIngredientAllergen }
