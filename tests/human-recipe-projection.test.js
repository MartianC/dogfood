const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const exporter = path.join(root, 'scripts/fooddata/export_ingredient_cloudbase.py')
const historicalSQLite = process.env.DOGFOOD_HISTORICAL_RECIPE_SQLITE || ''
const historicalExportDir = process.env.DOGFOOD_HISTORICAL_RECIPE_EXPORT_DIR || ''

function runPython(body) {
  return spawnSync('python3', ['-c', body], {
    cwd: root,
    encoding: 'utf8'
  })
}

test('v2 投影保留来源顺序、四态、未映射原文、阻断原因和版本快照', () => {
  const script = `
import importlib.util
import json
import pathlib

root = pathlib.Path(${JSON.stringify(root)})
spec = importlib.util.spec_from_file_location("projection", root / "scripts/fooddata/export_ingredient_cloudbase.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
mapping = {
    "mapping_version": "recipe-map-v2",
    "compatible_catalog_version": "catalog-v2",
    "compatible_policy_version": "policy-v2",
    "source_release_id": "recipes-source-v1",
    "license_status": "verified",
    "generated_at": "2026-07-27T00:00:00Z",
}
recipe = {
    "source_recipe_id": "recipe-1",
    "title": "番茄洋葱汤",
    "normalized_title": "番茄洋葱汤",
    "categories": ["汤"],
    "primary_category": "汤",
    "source_ingredient_count": 5,
    "source_amount_count": 0,
    "amount_alignment_status": "missing_amounts",
    "ingredients": [
        {
            "position": index,
            "raw_name": name,
            "normalized_name": name,
            "amount_raw": None,
            "amount_is_reference_only": True,
            "mapping_status": "unmatched" if status is None else "matched",
            "mapping_rule": None if status is None else "test",
            "components": [] if status is None else [{
                "position": 0,
                "concept_id": f"concept-{index}",
                "variant_id": f"variant-{index}",
                "food_id": f"food-{index}",
                "canonical_name_zh": name,
                "display_name_zh": name,
                "category_code": "other",
                "subcategory_code": "other",
                "preparation_state": "as_served",
                "part_or_cut": None,
                "skin_bone_state": None,
                "policy_status": status,
                "blockedReason": "  含有   不适合犬只的成分。\\n请勿添加。  " if status == "blocked" else None,
            }],
        }
        for index, (name, status) in enumerate([
            ("番茄", "allowed"),
            ("胡萝卜", "conditional"),
            ("香菜", "unknown"),
            ("洋葱", "blocked"),
            ("一撮盐", None),
        ])
    ],
}
versions = module.human_recipe_runtime_versions("release-v2", mapping)
document = module.build_human_recipe_document("release-v2", mapping, recipe)
report = module.build_human_recipe_projection_report(
    [document],
    release_id=versions["release_id"],
    recipe_version=versions["recipe_version"],
    mapping_version="recipe-map-v2",
    catalog_version="catalog-v2",
    policy_version="policy-v2",
    rollback_recipe_version="recipe-map-v2",
)
module.validate_human_recipe_projection_report(report)
print(json.dumps({"document": document, "report": report, "versions": versions}, ensure_ascii=False))
`
  const result = runPython(script)
  assert.equal(result.status, 0, result.stderr)
  const { document, report, versions } = JSON.parse(result.stdout)

  assert.equal(document.projection_contract, 'humanRecipeRuntimeProjection/v2')
  assert.equal(versions.recipe_version, 'human-recipe-runtime-v2-recipe-map-v2')
  assert.equal(
    versions.release_id,
    'human-recipe-release-v2-release-v2-recipe-map-v2'
  )
  assert.equal(document.recipe_version, versions.recipe_version)
  assert.equal(document.mapping_version, 'recipe-map-v2')
  assert.equal(document.release_id, versions.release_id)
  assert.notEqual(document._id, 'recipe_map_v2_recipe_recipe_1')
  assert.deepEqual(document.ingredients.map((item) => item.raw_name), [
    '番茄', '胡萝卜', '香菜', '洋葱', '一撮盐'
  ])
  assert.equal(document.non_blocked_component_count, 3)
  assert.equal(document.ingredients[3].components[0].blockedReason, '含有 不适合犬只的成分。 请勿添加。')
  assert.deepEqual(
    Object.keys(document.ingredients[4]).sort(),
    ['amount_is_reference_only', 'amount_raw', 'mapping_status', 'position', 'raw_name']
  )
  for (const component of document.ingredients.slice(0, 4).map((item) => item.components[0])) {
    assert.equal(component.recipe_version, versions.recipe_version)
    assert.equal(component.mapping_version, 'recipe-map-v2')
    assert.equal(component.catalog_version, 'catalog-v2')
    assert.equal(component.policy_version, 'policy-v2')
    assert.equal('is_selectable' in component, false)
  }
  assert.equal('is_searchable' in document, false)
  assert.deepEqual(report.policyStatusDistribution, {
    allowed: 1,
    conditional: 1,
    unknown: 1,
    blocked: 1
  })
  assert.equal(report.blockedReasons['含有 不适合犬只的成分。 请勿添加。'], 1)
  assert.equal(report.rollbackCandidate.status, 'requires-active-pointer')
  assert.equal(report.rollbackCandidate.recipeVersion, 'recipe-map-v2')
  assert.equal(report.versions.recipeVersion, versions.recipe_version)
  assert.equal(report.versions.mappingVersion, 'recipe-map-v2')
  assert.equal(report.activation.productionActiveSwitchAllowed, false)
})

