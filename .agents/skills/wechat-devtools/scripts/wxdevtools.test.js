'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const SCRIPT = path.join(__dirname, 'wxdevtools.js');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wxdevtools-test-'));
}

function makeProject(root) {
  const project = path.join(root, 'project');
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, 'project.config.json'), '{"appid":"touristappid","projectname":"fake"}\n');
  return project;
}

function writeFakeCli(root, source) {
  const cli = path.join(root, 'cli');
  fs.writeFileSync(cli, source);
  fs.chmodSync(cli, 0o755);
  return cli;
}

function runWx(args, env) {
  return spawnSync('node', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('所有高影响命令缺少 confirm 时都在调用 CLI 前失败', () => {
  const root = makeTempDir();
  const project = makeProject(root);
  const argvFile = path.join(root, 'argv.json');
  const cli = writeFakeCli(root, `#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync(process.env.WX_DEVTOOLS_ARGV_FILE, JSON.stringify(process.argv.slice(2)));
`);

  const cases = [
    ['login'],
    ['upload', '--project', project, '--version', '1.0.0', '--desc', 'test'],
    ['cache', '--project', project, '--clean', 'all'],
    ['quit'],
    ['close', '--project', project],
  ];

  for (const args of cases) {
    fs.rmSync(argvFile, { force: true });
    const result = runWx(args, { WX_DEVTOOLS_CLI: cli, WX_DEVTOOLS_ARGV_FILE: argvFile });
    assert.notEqual(result.status, 0, args.join(' '));
    assert.match(result.stderr, /高影响动作/);
    assert.equal(fs.existsSync(argvFile), false, `${args[0]} 不应调用 fake CLI`);
  }
});

test('preview 使用默认 qr-format 并追加 --lang zh', () => {
  const root = makeTempDir();
  const project = makeProject(root);
  const argvFile = path.join(root, 'argv.json');
  const cli = writeFakeCli(root, `#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync(process.env.WX_DEVTOOLS_ARGV_FILE, JSON.stringify(process.argv.slice(2)));
`);

  const result = runWx(['preview', '--project', project], {
    WX_DEVTOOLS_CLI: cli,
    WX_DEVTOOLS_ARGV_FILE: argvFile,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(argvFile, 'utf8')), [
    'preview',
    '--project',
    project,
    '--qr-format',
    'terminal',
    '--lang',
    'zh',
  ]);
});

test('upload 要求非空 version 和 desc', () => {
  const root = makeTempDir();
  const project = makeProject(root);
  const argvFile = path.join(root, 'argv.json');
  const cli = writeFakeCli(root, `#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync(process.env.WX_DEVTOOLS_ARGV_FILE, JSON.stringify(process.argv.slice(2)));
`);

  const cases = [
    ['upload', '--project', project, '--desc', 'test', '--confirm', 'upload'],
    ['upload', '--project', project, '--version', '1.0.0', '--confirm', 'upload'],
    ['upload', '--project', project, '--version', '', '--desc', 'test', '--confirm', 'upload'],
    ['upload', '--project', project, '--version', '1.0.0', '--desc', '', '--confirm', 'upload'],
  ];

  for (const args of cases) {
    fs.rmSync(argvFile, { force: true });
    const result = runWx(args, { WX_DEVTOOLS_CLI: cli, WX_DEVTOOLS_ARGV_FILE: argvFile });
    assert.notEqual(result.status, 0, args.join(' '));
    assert.equal(fs.existsSync(argvFile), false);
  }
});

test('upload 支持带空格的 desc 并在 confirm 后调用 CLI', () => {
  const root = makeTempDir();
  const project = makeProject(root);
  const argvFile = path.join(root, 'argv.json');
  const cli = writeFakeCli(root, `#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync(process.env.WX_DEVTOOLS_ARGV_FILE, JSON.stringify(process.argv.slice(2)));
`);

  const result = runWx(
    ['upload', '--project', project, '--version', '1.0.0', '--desc', 'release candidate', '--confirm', 'upload'],
    { WX_DEVTOOLS_CLI: cli, WX_DEVTOOLS_ARGV_FILE: argvFile },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(argvFile, 'utf8')), [
    'upload',
    '--project',
    project,
    '--version',
    '1.0.0',
    '--desc',
    'release candidate',
    '--lang',
    'zh',
  ]);
});

test('未知参数、重复参数和缺值都会失败', () => {
  const root = makeTempDir();
  const project = makeProject(root);
  const cli = writeFakeCli(root, `#!/usr/bin/env node
process.exit(0);
`);

  const cases = [
    ['preview', '--project', project, '--unknown', '1'],
    ['preview', '--project', project, '--project', project],
    ['preview', '--project'],
  ];

  for (const args of cases) {
    const result = runWx(args, { WX_DEVTOOLS_CLI: cli });
    assert.notEqual(result.status, 0, args.join(' '));
  }
});

test('位置参数错误不会回显疑似敏感值', () => {
  const root = makeTempDir();
  const cli = writeFakeCli(root, `#!/usr/bin/env node
process.exit(0);
`);
  const secret = 'token-secret-value-123';

  const result = runWx(['islogin', secret], { WX_DEVTOOLS_CLI: cli });

  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, new RegExp(secret));
  assert.match(result.stderr, /不支持的位置参数/);
});

