const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const test = require('node:test')

const root = path.resolve(__dirname, '..')

function runPython(source, args = []) {
  return spawnSync('python3', ['-c', source, ...args], {
    cwd: root,
    encoding: 'utf8'
  })
}

test('blocked 证据决定只提升目录中的原 unknown 概念', () => {
  const script = `
import importlib.util
import json
import pathlib

root = pathlib.Path.cwd()
spec = importlib.util.spec_from_file_location(
    "promotion", root / "scripts/fooddata/promote_canine_blocked_policies.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
load = lambda value: json.loads((root / value).read_text(encoding="utf-8"))
previous = load("data/canine-ingredient-policies/releases/2026-08-14-v2.json")
catalog = load("data/ingredient-catalog/releases/2026-08-14-v18.json")
decisions = load("data/canine-ingredient-policies/decisions/2026-08-15-blocked-v1.json")
output, report = module.promote(
    previous, catalog, decisions,
    policy_version="2026-08-15-v3",
    reviewed_at="2026-08-15",
    next_review_at="2026-11-15",
)
blocked = sorted(
    item["concept_id"] for item in output["concept_policies"]
    if item["decision"] == "blocked"
)
print(json.dumps({"report": report, "blocked": blocked}, ensure_ascii=False))
`
  const result = runPython(script)
  assert.equal(result.status, 0, result.stderr)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.report.default_unknown_concepts, 331)
  assert.equal(payload.report.promoted_blocked_concepts.length, 7)
  assert.equal(payload.blocked.length, 11)
  assert.ok(payload.blocked.includes('ingredient_stage4_d616c8bcd232bcf6'))
  assert.ok(payload.blocked.includes('ingredient_stage2_edb8f30ddf374568'))
})

test('blocked 提升器拒绝覆盖已有显式策略', () => {
  const script = `
import importlib.util
import json
import pathlib

root = pathlib.Path.cwd()
spec = importlib.util.spec_from_file_location(
    "promotion", root / "scripts/fooddata/promote_canine_blocked_policies.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
load = lambda value: json.loads((root / value).read_text(encoding="utf-8"))
previous = load("data/canine-ingredient-policies/releases/2026-08-14-v2.json")
catalog = load("data/ingredient-catalog/releases/2026-08-14-v18.json")
decisions = load("data/canine-ingredient-policies/decisions/2026-08-15-blocked-v1.json")
decisions["concept_policies"][0]["concept_id"] = "ingredient_onion"
try:
    module.promote(
        previous, catalog, decisions,
        policy_version="bad",
        reviewed_at="2026-08-15",
        next_review_at="2026-11-15",
    )
except ValueError as error:
    print(str(error))
    raise SystemExit(0)
raise SystemExit(3)
`
  const result = runPython(script)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /覆盖已有显式策略/)
})

test('映射迁移只更新兼容版本并保持阶段一快照绑定', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'recipe-mapping-v3-'))
  const output = path.join(directory, 'mapping.json')
  const result = spawnSync('python3', [
    'scripts/fooddata/migrate_recipe_mapping_snapshot.py',
    '--previous', 'data/human-recipes/mappings/2026-08-14-v2.json',
    '--mapping-version', 'test-v3',
    '--catalog-version', '2026-08-14-v18',
    '--policy-version', 'test-policy-v3',
    '--generated-at', '2026-08-15T00:00:00Z',
    '--out', output
  ], { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const previous = JSON.parse(fs.readFileSync(
    path.join(root, 'data/human-recipes/mappings/2026-08-14-v2.json'), 'utf8'
  ))
  const migrated = JSON.parse(fs.readFileSync(output, 'utf8'))
  assert.equal(migrated.mapping_version, 'test-v3')
  assert.equal(migrated.compatible_policy_version, 'test-policy-v3')
  assert.equal(migrated.stage1_decisions, previous.stage1_decisions)
  assert.equal(migrated.stage1_decisions_sha256, previous.stage1_decisions_sha256)
  assert.deepEqual(migrated.manual_decisions, previous.manual_decisions)
})
