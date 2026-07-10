# 脚手架初始化

## 命令

先 dry-run：

```bash
node .agents/skills/miniapp-ui-system/scripts/init-ui-system.js --project . --dry-run
```

确认后执行：

```bash
node .agents/skills/miniapp-ui-system/scripts/init-ui-system.js --project .
```

覆盖已有脚手架文件：

```bash
node .agents/skills/miniapp-ui-system/scripts/init-ui-system.js --project . --force
```

自定义 token 前缀：

```bash
node .agents/skills/miniapp-ui-system/scripts/init-ui-system.js --project . --token-prefix acme
```

生成 Figma handoff 模板：

```bash
node .agents/skills/miniapp-ui-system/scripts/init-ui-system.js --project . --with-figma
```

## 生成内容

- `styles/tokens.wxss`
- `styles/typography.wxss`
- `styles/utilities.wxss`
- `components/ui/ui-button`
- `components/ui/ui-card`
- `components/ui/ui-tag`
- `components/ui/ui-notice`
- `components/ui/ui-field`
- `components/ui/ui-empty`
- `components/vendor/.gitkeep`
- `docs/ui/design-system.md`
- `docs/ui/component-contracts.md`
- `docs/ui/ai-frontend-rules.md`
- `scripts/check-ui-system.js`
- `package.json` 中的 `check:ui` 脚本
- 已存在 AI 入口文档中的 UI 文档索引，例如 `AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`.github/copilot-instructions.md`、`.cursorrules`、`.cursor/rules/*`、`.windsurfrules`

使用 `--with-figma` 时额外生成：

- `docs/ui/figma-handoff.md`
- `docs/ui/figma-source-manifest.json`
- `docs/ui/figma-token-map.json`
- `docs/ui/figma-component-map.json`
- `docs/ui/figma-implementation-notes.md`
- `scripts/figma-tokens-to-wxss.js`

默认生成的是无组件库也能运行的 UI 基线。如果项目已经确定使用 TDesign、Vant Weapp、WeUI 等组件库，应把 `components/ui/*` 的内部实现改为包装组件库能力，而不是继续重复维护一套基础视觉实现。

## 安全策略

- 默认不覆盖已有文件。
- `--dry-run` 只打印会创建/跳过/更新的文件。
- `--force` 才覆盖已有脚手架文件。
- `--token-prefix` 默认是 `mp`，会生成 `--mp-*`；传入项目短名前缀后会生成对应 token。
- `--with-figma` 显式生成 Figma handoff 模板；默认不生成，避免普通项目负担。
- 脚本只追加或更新 `package.json` 的 `scripts.check:ui`。
- 生成的 `check:ui` 会阻止页面层直接使用常见组件库标签，例如 `<t-*>`、`<van-*>`。
- 脚本只更新已存在的 AI 入口文档，不主动创建 `CLAUDE.md`、`GEMINI.md`、Cursor/Windsurf/Copilot 配置等新入口，避免给未使用的 AI 工具制造噪音。
- AI 入口文档的 UI 索引用 `miniapp-ui-system:docs` marker 维护，重复执行脚本会替换旧块，不会反复追加。

## 初始化后下一步

1. 在 `app.wxss` 顶部手动引入：

```css
@import "./styles/tokens.wxss";
@import "./styles/typography.wxss";
@import "./styles/utilities.wxss";
```

2. 逐步迁移页面按钮到 `ui-button`。
3. 如果项目已引入组件库，先把 `ui-button`、`ui-card`、`ui-tag`、`ui-field` 等基础视觉组件改成组件库 wrapper。
4. 检查项目实际使用的 AI 入口文档，确认它们能指向 `docs/ui/*`。
5. 如果使用 Figma，先填写 `docs/ui/figma-source-manifest.json`、`figma-token-map.json` 和 `figma-component-map.json`。
6. 运行：

```bash
npm run check:ui
npm test
```
