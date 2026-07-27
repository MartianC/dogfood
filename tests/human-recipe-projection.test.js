const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const exporter = path.join(root, 'scripts/fooddata/export_ingredient_cloudbase.py')

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
document = module.build_human_recipe_document("release-v2", mapping, recipe)
report = module.build_human_recipe_projection_report(
    [document],
    release_id="release-v2",
    recipe_version="recipe-map-v2",
    catalog_version="catalog-v2",
    policy_version="policy-v2",
)
module.validate_human_recipe_projection_report(report)
print(json.dumps({"document": document, "report": report}, ensure_ascii=False))
`
  const result = runPython(script)
  assert.equal(result.status, 0, result.stderr)
  const { document, report } = JSON.parse(result.stdout)

  assert.equal(document.projection_contract, 'humanRecipeRuntimeProjection/v2')
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
    assert.equal(component.recipe_version, 'recipe-map-v2')
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
  assert.equal(report.activation.productionActiveSwitchAllowed, false)
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
