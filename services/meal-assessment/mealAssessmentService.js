const { estimateLifeStage } = require('../lifeStageEstimator')
const { deriveActivityLevel } = require('../dogProfileDerivations')
const energyRequirementService = require('./energyRequirementService')
const mealEnergyService = require('./mealEnergyService')
const nutritionAssessmentService = require('./nutritionAssessmentService')

const ENERGY_STATUS_LABELS = {
  below_target: '能量低于估算目标',
  near_target: '能量接近估算目标',
  above_target: '能量高于估算目标',
  unavailable: '暂无法判断本餐份量'
}

function bodyConditionNote(value) {
  if (value === 'thin') return '当前体况偏瘦，请结合体重变化和专业建议校正份量'
  if (value === 'overweight') return '当前体况偏胖，请结合体重变化和专业建议校正份量'
  return ''
}

function assessmentDogOf(dog) {
  const derivedActivityLevel = deriveActivityLevel(dog.dailyActivityHours)
  return derivedActivityLevel
    ? { ...dog, activityLevel: derivedActivityLevel }
    : dog
}

function buildMealAssessment({
  ingredients = [],
  dog = {},
  standards = [],
  nutrientRecords = [],
  profileOverrides = {},
  dataErrors = {},
  today
}) {
  const lifeStage = estimateLifeStage({ birthDate: dog.birthDate, today })
  if (lifeStage.reason === 'under_minimum_age') {
    const nutritionDensity = nutritionAssessmentService.buildAssessment({
      ingredients,
      dog,
      lifeStage,
      standards,
      nutrientRecords,
      profileOverrides
    })
    return {
      lifeStage,
      energy: {
        available: false,
        reason: lifeStage.reason,
        status: 'unavailable',
        statusLabel: ENERGY_STATUS_LABELS.unavailable,
        currentKcal: null,
        knownKcal: 0,
        mealTarget: null,
        dailyTarget: null,
        provisional: false,
        missingIngredients: [],
        scaleSuggestion: { available: false },
        bodyConditionNote: ''
      },
      nutritionDensity,
      contextText: `${dog.name || '未选择狗狗'} · ${lifeStage.label}`,
      basisText: '小于 8 周暂不自动评估，请咨询兽医或宠物营养专业人士'
    }
  }
  const assessmentDog = assessmentDogOf(dog)
  const requirement = energyRequirementService.calculateEnergyRequirement({
    dog: assessmentDog,
    lifeStage
  })
  const supply = dataErrors.nutrients
    ? {
      available: false,
      totalKcal: null,
      knownKcal: 0,
      missingIngredients: ingredients.map((item) => ({
        id: item.ingredientId || item.id || item.name,
        name: item.name,
        reason: '营养数据加载失败'
      }))
    }
    : mealEnergyService.calculateMealEnergy({ ingredients, nutrientRecords })
  const status = requirement.available && supply.available
    ? mealEnergyService.evaluateEnergyStatus({
      currentKcal: supply.totalKcal,
      mealTarget: requirement.mealTarget
    })
    : 'unavailable'
  const canScale = status === 'below_target' || status === 'above_target'
  const scaleSuggestion = canScale
    ? mealEnergyService.buildScaleSuggestion({
      ingredients,
      currentKcal: supply.totalKcal,
      mealTarget: requirement.mealTarget
    })
    : { available: false }
  const nutritionDensity = nutritionAssessmentService.buildAssessment({
    ingredients,
    dog: assessmentDog,
    lifeStage,
    standards: dataErrors.standards ? [] : standards,
    nutrientRecords: dataErrors.nutrients ? [] : nutrientRecords,
    profileOverrides
  })

  return {
    lifeStage,
    energy: {
      available: requirement.available && supply.available,
      reason: requirement.reason || '',
      status,
      statusLabel: ENERGY_STATUS_LABELS[status],
      currentKcal: supply.totalKcal,
      knownKcal: supply.knownKcal,
      mealTarget: requirement.mealTarget,
      dailyTarget: requirement.dailyTarget,
      provisional: requirement.provisional,
      missingIngredients: supply.missingIngredients || [],
      scaleSuggestion,
      bodyConditionNote: bodyConditionNote(dog.bodyCondition)
    },
    nutritionDensity,
    contextText: `${dog.name || '未选择狗狗'} · ${lifeStage.label} · ${dog.dailyActivityHours === null || dog.dailyActivityHours === undefined || dog.dailyActivityHours === '' ? '活动时长待完善' : `日均 ${Number(dog.dailyActivityHours)} 小时`} · 每日 ${Number(dog.dailyMeals || 0)} 餐`,
    basisText: '本餐按每日餐数等额分配；不包含零食及其他额外喂食'
  }
}

module.exports = {
  buildMealAssessment
}