test('真实历史 SQLite 的 v2 staging 与 v1 键空间隔离且显式切换前 active 不变', {
  skip: !historicalSQLite || !historicalExportDir
}, () => {
  const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'human-recipe-v2-'))
  const outDir = path.join(tmp, 'cloudbase')
  try {
    const result = spawnSync('python3', [
      exporter,
      '--sqlite', historicalSQLite,
      '--out-dir', outDir
    ], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024
    })
    assert.equal(result.status, 0, result.stderr)

    const oldLines = fs.readFileSync(
      path.join(historicalExportDir, 'human_recipes.jsonl'),
      'utf8'
    ).trim().split('\n')
    const newLines = fs.readFileSync(
      path.join(outDir, 'human_recipes.jsonl'),
      'utf8'
    ).trim().split('\n')
    const oldDocuments = new Map(oldLines.map((line) => {
      const document = JSON.parse(line)
      return [document._id, line]
    }))
    const newDocuments = newLines.map((line) => JSON.parse(line))
    const newRelease = JSON.parse(fs.readFileSync(
      path.join(outDir, 'data_releases.jsonl'),
      'utf8'
    ).trim())
    const report = JSON.parse(fs.readFileSync(
      path.join(outDir, 'human-recipe-projection-report.json'),
      'utf8'
    ))

    assert.equal(newDocuments.length, 22079)
    assert.equal(
      newDocuments.every((document) => document.mapping_version === '2026-07-23-v1'),
      true
    )
    assert.equal(
      newDocuments.every(
        (document) => document.recipe_version !== '2026-07-23-v1'
      ),
      true
    )
    assert.equal(
      newDocuments.some((document) => oldDocuments.has(document._id)),
      false
    )
    assert.notEqual(newRelease._id, 'ingredient_release_2026_07_22_policy_v1')
    assert.notEqual(newRelease.release_id, '2026-07-22-policy-v1')
    assert.equal(newRelease.mapping_version, '2026-07-23-v1')
    assert.equal(
      newRelease.rollback_candidate.recipe_version,
      '2026-07-23-v1'
    )
    assert.equal(report.versions.recipeVersion, newRelease.recipe_version)
    assert.equal(report.versions.mappingVersion, '2026-07-23-v1')
    assert.equal(report.rollbackCandidate.recipeVersion, '2026-07-23-v1')

    const simulatedRecipes = new Map(oldDocuments)
    newLines.forEach((line) => {
      const document = JSON.parse(line)
      simulatedRecipes.set(document._id, line)
    })
    oldDocuments.forEach((line, id) => {
      assert.equal(simulatedRecipes.get(id), line)
    })

    const releases = [
      {
        _id: 'legacy-active',
        status: 'active',
        recipe_version: '2026-07-23-v1'
      },
      newRelease
    ]
    const activeRecipeVersion = () => releases.find(
      (release) => release.status === 'active'
    ).recipe_version
    assert.equal(activeRecipeVersion(), '2026-07-23-v1')
    assert.equal(
      [...simulatedRecipes.values()]
        .map((line) => JSON.parse(line))
        .filter((document) => document.recipe_version === activeRecipeVersion())
        .length,
      oldDocuments.size
    )

    releases[0].status = 'staging'
    releases[1].status = 'active'
    assert.equal(activeRecipeVersion(), newRelease.recipe_version)
    assert.equal(
      [...simulatedRecipes.values()]
        .map((line) => JSON.parse(line))
        .filter((document) => document.recipe_version === activeRecipeVersion())
        .length,
      22079
    )
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('投影报告 schema 固定机器契约且导出器拒绝 active 输出', () => {
  const schema = JSON.parse(fs.readFileSync(
    path.join(root, 'contracts/shared-meal/human-recipe-projection-report-v1.schema.json'),
    'utf8'
  ))
  assert.equal(schema.$id, 'humanRecipeProjectionStagingReport/v1')
  assert.ok(schema.required.includes('policyStatusDistribution'))
  assert.ok(schema.required.includes('rollbackCandidate'))
  assert.equal(schema.properties.counts.additionalProperties, false)
  assert.deepEqual(
    schema.properties.activation.properties.productionActiveSwitchAllowed,
    { const: false }
  )

  const result = spawnSync('python3', [
    exporter,
    '--sqlite', '/tmp/does-not-matter.sqlite',
    '--out-dir', '/tmp/does-not-matter',
    '--status', 'active'
  ], {
    cwd: root,
    encoding: 'utf8'
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /staging|active|生产/)
})
