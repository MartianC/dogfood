const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
}

test('v24 将机器直译改成简洁中文，并合并仅状态不同的同种食材', () => {
  const catalog = readJson('data/ingredient-catalog/releases/2026-08-19-v24.json')
  const report = readJson('data/ingredient-catalog/releases/2026-08-19-v24-name-normalization-report.json')

  assert.equal(catalog.catalog_version, '2026-08-19-v24')
  assert.equal(catalog.items.length, 1034)
  assert.equal(report.base_catalog_version, '2026-08-19-v23')
  assert.equal(report.changed_name_count, 346)
  assert.equal(report.merged_concept_count, 44)
  assert.equal(report.unmodified_machine_translation_candidates.length, 0)

  const names = new Set(catalog.items.map((item) => item.canonical_name_zh))
  assert.ok(names.has('焗豆'))
  assert.ok(names.has('烹饪喷雾油'))
  assert.ok(names.has('香草豆乳酸奶'))
  assert.ok(names.has('斑豆'))
  assert.ok(![...names].some((name) => /的.*的|PAM|CHOBANI|DANNON|未准备|来源状态未注明/.test(name)))

  const concepts = new Set(catalog.items.map((item) => item.concept_id))
  for (const redirect of Object.values(report.redirects)) assert.ok(concepts.has(redirect))
  assert.equal(catalog.items.find((item) => item.concept_id === 'ingredient_usda_b91619e8ab11c669debc')?.canonical_name_zh, '未成熟斑豆')
})

test('v24 目录别名不跨概念冲突', () => {
  const catalog = readJson('data/ingredient-catalog/releases/2026-08-19-v24.json')
  const owners = new Map()
  for (const item of catalog.items) {
    for (const alias of [item.canonical_name_zh, ...(item.aliases || [])]) {
      const key = String(alias).normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '')
      const previous = owners.get(key)
      assert.ok(!previous || previous === item.concept_id, `${alias} 跨概念冲突`)
      owners.set(key, item.concept_id)
    }
  }
})

test('v24 审核 HTML 默认加载 v22 基线、v24 目录和名称整理报告', () => {
  const html = fs.readFileSync(path.join(root, 'tools/usda-catalog-review-v24.html'), 'utf8')

  assert.match(html, /USDA 目录<br>v24 审阅台/)
  assert.match(html, /2026-08-17-v22\.json/)
  assert.match(html, /2026-08-19-v24\.json/)
  assert.match(html, /2026-08-19-v24-name-normalization-report\.json/)
  assert.match(html, /同种食材合并/)
  assert.match(html, /ingredientCatalogCurationReview\/v1/)
  assert.match(html, /data-catalog-action="remove"/)
  assert.match(html, /data-catalog-action="rename"/)
  assert.match(html, /导出目录整理标记/)
})
