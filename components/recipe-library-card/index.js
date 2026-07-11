function formatUpdatedAt(value) {
  if (!value) return '刚刚'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '刚刚'
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return '今天'
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function buildDisplay(recipe = {}) {
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : []
  const totalWeightGram = ingredients.reduce(
    (sum, item) => sum + Number(item.perMealAmountGram || item.amountGram || 0),
    0
  )
  const completed = recipe.status === 'checked' || recipe.status === 'completed'
  const dogLine = recipe.targetDogName
    ? `适合 ${recipe.targetDogName} · 最近更新于${formatUpdatedAt(recipe.updatedAt)}`
    : completed
      ? `未指定狗狗 · 最近更新于${formatUpdatedAt(recipe.updatedAt)}`
      : '还没食材和营养汇总，保存后可继续编辑'
  const energy = Number(recipe.totalEnergyKcal || recipe.energyKcal || 0)
  return {
    statusText: completed ? '已完成' : '草稿',
    statusVariant: completed ? 'good' : 'warning',
    dogLine,
    metrics: `共 ${ingredients.length} 种食材 · 总重 ${totalWeightGram} g${energy ? ` · 能量 ${energy} kcal` : ''}`
  }
}

Component({
  properties: {
    recipe: { type: Object, value: {} }
  },

  data: {
    display: buildDisplay()
  },

  observers: {
    recipe(recipe) {
      this.setData({ display: buildDisplay(recipe) })
    }
  },

  methods: {
    onTap() {
      this.triggerEvent('taprecipe', { recipe: this.data.recipe })
    }
  }
})
