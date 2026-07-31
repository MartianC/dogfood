#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SIDE_EFFECT_RISKS = new Set(['none', 'possible', 'external-write']);
const REVIEWED_ACTIONS = new Set(['tap', 'reLaunch', 'navigateTo']);
const SUPPORTED_ACTIONS = new Set(['reLaunch', 'navigateTo', 'waitFor', 'pageData', 'tap', 'text']);
const SENSITIVE_KEY_RE = /ticket|token|cookie|session|authorization|auth|secret|password|openid|unionid|phone|mobile|email/i;
const MAX_STRING_LENGTH = 2000;
const MAX_OBJECT_KEYS = 100;
const MAX_ARRAY_ITEMS = 100;
const MAX_DEPTH = 6;
const MECHANICAL_CONFIRMATIONS = new Set([
  'y',
  'yes',
  'ok',
  'okay',
  'confirm',
  'confirmed',
  'tap',
  'click',
  '确认',
  '已确认',
  '同意',
  '继续',
  '可以',
]);

function fail(message, detail) {
  const payload = { ok: false, error: redactSensitiveString(message) };
  if (detail) payload.detail = redactSensitiveString(detail);
  console.error(redactSensitiveString(JSON.stringify(payload, null, 2)));
  process.exit(1);
}

function isNonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isMechanicalConfirmation(value) {
  const normalized = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, ' ')
    .trim();
  if (!normalized) return true;
  const parts = normalized.split(/\s+/);
  return parts.every((part) => MECHANICAL_CONFIRMATIONS.has(part));
}

