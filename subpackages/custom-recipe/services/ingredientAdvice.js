const highFatKeys = ['porkBelly', 'duckSkin', 'eggYolk', 'visibleFat', 'fattyMeat']

function normalizeList(value) {
  return Array.isArray(value) ? value : []
}

function isHighFatIngredient(item) {
  const name = item.name || ''
  return highFatKeys.includes(item.allergenKey) || /肥|五花|油脂|皮|蛋黄/.test(name)
}

function categoryRatioReason(item, ratio, categoryRatios) {
  if (item.category === 'meat' && categoryRatios.meat < 0.35) return `这餐肉类总占比偏低，建议保证主要蛋白来源更稳定。`
  if (item.category === 'meat' && categoryRatios.meat > 0.7) return `这餐肉类总占比偏高，建议搭配蔬菜和适量主食。`
  if (item.category === 'carb' && categoryRatios.carb > 0.35) return `${item.name}所在的主食占比偏高，建议减少一些。`
  if (item.category === 'vegetable' && ratio > 0.4) return `${item.name}作为单一蔬菜占比偏高，建议搭配其他食材。`
  return ''
}

function buildAdviceForDog(customRecipe, dog) {
  const ingredients = normalizeList(customRecipe.ingredients)
  const totalGram = ingredients.reduce((sum, item) => sum + Number(item.perMealAmountGram || 0), 0)
  const categoryGram = ingredients.reduce((sum, item) => {
    sum[item.category] = (sum[item.category] || 0) + Number(item.perMealAmountGram || 0)
    return sum
  }, {})
  const categoryRatios = {
    meat: totalGram > 0 ? (categoryGram.meat || 0) / totalGram : 0,
    vegetable: totalGram > 0 ? (categoryGram.vegetable || 0) / totalGram : 0,
    carb: totalGram > 0 ? (categoryGram.carb || 0) / totalGram : 0,
    other: totalGram > 0 ? (categoryGram.other || 0) / totalGram : 0
  }

  return ingredients.map((item) => {
    const ratio = totalGram > 0 ? Number(item.perMealAmountGram || 0) / totalGram : 0
    const allergens = normalizeList(dog.allergens)
    const avoidIngredients = normalizeList(dog.avoidIngredients)

    if (item.allergenKey && allergens.includes(item.allergenKey)) {
      return {
        ingredientName: item.name,
        level: 'avoid',
        suggestion: '建议替换',
        reason: `${dog.name}的档案里标记了${item.name}过敏。`
      }
    }

    if (avoidIngredients.includes(item.name) || avoidIngredients.includes(item.allergenKey)) {
      return {
        ingredientName: item.name,
        level: 'adjust',
        suggestion: '建议减少或替换',
        reason: `${item.name}在${dog.name}的忌口食材里。`
      }
    }

    if (dog.dietGoal === 'lowFat' && isHighFatIngredient(item)) {
      return {
        ingredientName: item.name,
        level: 'adjust',
        suggestion: '建议减少用量',
        reason: `${dog.name}当前是低脂目标，${item.name}这类高脂食材建议控制。`
      }
    }

    const ratioReason = categoryRatioReason(item, ratio, categoryRatios)
    if (ratioReason) {
      return {
        ingredientName: item.name,
        level: 'adjust',
        suggestion: '建议调整比例',
        reason: ratioReason
      }
    }

    if (dog.ageStage === 'puppy' || dog.ageStage === 'senior') {
      return {
        ingredientName: item.name,
        level: 'adjust',
        suggestion: '建议少量尝试',
        reason: `${dog.name}属于${dog.ageStage === 'puppy' ? '幼犬' : '老年犬'}阶段，新食材或自定义比例建议更谨慎。`
      }
    }

    return {
      ingredientName: item.name,
      level: 'ok',
      suggestion: '可以保留',
      reason: `${item.name}没有命中过敏源或忌口信息。`
    }
  })
}

function mergeAdvices(advicesByDog) {
  const priority = { avoid: 3, adjust: 2, ok: 1 }
  const merged = {}

  advicesByDog.reduce((allItems, group) => allItems.concat(group), []).forEach((advice) => {
    const previous = merged[advice.ingredientName]
    if (!previous || priority[advice.level] > priority[previous.level]) {
      merged[advice.ingredientName] = advice
    }
  })

  return Object.values(merged)
}

function buildIngredientAdvices(customRecipe, dogs) {
  const targetDogs = Array.isArray(dogs) ? dogs : [dogs]
  return mergeAdvices(targetDogs.map((dog) => buildAdviceForDog(customRecipe, dog)))
}

function buildAdviceSummary(advices) {
  if (advices.some((item) => item.level === 'avoid')) return '发现不建议使用的食材，需要调整或替换后再生成清单。'
  if (advices.some((item) => item.level === 'adjust')) return '整体可以继续调整，建议先处理标记为需要调整的食材。'
  return '没有发现明显风险，可以按建议选择制作周期。'
}

module.exports = {
  buildAdviceForDog,
  buildIngredientAdvices,
  buildAdviceSummary,
  isHighFatIngredient,
  categoryRatioReason
}
