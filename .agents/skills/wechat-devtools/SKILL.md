---
name: wechat-devtools
description: Use when Codex needs to interact with WeChat Developer Tools, 微信开发者工具, 微信小程序预览, 上传, build-npm, CLI, HTTP service port, miniprogram-automator automation, code quality scan/quality panel, or 代码质量扫描/代码质量面板.
---

# WeChat DevTools

## 核心规则

优先通过官方 CLI、HTTP 服务和 `miniprogram-automator` 与微信开发者工具交互。默认不要使用 computer use 点按界面。

代码质量分两层处理：先运行 skill 自带的只读静态预检；需要编译包精确结果时，再把 DevTools「代码质量」面板作为 UI-only fallback。当前已验证版本没有稳定的官方 CLI、HTTP 或 `miniprogram-automator` 扫描入口。

## 默认流程

1. 定位项目绝对路径，确认存在 `project.config.json`。
2. 运行 `scripts/wxdevtools.js doctor` 确认 CLI 路径和工具版本。
3. 只要本轮修改了小程序代码、配置或资源，交付前必须运行 `scripts/check-code-quality.js`；执行预览或上传前也必须先运行。不要用项目自己的包体检查代替它。
4. 对打开、预览、构建 npm 等低风险动作，使用 `scripts/wxdevtools.js`。
5. 对页面级交互，优先让项目安装 `miniprogram-automator`，再使用 `scripts/automator-runner.js`。
6. 需要编译包精确结果时，先打开项目，再按“代码质量扫描”小节使用 DevTools UI。
7. 对登录、上传、退出、关闭项目、清缓存等高影响动作，先向用户确认，并在脚本命令中传入对应 `--confirm <command>`。

## 服务端口关闭

如果 CLI 输出提示服务端口关闭，不要自动输入 `y`，也不要在用户授权后向交互式 `y/N` prompt 写入 `y`。说明需要用户手动打开「微信开发者工具 -> 设置 -> 安全设置 -> 服务端口」，手动开启后重新运行命令。

## 代码质量扫描

### 本地静态预检

`scripts/check-code-quality.js` 按官方 DevTools 当前 13 条规则逐项输出结果，状态分为：

- `通过`：脚本可以可靠判定且未发现问题。
- `未通过`：脚本发现确定问题，退出码为 `1`；修复后必须重跑。
- `需复核`：规则依赖 DevTools 编译包或私有依赖分析，脚本不会伪装成官方扫描结果。

其中“主包内不应存在主包未使用的 JS 文件”按官方依赖图的直接父依赖语义实现：主包 JS 若被编译图收录、只由分包侧到达，且没有任何主包 JS、页面或组件直接父节点，则失败。不要把“所有分包入口遍历后可达”当成通过条件。

```bash
node /absolute/path/to/wechat-devtools/scripts/check-code-quality.js --project /absolute/project
node /absolute/path/to/wechat-devtools/scripts/check-code-quality.js --project /absolute/project --json
```

规则失败时报告文件路径但不自动修复；AppSecret 检查永远不输出疑似密钥内容。项目缺配置、JSON/JS 解析失败或依赖图无法可信建立时，关闭检查并以退出码 `2` 失败。

### 官方面板复核

代码质量面板在当前验证版本中没有公开 CLI、HTTP 或 `miniprogram-automator` 接口。需要读取或运行官方扫描时：

1. 先用 `scripts/wxdevtools.js open --project /absolute/project` 打开项目。
2. 使用 computer use 定位底部「代码质量」面板；读取已有结果是低风险。
3. 只有用户明确要求重新运行扫描时，才点击「重新扫描」；等待完成后只摘录通过状态、问题分类、文件路径和必要说明。
4. 不要点击「查看教程」、自动修复、上传、登录或任何会修改项目/账号状态的入口；需要修代码时回到正常代码修改和测试流程。
5. 不要把内部 `code-analyse` 模块包装成代码质量扫描命令；它是构建器依赖图分析，不等同于 DevTools 代码质量面板结果。

## 常用命令

下面的 `/absolute/project` 是示例占位，执行前必须替换为真实项目绝对路径。