function redactSensitiveString(input) {
  const text = String(input)
    .replace(/\b(authorization)(\s*[:=]\s*)[^\r\n]*/gi, '$1$2[REDACTED]')
    .replace(/\b(cookie|set-cookie)(\s*[:=]\s*)[^\r\n]*/gi, '$1$2[REDACTED]');
  return text
    .replace(
      /\b(ticket|test[-_]?ticket|token|access[-_]?token|refresh[-_]?token|cookie|session|authorization|secret|password)(\s*[:=]\s*["']?)([^"'\s,;&}]+)/gi,
      '$1$2[REDACTED]',
    )
    .replace(
      /(["'](?:ticket|test[-_]?ticket|token|access[-_]?token|refresh[-_]?token|cookie|session|authorization|secret|password)["']\s*:\s*["'])([^"']+)(["'])/gi,
      '$1[REDACTED]$3',
    );
}

function sanitizeString(value) {
  const redacted = redactSensitiveString(value);
  if (redacted.length <= MAX_STRING_LENGTH) return redacted;
  return `${redacted.slice(0, MAX_STRING_LENGTH)}...[TRUNCATED]`;
}

function sanitizeForOutput(value, depth = 0, key = '') {
  if (SENSITIVE_KEY_RE.test(key)) return '[REDACTED]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value !== 'object') return sanitizeString(String(value));
  if (depth >= MAX_DEPTH) return '[MAX_DEPTH]';

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeForOutput(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) items.push(`[TRUNCATED ${value.length - MAX_ARRAY_ITEMS} items]`);
    return items;
  }

  const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS);
  const output = {};
  for (const [childKey, childValue] of entries) {
    output[childKey] = sanitizeForOutput(childValue, depth + 1, childKey);
  }
  const omitted = Object.keys(value).length - entries.length;
  if (omitted > 0) output.__truncatedKeys = omitted;
  return output;
}

function getByPath(data, fieldPath) {
  return fieldPath.split('.').reduce((current, part) => {
    if (current === null || current === undefined) return undefined;
    return current[part];
  }, data);
}

function setByPath(target, fieldPath, value) {
  const parts = fieldPath.split('.');
  let current = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (!Object.prototype.hasOwnProperty.call(current, part)) current[part] = {};
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

function selectFields(data, fields) {
  if (fields === undefined) return data;
  if (!Array.isArray(fields)) throw new Error('pageData.fields 必须是字符串数组');
  const selected = {};
  for (const field of fields) {
    if (!isNonEmpty(field)) throw new Error('pageData.fields 只能包含非空字符串');
    const value = getByPath(data, field);
    if (value !== undefined) setByPath(selected, field, value);
  }
  return selected;
}

function parseInteger(value, name, defaultValue, min, max) {
  const actual = value === undefined ? defaultValue : value;
  const parsed = Number(actual);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} 必须是 ${min} 到 ${max} 之间的整数`);
  }
  return parsed;
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 超时 ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function loadAutomator(projectPath) {
  try {
    return require(path.join(projectPath, 'node_modules', 'miniprogram-automator'));
  } catch (error) {
    try {
      return require('miniprogram-automator');
    } catch (_) {
      fail('未找到 miniprogram-automator。请在项目中运行 npm i miniprogram-automator --save-dev。', error);
    }
  }
}

function readSpec(filePath) {
  const spec = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!path.isAbsolute(spec.projectPath)) fail('projectPath 必须是绝对路径');
  if (!fs.existsSync(spec.projectPath)) fail(`projectPath 不存在：${spec.projectPath}`);
  if (!fs.existsSync(path.join(spec.projectPath, 'project.config.json'))) {
    fail(`项目缺少 project.config.json：${spec.projectPath}`);
  }
  if (!Array.isArray(spec.actions)) fail('actions 必须是数组');
  try {
    spec.port = parseInteger(spec.port, 'port', 9420, 1, 65535);
    spec.timeout = parseInteger(spec.timeout, 'timeout', 30000, 100, 600000);
    spec.actionTimeout = parseInteger(spec.actionTimeout, 'actionTimeout', 30000, 100, 600000);
  } catch (error) {
    fail(error.message);
  }
  return spec;
}

function requireSideEffectReview(action) {
  if (!REVIEWED_ACTIONS.has(action.type)) return;
  if (!SIDE_EFFECT_RISKS.has(action.sideEffectRisk)) {
    fail(`${action.type} 必须声明 sideEffectRisk 为 none、possible 或 external-write。无法判断时使用 possible。`);
  }
  if (!isNonEmpty(action.intendedEffect)) {
    fail(`${action.type} 必须声明 intendedEffect，说明这次动作预计触发的业务效果。`);
  }
  if (action.sideEffectRisk !== 'none') {
    const confirmation = isNonEmpty(action.userConfirmation) ? action.userConfirmation.trim() : '';
    if (confirmation.length < 8 || isMechanicalConfirmation(confirmation)) {
      fail(`${action.type} 可能触发外部副作用；必须先向用户确认具体业务后果，并写入非机械的 userConfirmation。`);
    }
    if (!isNonEmpty(action.confirmedEffect) || action.confirmedEffect.trim() !== action.intendedEffect.trim()) {
      fail(`${action.type} 可能触发外部副作用；confirmedEffect 必须与 intendedEffect 完全一致，作为具体业务后果确认。`);
    }
  }
}

function validateActions(actions) {
  for (const action of actions) {
    if (!SUPPORTED_ACTIONS.has(action.type)) fail(`不支持的 action type：${action.type}`);
    if ((action.type === 'reLaunch' || action.type === 'navigateTo') && !isNonEmpty(action.url)) {
      fail(`${action.type} 必须提供非空 url`);
    }
    if ((action.type === 'tap' || action.type === 'text') && !isNonEmpty(action.selector)) {
      fail(`${action.type} 必须提供非空 selector`);
    }
    if (action.type === 'waitFor') {
      try {
        parseInteger(action.ms, 'waitFor.ms', 500, 0, 600000);
      } catch (error) {
        fail(error.message);
      }
    }
    if (action.type === 'pageData' && action.fields !== undefined) {
      try {
        selectFields({}, action.fields);
      } catch (error) {
        fail(error.message);
      }
    }
    requireSideEffectReview(action);
  }
}

async function runAction(miniProgram, state, action) {
  requireSideEffectReview(action);
  switch (action.type) {
    case 'reLaunch':
      state.page = await miniProgram.reLaunch(action.url);
      return { type: action.type, url: action.url };
    case 'navigateTo':
      state.page = await miniProgram.navigateTo(action.url);
      return { type: action.type, url: action.url };
    case 'waitFor':
      {
        const ms = parseInteger(action.ms, 'waitFor.ms', 500, 0, 600000);
        await state.page.waitFor(ms);
        return { type: action.type, ms };
      }
    case 'pageData': {
      const data = await state.page.data();
      return { type: action.type, data: sanitizeForOutput(selectFields(data, action.fields)) };
    }
    case 'tap': {
      const element = await state.page.$(action.selector);
      if (!element) throw new Error(`未找到元素：${action.selector}`);
      await element.tap();
      return {
        type: action.type,
        selector: action.selector,
        sideEffectRisk: action.sideEffectRisk,
        intendedEffect: action.intendedEffect,
      };
    }
    case 'text': {
      const element = await state.page.$(action.selector);
      if (!element) throw new Error(`未找到元素：${action.selector}`);
      return { type: action.type, selector: action.selector, text: sanitizeForOutput(await element.text()) };
    }
    default:
      throw new Error(`不支持的 action type：${action.type}`);
  }
}

async function connectOrLaunch(automator, spec) {
  const wsEndpoint = `ws://127.0.0.1:${spec.port}`;
  if (typeof automator.connect === 'function') {
    try {
      const miniProgram = await withTimeout(
        automator.connect({ wsEndpoint }),
        Math.min(spec.timeout, 2000),
        '连接已有自动化会话',
      );
      return { miniProgram, session: 'reused' };
    } catch (_) {
      // 没有可复用会话时才启动工程；连接失败是正常的首次运行路径。
    }
  }

  const miniProgram = await withTimeout(
    automator.launch({
      cliPath: spec.cliPath || '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
      projectPath: spec.projectPath,
      port: spec.port,
      timeout: spec.timeout,
      projectConfig: spec.projectConfig,
    }),
    spec.timeout,
    'launch',
  );
  return { miniProgram, session: 'launched' };
}

async function releaseMiniProgram(miniProgram, timeoutMs) {
  if (!miniProgram) return;
  if (typeof miniProgram.disconnect === 'function') {
    try {
      await withTimeout(Promise.resolve(miniProgram.disconnect()), timeoutMs, '断开自动化连接');
    } catch (error) {
      console.error(
        redactSensitiveString(
          JSON.stringify({ ok: false, warning: '断开自动化连接失败', detail: error && error.message ? error.message : error }),
        ),
      );
    }
    return;
  }
  if (typeof miniProgram.close !== 'function') return;
  try {
    await withTimeout(miniProgram.close(), timeoutMs, '关闭 miniProgram');
  } catch (error) {
    console.error(
      redactSensitiveString(
        JSON.stringify({ ok: false, warning: '关闭 miniProgram 失败', detail: error && error.message ? error.message : error }),
      ),
    );
  }
}

async function main() {
  const actionFile = process.argv[2];
  if (!actionFile) fail('用法：automator-runner.js <actions.json>');

  const spec = readSpec(actionFile);
  validateActions(spec.actions);
  const automator = loadAutomator(spec.projectPath);
  let miniProgram;
  let session;
  const results = [];
  try {
    ({ miniProgram, session } = await connectOrLaunch(automator, spec));

    const state = {
      page: await withTimeout(miniProgram.currentPage(), spec.actionTimeout, 'currentPage'),
    };
    for (const action of spec.actions) {
      results.push(await withTimeout(runAction(miniProgram, state, action), spec.actionTimeout, `${action.type} action`));
    }
  } finally {
    await releaseMiniProgram(miniProgram, spec.actionTimeout);
  }
  console.log(redactSensitiveString(JSON.stringify({ ok: true, session, results }, null, 2)));
}

main().catch((error) => fail('自动化执行失败', error && error.stack ? error.stack : error));
