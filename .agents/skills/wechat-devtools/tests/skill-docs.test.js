'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const SKILL_DIR = path.join(__dirname, '..');

function readSkillFile(relativePath) {
  return fs.readFileSync(path.join(SKILL_DIR, relativePath), 'utf8');
}

test('SKILL 强制在小程序改动交付前运行本地代码质量预检', () => {
  const skill = readSkillFile('SKILL.md');

  assert.match(skill, /代码质量/);
  assert.match(skill, /code quality scan|quality panel/i);
  assert.match(skill, /check-code-quality\.js/);
  assert.match(skill, /交付前必须运行/);
  assert.match(skill, /13 条规则/);
  assert.match(skill, /退出码为 `1`/);
  assert.match(skill, /UI-only|仅限 UI|只通过 UI/);
  assert.match(skill, /重新扫描/);
  assert.match(skill, /computer use/);
});

test('本地预检是独立脚本，没有被伪装成官方 wxdevtools 命令', () => {
  const skill = readSkillFile('SKILL.md');
  const wrapper = readSkillFile('scripts/wxdevtools.js');
  const wrapperCommandPattern = /wxdevtools\.js\s+(?:code-?quality|quality|quality-?scan|scan)\b/i;
  const commandSchemaPattern = /(?:^|[,{]\s*)(?:['"])?(?:code-?quality|quality|quality-?scan|scan)(?:['"])?\s*:/i;

  for (const line of skill.split('\n').filter((line) => line.includes('scripts/wxdevtools.js'))) {
    assert.doesNotMatch(line, wrapperCommandPattern);
  }
  assert.doesNotMatch(wrapper, commandSchemaPattern);
  assert.match(skill, /本地静态预检不是 `wxdevtools\.js` 的伪造官方命令/);
});

test('官方接口参考记录 13 条规则与官方扫描边界', () => {
  const reference = readSkillFile('references/official-interfaces.md');

  assert.match(reference, /代码质量扫描/);
  assert.match(reference, /cli --help --lang zh/i);
  assert.match(reference, /没有.*代码质量|未.*代码质量|不包含.*代码质量/);
  assert.match(reference, /没有稳定.*miniprogram-automator|miniprogram-automator.*没有稳定/);
  assert.match(reference, /当前共有 13 条/);
  assert.match(reference, /CONTAINS_OTHER_PKG_JS/);
  assert.match(reference, /直接父依赖/);
  assert.match(reference, /compiledPkg/);
  assert.match(reference, /code-analyse/);
  assert.match(reference, /不要|不能|不得/);
});

test('自动化规则要求复用已有工程会话且默认不关闭工程', () => {
  const skill = readSkillFile('SKILL.md');
  const reference = readSkillFile('references/official-interfaces.md');

  assert.match(skill, /先通过 `automator\.connect\(\)` 连接已有会话/);
  assert.match(skill, /连接失败时才调用一次 `automator\.launch\(\)`/);
  assert.match(skill, /miniProgram\.disconnect\(\)/);
  assert.match(skill, /不要在每次读取或扫描前重复执行 `open`/);
  assert.match(reference, /miniProgram\.close\(\).*App\.exit.*Tool\.close/);
});
