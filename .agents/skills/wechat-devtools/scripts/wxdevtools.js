#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

const DEFAULT_MAC_APP = '/Applications/wechatwebdevtools.app';
const DEFAULT_MAC_CLI = path.join(DEFAULT_MAC_APP, 'Contents', 'MacOS', 'cli');
const SERVICE_PORT_DISABLED_MARKERS = [
  'IDE service port disabled',
  '工具的服务端口已关闭',
  '开启工具服务',
];
const HIGH_IMPACT_COMMANDS = new Set(['login', 'upload', 'cache', 'quit', 'close']);
const MAX_CAPTURE_CHARS = 2 * 1024 * 1024;
const OUTPUT_TRUNCATED = '[OUTPUT_TRUNCATED]\n';
const SENSITIVE_KEY_PATTERN =
  '(?:ticket|test[-_]?ticket|token|access[-_]?token|refresh[-_]?token|cookie|session|authorization)';

const COMMANDS = {
  doctor: { flags: {} },
  islogin: { flags: {} },
  login: {
    flags: {
      'qr-format': { default: 'terminal', choices: ['terminal', 'image', 'base64'] },
      'qr-output': {},
      'result-output': {},
      confirm: {},
    },
  },
  quit: {
    flags: {
      confirm: {},
    },
  },
  open: {
    flags: {
      project: { required: true },
    },
  },
  preview: {
    flags: {
      project: { required: true },
      'qr-format': { default: 'terminal', choices: ['terminal', 'image', 'base64'] },
      'qr-output': {},
      'info-output': {},
    },
  },
  upload: {
    flags: {
      project: { required: true },
      version: { required: true },
      desc: { required: true },
      'info-output': {},
      confirm: {},
    },
  },
  'build-npm': {
    flags: {
      project: { required: true },
      'compile-type': { choices: ['miniprogram', 'plugin'] },
    },
  },
  auto: {
    flags: {
      project: { required: true },
      port: { default: '9420' },
      'trust-project': { type: 'boolean', default: false },
      'confirm-trust-project': {},
    },
  },
  close: {
    flags: {
      project: { required: true },
      confirm: {},
    },
  },
  cache: {
    flags: {
      project: { required: true },
      clean: { required: true, choices: ['storage', 'file', 'compile', 'auth', 'network', 'session', 'all'] },
      confirm: {},
    },
  },
};

function fail(message, code = 1) {
  console.error(redactSensitive(message));
  process.exit(code);
}

function usage() {
  const commands = Object.keys(COMMANDS).join(', ');
  return `用法：wxdevtools.js <command> [options]\n可用命令：${commands}`;
}

function parseArgv(argv) {
  const command = argv[0];
  if (!command || command === '-h' || command === '--help') {
    throw new Error(usage());
  }
  const spec = COMMANDS[command];
  if (!spec) {
    throw new Error(`未知命令。\n${usage()}`);
  }

  const values = { command };
  const seen = new Set();
  for (const [name, flagSpec] of Object.entries(spec.flags)) {
    if (Object.prototype.hasOwnProperty.call(flagSpec, 'default')) {
      values[toCamel(name)] = flagSpec.default;
    }
  }

  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      throw new Error('不支持的位置参数。');
    }

    const eqIndex = token.indexOf('=');
    const rawName = token.slice(2, eqIndex === -1 ? undefined : eqIndex);
    const flagSpec = spec.flags[rawName];
    if (!flagSpec) {
      throw new Error(`命令 ${command} 不支持参数 --${rawName}`);
    }
    if (seen.has(rawName)) {
      throw new Error(`参数 --${rawName} 不能重复传入`);
    }
    seen.add(rawName);

    const key = toCamel(rawName);
    if (flagSpec.type === 'boolean') {
      if (eqIndex !== -1) {
        throw new Error(`布尔参数 --${rawName} 不接受值`);
      }
      values[key] = true;
      continue;
    }

    let value;
    if (eqIndex !== -1) {
      value = token.slice(eqIndex + 1);
    } else {
      value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`参数 --${rawName} 缺少值`);
      }
      i += 1;
    }
    values[key] = value;
  }

  for (const [name, flagSpec] of Object.entries(spec.flags)) {
    const key = toCamel(name);
    if (flagSpec.required && values[key] === undefined) {
      throw new Error(`命令 ${command} 缺少必需参数 --${name}`);
    }
    if (flagSpec.choices && values[key] !== undefined && !flagSpec.choices.includes(values[key])) {
      throw new Error(`参数 --${name} 只能是：${flagSpec.choices.join(', ')}`);
    }
  }

  return values;
}

