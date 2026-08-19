const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const script = path.join(root, 'scripts/fooddata/normalize_ingredient_catalog.py')

test('人工目录标记会在下一版标准目录中去掉和重写食材', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingredient-catalog-curation-'))
  const basePath = path.join(tempDir, 'base.json')
  const reviewPath = path.join(tempDir, 'review.json')
  const outCatalog = path.join(tempDir, 'out.json')
  const outReport = path.join(tempDir, 'report.json')
  const base = {
    catalog_version: '2026-08-19-v24',
    catalog_schema_version: 2,
    items: [
      {
        concept_id: 'ingredient_test_remove',
        canonical_name_zh: '待删除食材',
        aliases: [],
        variants: []
      },
      {
        concept_id: 'ingredient_test_rename',
        canonical_name_zh: '机器直译食材',
        aliases: [],
        variants: [{
          variant_id: 'variant_test_rename',
          is_default: true,
          preparation_state: 'raw',
          display_name_zh: '机器直译食材（生）'
        }]
      },
      {
        concept_id: 'ingredient_test_keep',
        canonical_name_zh: '保留食材',
        aliases: [],
        variants: []
      }
    ],
    complete_usda_integration: {}
  }
  const review = {
    contract: 'ingredientCatalogCurationReview/v1',
    catalog_version: '2026-08-19-v24',
    actions: {
      ingredient_test_remove: {
        action: 'remove',
        current_name: '待删除食材'
      },
      ingredient_test_rename: {
        action: 'rename',
        current_name: '机器直译食材',
        new_name: '简洁食材'
      },
      ingredient_test_keep: {
        action: 'keep',
        current_name: '保留食材'
      }
    }
  }
  fs.writeFileSync(basePath, JSON.stringify(base))
  fs.writeFileSync(reviewPath, JSON.stringify(review))

  execFileSync('python3', [
    script,
    '--base-catalog', basePath,
    '--catalog-version', '2026-08-19-v25-review',
    '--out-catalog', outCatalog,
    '--out-report', outReport,
    '--review-markings', reviewPath
  ], { encoding: 'utf8' })

  const output = JSON.parse(fs.readFileSync(outCatalog, 'utf8'))
  const report = JSON.parse(fs.readFileSync(outReport, 'utf8'))
  const byId = new Map(output.items.map((item) => [item.concept_id, item]))
  assert.equal(output.catalog_version, '2026-08-19-v25-review')
  assert.equal(byId.has('ingredient_test_remove'), false)
  assert.equal(byId.get('ingredient_test_rename').canonical_name_zh, '简洁食材')
  assert.deepEqual(byId.get('ingredient_test_rename').aliases, ['机器直译食材'])
  assert.equal(byId.get('ingredient_test_rename').variants[0].display_name_zh, '简洁食材（生）')
  assert.equal(byId.has('ingredient_test_keep'), true)
  assert.equal(report.manual_curation_review.removed_count, 1)
  assert.equal(report.manual_curation_review.renamed_count, 1)
})
