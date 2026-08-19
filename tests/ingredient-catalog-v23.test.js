const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
}

test('v23 标准目录完成面粉/麦粉与奶酪聚合', () => {
  const catalog = readJson('data/ingredient-catalog/releases/2026-08-19-v23.json')
  const aggregation = readJson('data/ingredient-catalog/releases/2026-08-19-v23-selection-aggregation-report.json')

  assert.equal(catalog.catalog_version, '2026-08-19-v23')
  assert.equal(catalog.items.length, 1078)
  assert.deepEqual(
    catalog.items
      .filter((item) => item.category_code === 'carb' && /(?:面粉|小麦粉|全麦粉|麦粉|粗面粉|粗麦粉|杜兰|斯佩尔特)/.test(item.canonical_name_zh))
      .map((item) => item.canonical_name_zh),
    ['面粉', '全麦面粉']
  )
  assert.deepEqual(
    catalog.items
      .filter((item) => item.category_code === 'dairy' && /(?:奶酪|芝士|乳酪|干酪)/.test(item.canonical_name_zh))
      .map((item) => item.canonical_name_zh),
    ['切达奶酪', '马苏里拉奶酪']
  )
  assert.equal(aggregation.base_catalog_version, '2026-08-17-v22')
  assert.equal(aggregation.removed_concept_count, 111)
  assert.deepEqual(
    aggregation.groups.map((group) => [group.group_id, group.before_count, group.retained_count, group.removed_count]),
    [
      ['flour_and_wheat_flour', 29, 2, 27],
      ['cheese', 86, 2, 84]
    ]
  )
})

test('v23 策略、排行和人饭映射绑定同一目录版本', () => {
  const policy = readJson('data/canine-ingredient-policies/releases/2026-08-19-v8.json')
  const ranking = readJson('data/nutrient-rankings/releases/2026-08-19-v9.json')
  const mapping = readJson('data/human-recipes/mappings/2026-08-19-v9.json')
  const review = readJson('data/canine-ingredient-policies/reviews/2026-08-19-v23-usda-review-queue.json')

  assert.equal(policy.compatible_catalog_version, '2026-08-19-v23')
  assert.equal(ranking.compatible_catalog_version, '2026-08-19-v23')
  assert.equal(ranking.compatible_policy_version, '2026-08-19-v8')
  assert.equal(mapping.compatible_catalog_version, '2026-08-19-v23')
  assert.equal(mapping.compatible_policy_version, '2026-08-19-v8')
  assert.equal(review.catalog_version, '2026-08-19-v23')
  assert.equal(review.items.length, 776)
})

test('v23 审核 HTML 默认加载 v22 基线、聚合报告和正式目录', () => {
  const html = fs.readFileSync(path.join(root, 'tools/usda-catalog-review-v23.html'), 'utf8')

  assert.match(html, /USDA 目录<br>v23 审阅台/)
  assert.match(html, /2026-08-17-v22\.json/)
  assert.match(html, /2026-08-19-v23\.json/)
  assert.match(html, /2026-08-19-v23-selection-aggregation-report\.json/)
  assert.match(html, /产品聚合下线/)
})
