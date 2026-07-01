# 微信开发者工具官方接口参考

## 本机路径

- macOS 应用：`/Applications/wechatwebdevtools.app`
- CLI：`/Applications/wechatwebdevtools.app/Contents/MacOS/cli`
- Bundle ID：`com.tencent.webplusdevtools`

## 官方文档

- 命令行 V2：`https://developers.weixin.qq.com/miniprogram/dev/devtools/cli.html`
- 小程序自动化：`https://developers.weixin.qq.com/miniprogram/dev/devtools/auto/`
- 自动化快速开始：`https://developers.weixin.qq.com/miniprogram/dev/devtools/auto/quick-start.html`
- Automator API：`https://developers.weixin.qq.com/miniprogram/dev/devtools/auto/automator.html`

## CLI 基本规则

- 使用 CLI/HTTP 前需要在微信开发者工具「设置 -> 安全设置」开启服务端口。
- 项目路径必须是绝对路径。
- 项目目录必须包含正确格式的 `project.config.json`。
- `--lang zh` 可使用中文帮助。
- `scripts/wxdevtools.js` 使用 `stdio: ['ignore', 'pipe', 'pipe']` 调用 CLI，不继承 stdin，不会向交互提示写入 `y`。
- `scripts/wxdevtools.js` 不支持通过命令行传入 ticket、token、cookie 等敏感值。

## 常用命令

`/absolute/project` 是示例占位，执行前必须替换为真实项目绝对路径。

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli --lang zh -h
/Applications/wechatwebdevtools.app/Contents/MacOS/cli open --project /absolute/project --lang zh
/Applications/wechatwebdevtools.app/Contents/MacOS/cli islogin --lang zh
/Applications/wechatwebdevtools.app/Contents/MacOS/cli login --qr-format terminal --lang zh
/Applications/wechatwebdevtools.app/Contents/MacOS/cli preview --project /absolute/project --qr-format terminal --lang zh
/Applications/wechatwebdevtools.app/Contents/MacOS/cli upload --project /absolute/project --version 1.0.0 --desc "描述" --lang zh
/Applications/wechatwebdevtools.app/Contents/MacOS/cli build-npm --project /absolute/project --lang zh
/Applications/wechatwebdevtools.app/Contents/MacOS/cli auto --project /absolute/project --port 9420 --lang zh
```

`login`、`upload`、`cache`、`close`、`quit` 是高影响动作；即使直接调用原始 CLI，也必须先取得用户明确授权。常规执行优先使用 `scripts/wxdevtools.js`，让脚本级 `--confirm` 门槛生效。

## 代码质量扫描

状态：UI-only fallback。

2026-07-01 在 macOS 微信开发者工具 Stable v2.01.2510290 验证：

- `cli --help --lang zh` 不包含代码质量、quality 或 scan 相关命令。
- 已知 HTTP 端点没有发现代码质量扫描入口。
- `miniprogram-automator` 没有稳定的代码质量扫描入口；它适合页面交互和数据读取，不暴露 DevTools「代码质量」面板能力。
- `core.wxvpkg` 内部可见 `qualityChecker.check`、`setCodeQuality`、`openQualityPanel` 等私有 UI 实现，入口来自「重新扫描」按钮或上传流程里的内部检查，不是官方稳定接口。
- 应用包内可见 `js/common/miniprogram-builder/common/code-analyse/index.js`，但它是构建器依赖图分析模块；另有 `code-analyse-viewer`/`ide.codeAnalyse.send`，显示为「代码依赖分析」，也不等同于截图里的「代码质量」面板。
- 当前项目和 DevTools 缓存中没有发现可复用的 `miniprogram-analyse-result.json` 扫描产物。

因此不要把 `code-analyse` 包装成 `scripts/wxdevtools.js` 命令，也不要承诺 CLI 能运行代码质量扫描。需要读取或运行扫描时，先用 CLI 打开项目，再通过 DevTools UI 的「代码质量」面板处理；只有用户明确要求重新扫描时才点击「重新扫描」。

## 已知 HTTP 端点

CLI 实现中可见本地 `http://127.0.0.1:<port>` 端点：

- `/login`
- `/loginresult`
- `/open`
- `/preview`
- `/autopreview`
- `/upload`
- `/buildnpm`
- `/auto`
- `/close`
- `/quit`
- `/updatePort`
- `/upgrade`

优先使用官方 CLI，不直接调用 HTTP 端点，除非 CLI 无法满足需求且已说明风险。

## 服务端口关闭

如果输出包含以下文本，说明服务端口未开启：

- `IDE service port disabled`
- `工具的服务端口已关闭`
- `开启工具服务`

处理规则：

1. 永远不自动输入 `y`。
2. 永远不复用 CLI 的交互式 `y/N` prompt 来开启服务端口。
3. 告诉用户需要手动打开「设置 -> 安全设置 -> 服务端口」。
4. 用户手动开启后，重新运行原命令。

## 自动化 SDK

安装：

```bash
npm i miniprogram-automator --save-dev
```

典型启动：

```javascript
const automator = require('miniprogram-automator')

const miniProgram = await automator.launch({
  cliPath: '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
  projectPath: '/absolute/project',
  port: 9420,
})
```

可用能力包括页面跳转、读取页面数据、获取元素状态、触发元素事件、注入 AppService 代码和调用 `wx` API。触发元素事件前必须判断是否会产生外部副作用，无法判断时按高风险处理。

## automator-runner 规则

- `tap`、`reLaunch`、`navigateTo` 必须提供 `sideEffectRisk` 和 `intendedEffect`。
- `sideEffectRisk` 只能是 `none`、`possible`、`external-write`。
- 风险不是 `none` 时，必须提供非机械的 `userConfirmation`，说明用户已确认具体业务后果；还必须提供 `confirmedEffect`，且值必须与 `intendedEffect` 完全一致。
- `pageData` 默认脱敏敏感字段；优先设置 `fields` 字符串数组读取必要字段。
- `text` 输出也会脱敏。
- `actionTimeout` 默认 30000ms，可在 action JSON 顶层调整，范围是 100 到 600000。
- `launch`、`currentPage`、每个 action 和 `close` 都受超时保护；`close` 超时时 runner 会打印警告并退出。
- `port` 范围是 1 到 65535，默认 9420。
- `userConfirmation` 不能是 `yes`、`ok`、`confirmed`、`确认`、`可以` 这类机械值，也不能只是这些机械值的拼接，且不能过短。

示例：

```json
{
  "projectPath": "/absolute/project",
  "port": 9420,
  "actionTimeout": 30000,
  "actions": [
    {
      "type": "navigateTo",
      "url": "/pages/detail/index",
      "sideEffectRisk": "none",
      "intendedEffect": "打开只读详情页"
    },
    {
      "type": "pageData",
      "fields": ["title", "status"]
    }
  ]
}
```

## 输出脱敏

`scripts/wxdevtools.js` 会缓冲 CLI stdout/stderr，命令结束后统一脱敏再输出，以覆盖跨 chunk 的 `token=`、`Authorization: Bearer ...` 和完整 `Cookie` header。不要依赖原始 CLI 输出作为敏感信息来源。

如果单个输出流超过捕获上限，脚本会抑制该流内容并输出 `[OUTPUT_TRUNCATED]`，避免截断边界造成敏感字段名丢失但值残留。