function redactSensitive(input) {
  const text = String(input)
    .replace(/\b(authorization)(\s*[:=]\s*)[^\r\n]*/gi, '$1$2[REDACTED]')
    .replace(/\b(cookie|set-cookie)(\s*[:=]\s*)[^\r\n]*/gi, '$1$2[REDACTED]');
  return text
    .replace(
      new RegExp(`\\b(${SENSITIVE_KEY_PATTERN})(\\s*[:=]\\s*["']?)([^"'\\s,;&}]+)`, 'gi'),
      '$1$2[REDACTED]',
    )
    .replace(
      new RegExp(`(["'](?:${SENSITIVE_KEY_PATTERN})["']\\s*:\\s*["'])([^"']+)(["'])`, 'gi'),
      '$1[REDACTED]$3',
    )
    .replace(
      /(--(?:ticket|test-ticket|token|cookie)\s+)([^\s]+)/gi,
      '$1[REDACTED]',
    );
}

function redactCommand(args) {
  return redactSensitive(args.join(' '));
}

function toCamel(name) {
  return name.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function expandHome(input) {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return input;
}

function validateCliPath(inputPath) {
  const candidate = expandHome(inputPath);
  if (!path.isAbsolute(candidate)) {
    fail(`微信开发者工具 CLI 路径必须是绝对路径：${inputPath}`);
  }
  if (!fs.existsSync(candidate)) {
    fail(`微信开发者工具 CLI 不存在：${candidate}`);
  }
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
  } catch (_) {
    fail(`微信开发者工具 CLI 不可执行：${candidate}`);
  }
  if (!['cli', 'cli.bat'].includes(path.basename(candidate))) {
    fail(`拒绝使用名称不像微信开发者工具 CLI 的可执行文件：${candidate}`);
  }
  return candidate;
}

function findCli() {
  if (process.env.WX_DEVTOOLS_CLI) {
    return validateCliPath(process.env.WX_DEVTOOLS_CLI);
  }
  if (fs.existsSync(DEFAULT_MAC_CLI)) {
    return validateCliPath(DEFAULT_MAC_CLI);
  }
  fail('未找到微信开发者工具 CLI。可设置 WX_DEVTOOLS_CLI=/path/to/cli。');
}

function appVersion() {
  const infoPlist = path.join(DEFAULT_MAC_APP, 'Contents', 'Info.plist');
  if (!fs.existsSync(infoPlist)) return 'unknown';
  try {
    const output = execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', infoPlist], {
      encoding: 'utf8',
      timeout: 3000,
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const data = JSON.parse(output);
    return data.CFBundleShortVersionString || 'unknown';
  } catch (_) {
    return 'unknown';
  }
}

function ensureAbsProject(input) {
  const project = expandHome(input);
  if (!path.isAbsolute(project)) {
    fail('项目路径必须是绝对路径。');
  }
  if (!fs.existsSync(project)) {
    fail(`项目路径不存在：${project}`);
  }
  const stat = fs.statSync(project);
  if (!stat.isDirectory()) {
    fail(`项目路径必须是目录：${project}`);
  }
  const config = path.join(project, 'project.config.json');
  if (!fs.existsSync(config)) {
    fail(`项目缺少 project.config.json：${config}`);
  }
  return project;
}

function requireConfirm(args) {
  if (HIGH_IMPACT_COMMANDS.has(args.command) && args.confirm !== args.command) {
    fail(`${args.command} 是高影响动作；执行前必须取得用户明确授权，并传入 --confirm ${args.command}。`);
  }
  if (args.command === 'auto' && args.trustProject && args.confirmTrustProject !== 'trust-project') {
    fail('auto --trust-project 会改变项目信任状态；执行前必须取得用户明确授权，并传入 --confirm-trust-project trust-project。');
  }
}

function requireNonEmptyUploadFields(args) {
  if (args.command !== 'upload') return;
  if (!args.version || !args.version.trim()) {
    fail('upload 必须提供非空版本号：--version <version>。');
  }
  if (!args.desc || !args.desc.trim()) {
    fail('upload 必须提供非空上传描述：--desc <desc>。');
  }
}

function containsServicePortDisabled(output) {
  return SERVICE_PORT_DISABLED_MARKERS.some((marker) => output.includes(marker));
}

function printServicePortDisabledMessage() {
  console.error(
    '\n服务端口未开启。脚本不会向 CLI 的 y/N 提示写入 y；请让用户手动在微信开发者工具 设置 -> 安全设置 中开启服务端口，然后重新运行命令。',
  );
}

function timeoutFromEnv(defaultMs) {
  const raw = process.env.WX_DEVTOOLS_TIMEOUT_MS;
  if (!raw) return defaultMs;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 100) {
    fail('WX_DEVTOOLS_TIMEOUT_MS 必须是大于等于 100 的整数毫秒。');
  }
  return parsed;
}

function appendCapture(current, chunk) {
  if (current === OUTPUT_TRUNCATED) return current;
  const next = current + chunk;
  if (next.length <= MAX_CAPTURE_CHARS) return next;
  return OUTPUT_TRUNCATED;
}

