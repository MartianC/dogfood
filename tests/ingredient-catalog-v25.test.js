const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
}

test('v25 应用人工目录标记并保留营养更丰富的桂圆来源', () => {
  const catalog = readJson('data/ingredient-catalog/releases/2026-08-19-v25.json')
  const report = readJson('data/ingredient-catalog/releases/2026-08-19-v25-catalog-curation-report.json')
  const ids = new Set(catalog.items.map((item) => item.concept_id))
  const longan = catalog.items.find((item) => item.concept_id === 'ingredient_usda_db53f2c348fa86f06792')

  assert.equal(catalog.catalog_version, '2026-08-19-v25')
  assert.equal(catalog.items.length, 945)
  assert.equal(ids.has('ingredient_usda_62436f47c8b942277ee7'), false)
  assert.equal(ids.has('ingredient_cfct_498fd93cef03aa6a'), false)
  assert.equal(longan.canonical_name_zh, '桂圆')
  assert.equal(longan.variants[0].fdc_id, 169089)
  assert.equal(report.manual_curation_review.removed_count, 89)
  assert.equal(report.manual_curation_review.renamed_count, 21)
  assert.equal(report.manual_curation_review.redirects.ingredient_cfct_498fd93cef03aa6a, 'ingredient_usda_db53f2c348fa86f06792')
  assert.equal(catalog.complete_usda_integration.merged_concept_redirects.ingredient_cfct_498fd93cef03aa6a, 'ingredient_usda_db53f2c348fa86f06792')
})

test('v25 审核页比较 v24 与 v25，并继续支持目录动作', () => {
  const html = fs.readFileSync(path.join(root, 'tools/usda-catalog-review-v25.html'), 'utf8')
  assert.match(html, /2026-08-19-v24\.json/)
  assert.match(html, /2026-08-19-v25\.json/)
  assert.match(html, /v24 → v25 变化清单/)
  assert.match(html, /data-catalog-action="remove"/)
  assert.match(html, /data-catalog-action="rename"/)
})
