---
name: miniapp-ui-system
description: "Use when designing, refactoring, initializing, or enforcing a stable WeChat Mini Program frontend UI system: design tokens, UI Kernel primitives, third-party component wrappers, WXSS style isolation, AI frontend rules, scaffold generation, or UI consistency checks."
---

# Miniapp UI System

## 核心原则

把小程序前端从“页面各自写样式”升级为“设计 token + UI Kernel + vendor wrapper + 业务组件组合 + 自动检查”。目标是让 AI 和人类开发者都只能沿着清晰接口扩展 UI，而不是改一个全局类影响一批页面。

## 何时使用

- 要建立或重构微信小程序前端开发模式。
- 要稳定保持设计语言、按钮/卡片/标签/提示等基础组件风格。
- 要接入 TDesign、Vant Weapp、WeUI 等组件库，但不希望页面直接依赖第三方组件。
- 要创建自定义组件、组件变体、设计 token、WXSS 样式隔离规范。
- 要初始化项目脚手架或增加 UI 自动检查。
- 要把 Figma 设计稿、variables、modes、Dev Mode 信息落地为微信小程序 UI。

## 决策

| 场景 | 推荐 |
| --- | --- |
| 未引入组件库的微信小程序 | 原生小程序 + 自研 `components/ui/*` + 设计 token |
| 已引入 TDesign/Vant/WeUI 等组件库 | 基础视觉组件优先包装组件库，暴露为项目自己的 `components/ui/*` |
| 表单、弹窗、Picker、Toast、Upload 等标准控件 | 通过 `components/vendor/*` 或 `components/ui/*` 包装组件库 |
| 首页 Hero、核心内容卡片、结果页、分享图等强视觉体验 | 组合 `components/ui/*`，必要时自研业务组件 |
| 多端确定要上线，团队需要 React/Vue | Taro/uni-app + UI Kernel + Tailwind/组件库 |

## 工作流

1. 先读项目设计文档、现有 `app.wxss`、`components/` 和 `pages/`，确认当前风格和重复样式。
2. 需要初始化脚手架时，优先运行脚本 dry-run：

```bash
node .agents/skills/miniapp-ui-system/scripts/init-ui-system.js --project . --dry-run
```

3. 用户确认后再执行真实初始化：

```bash
node .agents/skills/miniapp-ui-system/scripts/init-ui-system.js --project .
```

4. 初始化后，新 UI 必须先做组件来源判断：已有项目组件、组件库可包装能力、自研组件。
5. 已引入组件库时，按钮、卡片、标签、输入、提示等基础视觉组件优先通过组件库包装实现；复杂、强视觉、高自定义需求再用 UI Kernel 组合或自研。
6. 页面不直接使用第三方组件标签；组件库能力必须收敛到 `components/ui/*` 或 `components/vendor/*`。
7. 改 UI 前说明使用哪些 token、哪些 UI 组件、是否新增变体；完成后运行 `npm run check:ui` 和项目测试。
8. 涉及 Figma 设计稿落地时，先读 `references/figma-handoff.md`；Figma 是设计输入源，不直接替代小程序 UI 架构。

## 参考资料

- 架构和目录规范：读 `references/ui-system-architecture.md`。
- Figma 设计稿落地：读 `references/figma-handoff.md`。
- Figma token 转换细则：读 `references/figma-token-mapping.md`。
- AI 前端开发规则：读 `references/ai-frontend-rules.md`。
- 脚手架说明：读 `references/scaffold.md`。

## 常见错误

- 不要把 Taro、Tailwind 或 TDesign 当成设计系统本身；它们只是工程工具或控件库。
- 不要在已引入组件库时重复自研基础视觉组件；先确认组件库是否可通过 props、theme、slot、externalClasses 或 wrapper 适配。
- 不要在页面新增 `.button`、`.card`、`.tag`、`.notice`、`.title` 这类全局泛名。
- 不要在页面直接引用 `<t-button>`、`<van-button>`；先做 vendor wrapper。
- 不要在普通页面/组件里新增裸 hex 色值；先把语义 token 加到 `styles/tokens.wxss`。
- 不要把 Figma Dev Mode 的 CSS 片段直接粘成 WXSS；先映射 token、组件和小程序可支持的布局子集。
- 不要用全局 WXSS 解决局部组件问题；优先用 `styleIsolation: "isolated"` 和明确的 `externalClasses`。