function runCli(cliArgs, options = {}) {
  const cli = findCli();
  const timeoutMs = timeoutFromEnv(options.timeoutMs || 120000);
  const commandArgs = [...cliArgs, '--lang', 'zh'];

  return new Promise((resolve) => {
    const child = spawn(cli, commandArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let capturedStdout = '';
    let capturedStderr = '';
    let timedOut = false;
    let settled = false;
    let killTimer;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 1000);
    }, timeoutMs);

    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      const captured = `${capturedStdout}\n${capturedStderr}`;
      if (capturedStdout) process.stdout.write(redactSensitive(capturedStdout));
      if (capturedStderr) process.stderr.write(redactSensitive(capturedStderr));
      if (containsServicePortDisabled(captured)) {
        printServicePortDisabledMessage();
        resolve(2);
        return;
      }
      if (timedOut) {
        console.error(`\n微信开发者工具 CLI 超时：${cli} ${redactCommand(commandArgs)}`);
        resolve(124);
        return;
      }
      resolve(code === null ? 1 : code);
    };

    child.stdout.on('data', (chunk) => {
      capturedStdout = appendCapture(capturedStdout, chunk.toString('utf8'));
    });

    child.stderr.on('data', (chunk) => {
      capturedStderr = appendCapture(capturedStderr, chunk.toString('utf8'));
    });

    child.on('error', (error) => {
      capturedStderr = appendCapture(capturedStderr, error && error.message ? error.message : error);
      console.error(`微信开发者工具 CLI 启动失败：${redactSensitive(capturedStderr)}`);
      finish(1);
    });

    child.on('close', (code) => finish(code));
  });
}

function cmdDoctor() {
  const cli = findCli();
  let helpOk = false;
  let helpError = '';
  try {
    execFileSync(cli, ['--help', '--lang', 'zh'], {
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    helpOk = true;
  } catch (error) {
    helpError = redactSensitive(error && error.message ? error.message : String(error));
  }

  const payload = {
    cli,
    app: DEFAULT_MAC_APP,
    version: appVersion(),
    exists: fs.existsSync(cli),
    executable: true,
    help_ok: helpOk,
    help_error: helpError,
    service_port: 'not_checked_run_islogin_to_probe',
  };
  console.log(JSON.stringify(payload, null, 2));
  return 0;
}

async function main() {
  let args;
  try {
    args = parseArgv(process.argv.slice(2));
  } catch (error) {
    fail(error.message);
  }

  if (args.command === 'doctor') {
    return cmdDoctor();
  }

  requireConfirm(args);
  requireNonEmptyUploadFields(args);
  if (Object.prototype.hasOwnProperty.call(args, 'project')) {
    args.project = ensureAbsProject(args.project);
  }

  switch (args.command) {
    case 'islogin':
      return runCli(['islogin'], { timeoutMs: 60000 });
    case 'login': {
      const cliArgs = ['login', '--qr-format', args.qrFormat];
      if (args.qrOutput) cliArgs.push('--qr-output', args.qrOutput);
      if (args.resultOutput) cliArgs.push('--result-output', args.resultOutput);
      return runCli(cliArgs, { timeoutMs: 300000 });
    }
    case 'open':
      return runCli(['open', '--project', args.project]);
    case 'preview': {
      const cliArgs = ['preview', '--project', args.project, '--qr-format', args.qrFormat];
      if (args.qrOutput) cliArgs.push('--qr-output', args.qrOutput);
      if (args.infoOutput) cliArgs.push('--info-output', args.infoOutput);
      return runCli(cliArgs, { timeoutMs: 300000 });
    }
    case 'upload': {
      const cliArgs = ['upload', '--project', args.project, '--version', args.version, '--desc', args.desc];
      if (args.infoOutput) cliArgs.push('--info-output', args.infoOutput);
      return runCli(cliArgs, { timeoutMs: 1800000 });
    }
    case 'build-npm': {
      const cliArgs = ['build-npm', '--project', args.project];
      if (args.compileType) cliArgs.push('--compile-type', args.compileType);
      return runCli(cliArgs, { timeoutMs: 600000 });
    }
    case 'auto': {
      const cliArgs = ['auto', '--project', args.project, '--port', String(args.port)];
      if (args.trustProject) cliArgs.push('--trust-project');
      return runCli(cliArgs, { timeoutMs: 300000 });
    }
    case 'close':
      return runCli(['close', '--project', args.project]);
    case 'quit':
      return runCli(['quit']);
    case 'cache':
      return runCli(['cache', '--project', args.project, '--clean', args.clean]);
    default:
      fail(`未知命令：${args.command}`);
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(redactSensitive(error && error.stack ? error.stack : error));
    process.exit(1);
  });
