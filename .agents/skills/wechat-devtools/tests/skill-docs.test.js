'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const SKILL_DIR = path.join(__dirname, '..');

function readSkillFile(relativePath) {
  return fs.readFileSync(path.join(SKILL_DIR, relativePath), 'utf8');
}

test('SKILL 说明代码质量扫描的 UI-only 工作流', () => {
  const skill = readSkillFile('SKILL.md');

  assert.match(skill, /代码质量/);
  assert.match(skill, /code quality scan|quality panel/i);
  assert.match(skill, /UI-only|仅限 UI|只通过 UI/);
  assert.match(skill, /重新扫描/);
  assert.match(skill, /computer use/);
});

test('代码质量扫描没有被伪装成 wxdevtools 脚本命令', () => {
  const skill = readSkillFile('SKILL.md');
  const wrapper = readSkillFile('scripts/wxdevtools.js');
  const wrapperCommandPattern = /wxdevtools\.js\s+(?:code-?quality|quality|quality-?scan|scan)\b/i;
  const commandSchemaPattern = /(?:^|[,{]\s*)(?:['"])?(?:code-?quality|quality|quality-?scan|scan)(?:['"])?\s*:/i;

  for (const line of skill.split('\n').filter((line) => line.includes('scripts/wxdevtools.js'))) {
    assert.doesNotMatch(line, wrapperCommandPattern);
  }
  assert.doesNotMatch(wrapper, commandSchemaPattern);
});

test('官方接口参考记录代码质量扫描没有稳定 CLI、HTTP 或 automator 入口', () => {
  const reference = readSkillFile('references/official-interfaces.md');

  assert.match(reference, /代码质量扫描/);
  assert.match(reference, /cli --help --lang zh/i);
  assert.match(reference, /没有.*代码质量|未.*代码质量|不包含.*代码质量/);
  assert.match(reference, /没有稳定.*miniprogram-automator|miniprogram-automator.*没有稳定/);
  assert.match(reference, /code-analyse/);
  assert.match(reference, /不要|不能|不得/);
});