```bash
node /absolute/path/to/wechat-devtools/scripts/check-code-quality.js --project /absolute/project
/absolute/path/to/wechat-devtools/scripts/wxdevtools.js doctor
/absolute/path/to/wechat-devtools/scripts/wxdevtools.js open --project /absolute/project
/absolute/path/to/wechat-devtools/scripts/wxdevtools.js preview --project /absolute/project
/absolute/path/to/wechat-devtools/scripts/wxdevtools.js build-npm --project /absolute/project
/absolute/path/to/wechat-devtools/scripts/wxdevtools.js auto --project /absolute/project --port 9420
/absolute/path/to/wechat-devtools/scripts/wxdevtools.js upload --project /absolute/project --version 1.0.0 --desc "描述" --confirm upload
```

本地静态预检不是 `wxdevtools.js` 的伪造官方命令；需要官方扫描时，先用 `open` 打开项目，再按上面的 UI-only 流程读取或重新扫描。

## 页面自动化

如果用户需要点击、读取页面状态、跳转页面或验证小程序界面，使用 `scripts/automator-runner.js`。如果项目没有安装 `miniprogram-automator`，先说明需要添加开发依赖，并征得用户同意。

`tap`、`reLaunch` 和 `navigateTo` 之前必须判断副作用风险。无法确认是否会触发后端写入、支付、通知、删除、上传等外部副作用时，按高风险处理，并向用户确认具体业务后果。

`userConfirmation` 必须记录具体业务后果，不能只写或拼接 `yes`、`ok`、`confirmed`、`确认`、`可以` 这类机械确认。风险不是 `none` 时，action 还必须提供 `confirmedEffect`，且值必须与 `intendedEffect` 完全一致，作为调用前的具体后果确认。

`pageData` 和 `text` 输出会默认脱敏。读取页面数据时优先用 `fields` 白名单缩小范围，不要把完整页面状态当作最终答案原样贴给用户。

## 敏感数据

不要读取、打印或通过命令行传入登录态、ticket、token、cookie 等敏感值。`scripts/wxdevtools.js` 不支持 `--ticket` 或 `--test-ticket`。

## 何时读取 reference

需要确认 CLI 参数、HTTP 端点、服务端口错误、自动化 SDK 启动参数或代码质量扫描边界时，读取 `references/official-interfaces.md`。

## 常见错误

| 错误 | 正确处理 |
| --- | --- |
| 直接打开 computer use 点预览按钮 | 先用 CLI `preview` |
| 服务端口关闭时自动输入 y | 停下并要求用户手动开启服务端口 |
| 用户授权后向 CLI 的 y/N prompt 写入 y | 仍然不写入，等用户手动开启后重跑命令 |
| 使用 `printf 'y\n' \| cli ...` 或继承 stdin 处理服务端口 | 使用 `scripts/wxdevtools.js`，让 stdin 保持 `ignore` |
| 上传时缺少版本号或描述 | 先询问版本号和描述 |
| 执行高影响命令但没有 `--confirm` | 先取得用户明确授权，再传入对应确认参数 |
| 项目路径使用相对路径 | 要求用户提供真实项目绝对路径 |
| 页面级操作直接点 UI | 使用 `miniprogram-automator` |
| 小程序改动完成后只运行项目测试或包体检查 | 额外运行 `scripts/check-code-quality.js`，修复所有确定失败项 |
| 把本地静态预检说成官方扫描 | 预检只负责可稳定复现规则；编译包精确结果仍使用 UI-only fallback |
| 把代码质量扫描当成官方 CLI 命令 | 官方扫描是 UI-only fallback；先 `open` 项目，再读取「代码质量」面板 |
| 为了代码质量结果封装内部 `code-analyse` | 不要封装；它不是代码质量面板的稳定接口 |
| 未经用户要求点击「重新扫描」 | 只读取已有结果；用户明确要求扫描时才点「重新扫描」 |
| `tap` 只写 `"confirm": "tap"` | 说明具体业务后果并记录明确用户确认 |
| `userConfirmation` 只写 `yes`、`ok`、`confirmed`，或拼接机械确认词 | 写明用户确认的具体业务后果，并让 `confirmedEffect` 与 `intendedEffect` 完全一致 |
| `navigateTo` 或 `reLaunch` 不声明页面加载副作用 | 补充 `sideEffectRisk`、`intendedEffect`，风险不为 `none` 时记录用户确认 |
| 原样输出 `pageData` | 使用 runner 的脱敏结果，并优先设置 `fields` |
| 通过命令行传入 ticket/token/cookie | 停止，避免敏感值进入进程列表或日志 |
