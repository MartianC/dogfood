'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const RUNNER = path.join(__dirname, '..', 'scripts', 'automator-runner.js');

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'automator-runner-test-'));
  const project = path.join(root, 'project');
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, 'project.config.json'), '{"appid":"touristappid","projectname":"fake"}\n');
  return { root, project };
}

function runSpec(spec) {
  const { root, project } = makeProject();
  const file = path.join(root, 'actions.json');
  fs.writeFileSync(file, JSON.stringify({ projectPath: project, ...spec }, null, 2));
  return spawnSync('node', [RUNNER, file], { encoding: 'utf8' });
}

function writeAutomator(project, source) {
  const moduleDir = path.join(project, 'node_modules', 'miniprogram-automator');
  fs.mkdirSync(moduleDir, { recursive: true });
  fs.writeFileSync(path.join(moduleDir, 'index.js'), source);
}

function runProjectSpec(project, spec, options = {}) {
  const file = path.join(path.dirname(project), 'actions.json');
  fs.writeFileSync(file, JSON.stringify({ projectPath: project, ...spec }, null, 2));
  return spawnSync('node', [RUNNER, file], { encoding: 'utf8', ...options });
}

test('tap 缺少 sideEffectRisk 时在连接 DevTools 前失败', () => {
  const result = runSpec({
    actions: [{ type: 'tap', selector: '.submit-button', confirm: 'tap' }],
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /sideEffectRisk/);
  assert.doesNotMatch(result.stderr, /miniprogram-automator/);
});

test('tap 只有机械 confirm=tap 时失败', () => {
  const result = runSpec({
    actions: [
      {
        type: 'tap',
        selector: '.submit-button',
        sideEffectRisk: 'external-write',
        intendedEffect: '点击提交按钮会创建订单',
        userConfirmation: 'tap',
      },
    ],
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /userConfirmation/);
  assert.doesNotMatch(result.stderr, /miniprogram-automator/);
});

test('tap 无外部副作用但必须说明 intendedEffect', () => {
  const result = runSpec({
    actions: [{ type: 'tap', selector: '.tab', sideEffectRisk: 'none' }],
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /intendedEffect/);
});

test('tap 外部副作用不能只用 yes 作为机械确认', () => {
  const result = runSpec({
    actions: [
      {
        type: 'tap',
        selector: '.submit-button',
        sideEffectRisk: 'external-write',
        intendedEffect: '点击提交按钮会创建订单',
        userConfirmation: 'yes',
      },
    ],
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /userConfirmation/);
  assert.doesNotMatch(result.stderr, /miniprogram-automator/);
});

test('tap 外部副作用不能用机械确认词拼接绕过', () => {
  const result = runSpec({
    actions: [
      {
        type: 'tap',
        selector: '.submit-button',
        sideEffectRisk: 'external-write',
        intendedEffect: '点击提交按钮会创建订单',
        userConfirmation: 'yes ok confirmed',
        confirmedEffect: '点击提交按钮会创建订单',
      },
    ],
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /userConfirmation/);
  assert.doesNotMatch(result.stderr, /miniprogram-automator/);
});

test('tap 外部副作用要求 confirmedEffect 与 intendedEffect 一致', () => {
  const result = runSpec({
    actions: [
      {
        type: 'tap',
        selector: '.submit-button',
        sideEffectRisk: 'external-write',
        intendedEffect: '点击提交按钮会创建订单',
        userConfirmation: '用户已确认点击提交按钮会创建订单并要求继续',
        confirmedEffect: '点击按钮',
      },
    ],
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /confirmedEffect/);
  assert.doesNotMatch(result.stderr, /miniprogram-automator/);
});

test('tap 外部副作用带具体确认和 confirmedEffect 时允许执行', () => {
  const { root, project } = makeProject();
  writeAutomator(project, `module.exports = {
  launch: async () => ({
    currentPage: async () => ({
      $: async () => ({
        tap: async () => require('node:fs').writeFileSync(${JSON.stringify(path.join(root, 'tapped'))}, '1')
      })
    }),
    close: async () => require('node:fs').writeFileSync(${JSON.stringify(path.join(root, 'closed'))}, '1')
  })
};
`);

  const result = runProjectSpec(project, {
    actions: [
      {
        type: 'tap',
        selector: '.submit-button',
        sideEffectRisk: 'external-write',
        intendedEffect: '点击提交按钮会创建订单',
        userConfirmation: '用户已确认点击提交按钮会创建订单并要求继续',
        confirmedEffect: '点击提交按钮会创建订单',
      },
    ],
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(root, 'tapped'), 'utf8'), '1');
  assert.equal(fs.readFileSync(path.join(root, 'closed'), 'utf8'), '1');
});

test('navigateTo 缺少 sideEffectRisk 时在连接 DevTools 前失败', () => {
  const result = runSpec({
    actions: [{ type: 'navigateTo', url: '/pages/order/index' }],
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /sideEffectRisk/);
  assert.doesNotMatch(result.stderr, /miniprogram-automator/);
});

test('reLaunch 缺少 sideEffectRisk 时在连接 DevTools 前失败', () => {
  const result = runSpec({
    actions: [{ type: 'reLaunch', url: '/pages/order/index' }],
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /sideEffectRisk/);
  assert.doesNotMatch(result.stderr, /miniprogram-automator/);
});

test('pageData 默认脱敏敏感字段', () => {
  const { root, project } = makeProject();
  writeAutomator(project, `module.exports = {
  launch: async () => ({
    currentPage: async () => ({
      data: async () => ({
        publicValue: 'ok',
        token: 'secret-token-123',
        nested: { cookie: 'secret-cookie-456' }
      })
    }),
    close: async () => require('node:fs').writeFileSync(${JSON.stringify(path.join(root, 'closed'))}, '1')
  })
};
`);

  const result = runProjectSpec(project, {
    actions: [{ type: 'pageData' }],
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /publicValue/);
  assert.doesNotMatch(result.stdout + result.stderr, /secret-token-123|secret-cookie-456/);
  assert.match(result.stdout, /\[REDACTED\]/);
  assert.equal(fs.readFileSync(path.join(root, 'closed'), 'utf8'), '1');
});

test('text 输出中的 Authorization header 会被脱敏', () => {
  const { root, project } = makeProject();
  writeAutomator(project, `module.exports = {
  launch: async () => ({
    currentPage: async () => ({
      $: async () => ({
        text: async () => 'Authorization: Bearer secret-auth-789'
      })
    }),
    close: async () => require('node:fs').writeFileSync(${JSON.stringify(path.join(root, 'closed'))}, '1')
  })
};
`);

  const result = runProjectSpec(project, {
    actions: [{ type: 'text', selector: '.token' }],
  });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout + result.stderr, /secret-auth-789/);
  assert.match(result.stdout, /\[REDACTED\]/);
  assert.equal(fs.readFileSync(path.join(root, 'closed'), 'utf8'), '1');
});

test('currentPage 抛错时仍关闭 miniProgram', () => {
  const { root, project } = makeProject();
  writeAutomator(project, `module.exports = {
  launch: async () => ({
    currentPage: async () => { throw new Error('current page failed'); },
    close: async () => require('node:fs').writeFileSync(${JSON.stringify(path.join(root, 'closed'))}, '1')
  })
};
`);

  const result = runProjectSpec(project, {
    actions: [{ type: 'pageData' }],
  });

  assert.notEqual(result.status, 0);
  assert.equal(fs.readFileSync(path.join(root, 'closed'), 'utf8'), '1');
});

test('action 抛错时仍关闭 miniProgram', () => {
  const { root, project } = makeProject();
  writeAutomator(project, `module.exports = {
  launch: async () => ({
    currentPage: async () => ({
      $: async () => { throw new Error('selector failed'); }
    }),
    close: async () => require('node:fs').writeFileSync(${JSON.stringify(path.join(root, 'closed'))}, '1')
  })
};
`);

  const result = runProjectSpec(project, {
    actions: [{ type: 'text', selector: '.missing' }],
  });

  assert.notEqual(result.status, 0);
  assert.equal(fs.readFileSync(path.join(root, 'closed'), 'utf8'), '1');
});

test('action 超时时仍关闭 miniProgram', () => {
  const { root, project } = makeProject();
  writeAutomator(project, `module.exports = {
  launch: async () => ({
    currentPage: async () => ({
      waitFor: async () => new Promise(() => {})
    }),
    close: async () => require('node:fs').writeFileSync(${JSON.stringify(path.join(root, 'closed'))}, '1')
  })
};
`);

  const result = runProjectSpec(project, {
    actionTimeout: 100,
    actions: [{ type: 'waitFor', ms: 500 }],
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /超时/);
  assert.equal(fs.readFileSync(path.join(root, 'closed'), 'utf8'), '1');
});

test('launch 超时时进程会失败退出', () => {
  const { project } = makeProject();
  writeAutomator(project, `module.exports = {
  launch: async () => new Promise(() => {})
};
`);

  const result = runProjectSpec(
    project,
    {
      timeout: 100,
      actionTimeout: 100,
      actions: [{ type: 'pageData' }],
    },
    { timeout: 2000 },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /launch 超时/);
});

test('close 超时时不挂住 runner', () => {
  const { project } = makeProject();
  writeAutomator(project, `module.exports = {
  launch: async () => ({
    currentPage: async () => ({
      data: async () => ({ ok: true })
    }),
    close: async () => new Promise(() => {})
  })
};
`);

  const result = runProjectSpec(
    project,
    {
      actionTimeout: 100,
      actions: [{ type: 'pageData' }],
    },
    { timeout: 2000 },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /关闭 miniProgram 超时/);
  assert.match(result.stdout, /"ok": true/);
});