test('相对项目路径不会被自动 resolve', () => {
  const root = makeTempDir();
  const cli = writeFakeCli(root, `#!/usr/bin/env node
process.exit(0);
`);

  const result = runWx(['preview', '--project', 'relative/project'], { WX_DEVTOOLS_CLI: cli });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /项目路径必须是绝对路径/);
});

test('auto --trust-project 缺少确认时阻断', () => {
  const root = makeTempDir();
  const project = makeProject(root);
  const argvFile = path.join(root, 'argv.json');
  const cli = writeFakeCli(root, `#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync(process.env.WX_DEVTOOLS_ARGV_FILE, JSON.stringify(process.argv.slice(2)));
`);

  const result = runWx(['auto', '--project', project, '--trust-project'], {
    WX_DEVTOOLS_CLI: cli,
    WX_DEVTOOLS_ARGV_FILE: argvFile,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /trust-project/);
  assert.equal(fs.existsSync(argvFile), false);
});

test('服务端口关闭时返回 2 且不会向 stdin 写入 y', () => {
  const root = makeTempDir();
  const stdinFile = path.join(root, 'stdin.txt');
  const cli = writeFakeCli(root, `#!/usr/bin/env node
const fs = require('node:fs');
process.stdout.write('IDE service port disabled\\n? 开启工具服务 (y/N)\\n');
let input = '';
try { input = fs.readFileSync(0, 'utf8'); } catch (_) {}
fs.writeFileSync(process.env.WX_DEVTOOLS_STDIN_FILE, input);
`);

  const result = runWx(['islogin'], {
    WX_DEVTOOLS_CLI: cli,
    WX_DEVTOOLS_STDIN_FILE: stdinFile,
  });

  assert.equal(result.status, 2, result.stderr);
  assert.equal(fs.readFileSync(stdinFile, 'utf8'), '');
  assert.doesNotMatch(result.stdout + result.stderr, /stdin:y/);
});

test('服务端口 marker 出现在超时前的部分输出时仍返回 2', () => {
  const root = makeTempDir();
  const cli = writeFakeCli(root, `#!/usr/bin/env node
process.stdout.write('IDE service port disabled\\n');
setTimeout(() => {}, 10000);
`);

  const result = runWx(['islogin'], {
    WX_DEVTOOLS_CLI: cli,
    WX_DEVTOOLS_TIMEOUT_MS: '1000',
  });

  assert.equal(result.status, 2, result.stderr);
});

test('普通超时返回 124', () => {
  const root = makeTempDir();
  const cli = writeFakeCli(root, `#!/usr/bin/env node
setTimeout(() => {}, 10000);
`);

  const result = runWx(['islogin'], {
    WX_DEVTOOLS_CLI: cli,
    WX_DEVTOOLS_TIMEOUT_MS: '1000',
  });

  assert.equal(result.status, 124, result.stderr);
});

test('CLI 输出中的敏感字段会被脱敏', () => {
  const root = makeTempDir();
  const cli = writeFakeCli(root, `#!/usr/bin/env node
process.stdout.write('token=secret-token-123\\n');
process.stderr.write('cookie:secret-cookie-456\\n');
`);

  const result = runWx(['islogin'], { WX_DEVTOOLS_CLI: cli });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout + result.stderr, /secret-token-123|secret-cookie-456/);
  assert.match(result.stdout + result.stderr, /\[REDACTED\]/);
});

test('CLI 输出中的 Authorization 和完整 Cookie header 会被脱敏', () => {
  const root = makeTempDir();
  const cli = writeFakeCli(root, `#!/usr/bin/env node
process.stdout.write('authorization: Bearer secret-auth-789\\n');
process.stderr.write('cookie: sid=secret-cookie-1; other=secret-cookie-2\\n');
`);

  const result = runWx(['islogin'], { WX_DEVTOOLS_CLI: cli });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout + result.stderr, /secret-auth-789|secret-cookie-1|secret-cookie-2/);
  assert.match(result.stdout + result.stderr, /\[REDACTED\]/);
});

test('CLI 敏感字段和值跨 chunk 输出时仍会被脱敏', () => {
  const root = makeTempDir();
  const cli = writeFakeCli(root, `#!/usr/bin/env node
process.stdout.write('token=');
setTimeout(() => process.stdout.write('split-secret-123\\n'), 20);
`);

  const result = runWx(['islogin'], { WX_DEVTOOLS_CLI: cli });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout + result.stderr, /split-secret-123/);
  assert.match(result.stdout + result.stderr, /\[REDACTED\]/);
});

test('CLI 输出超过捕获上限时不会保留可能泄密的尾部', () => {
  const root = makeTempDir();
  const cli = writeFakeCli(root, `#!/usr/bin/env node
process.stdout.write('token=');
process.stdout.write('x'.repeat(2 * 1024 * 1024 + 1));
process.stdout.write('boundary-secret-123\\n');
`);

  const result = runWx(['islogin'], { WX_DEVTOOLS_CLI: cli });

  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout + result.stderr, /boundary-secret-123/);
  assert.match(result.stdout, /\[OUTPUT_TRUNCATED\]/);
});
