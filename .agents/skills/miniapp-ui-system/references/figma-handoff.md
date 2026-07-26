# Figma 设计稿落地

## 目录

- [定位](#定位)
- [前置输入](#前置输入)
- [获取路径](#获取路径)
- [能力分层](#能力分层)
- [设计稿质量门槛](#设计稿质量门槛)
- [Token 映射](#token-映射)
- [组件映射](#组件映射)
- [布局映射](#布局映射)
- [实施流程](#实施流程)
- [还原实施门禁](#还原实施门禁)
- [返工复盘](#返工复盘)
- [禁止项](#禁止项)
- [验收清单](#验收清单)
- [资料依据](#资料依据)

## 定位

Figma 是设计输入源；小程序工程仍以 `styles/tokens.wxss`、`components/ui/*`、`components/vendor/*`、`components/domain/*` 和检查脚本作为落地边界。不要把 Figma 图层、Dev Mode CSS 或截图直接等同于小程序实现。

## 前置输入

开始前先确认：

- Figma frame 或 layer 链接，最好包含 `node-id`。
- 目标页面、目标小程序框架、是否已有组件库。
- 设计稿基准宽度，例如 375px、390px、414px 或 750px。
- 是否能使用 Figma MCP、REST token、variables/modes 导出。
- 是否有组件变体、资产导出标记、图标授权和切图格式要求。
- 是否存在必须接受的设计差异，例如小程序不支持的复杂效果。

记录 source manifest：

```json
{
  "status": "draft|ready",
  "fileKey": "",
  "nodeId": "",
  "sourceMethod": "mcp|rest|manual",
  "figmaVersion": "",
  "branch": "",
  "frameWidthPx": 375,
  "tokenPrefix": "mp",
  "componentLibrary": "none|tdesign|vant|weui",
  "notes": ""
}
```

## 获取路径

优先级：

1. Figma MCP：用于读取 frame/layer 结构、组件和设计上下文。remote server 通常依赖链接和 node id；desktop selection 工作流只适合本地 desktop server。
2. Figma REST API：用于读取 file/node JSON、组件、样式、图片渲染和变量。注意 Variables API 有权限、seat、scope 和团队计划限制。
3. 手动导出：variables/modes JSON、关键截图、资产包、设计说明。

截图只能作为视觉比对材料，不能作为 token 唯一来源。Code Connect 只能作为可选增强；没有配置 CLI、publish、权限和组件映射时，不要承诺 Dev Mode 会稳定复用真实代码。

## 能力分层

| 用户条件 | skill 使用方式 |
| --- | --- |
| 有 Figma MCP | 通过 MCP 读取 frame/node、组件层级和设计上下文；variables/modes 仍需确认来源 |
| 有 Figma API 权限 | 读取 file/nodes/variables JSON，生成 token 和组件映射草案 |
| 只有链接、截图或 Dev Mode 信息 | 通过人工导出的规格表、variables JSON、截图和 handoff checklist 落地 |

任何路径都不能跳过 `Figma -> token -> ui/vendor/domain -> page`。skill 不承诺一键 Figma 转小程序。

## 设计稿质量门槛

进入实现前检查：

- 颜色、字号、圆角、间距、阴影优先使用 Figma variables 和 modes。
- 重复元素应是 Figma components，变体命名清晰。
- 页面 frame 尺寸和小程序目标 viewport 有明确换算关系。
- Auto Layout 信息完整；绝对定位和复杂叠层需要单独记录。
- 图片、图标、插画有导出设置和授权说明。
- 设计稿和组件库冲突时，先判断能否通过 theme、props、slot、externalClasses 或 wrapper 适配。

## Token 映射

Figma variable 不等于最终小程序 token。先建立映射，再改 `styles/tokens.wxss`。

完整字段、px 到 rpx 和 DTCG 规则见 `references/figma-token-mapping.md`。核心结构：

```json
{
  "sourceKind": "figma-variable|figma-style|manual",
  "collection": "",
  "name": "",
  "type": "color|dimension|font|shadow|radius|spacing",
  "mode": "default",
  "value": "",
  "unit": "px|rpx|none",
  "aliasChain": [],
  "scope": "",
  "target": "--mp-color-primary",
  "status": "mapped|pending|ignored",
  "reason": ""
}
```

如果使用 DTCG 格式，保持 `$value`、`$type`、`$description` 等字段，不要和 Figma 原始导出混写成一种格式。

px 到 rpx 的默认换算：

```text
rpx = px * 750 / frameWidthPx
```

必须在 manifest 里记录 `frameWidthPx`。375px 设计稿通常是 `1px = 2rpx`；390px、414px 或 750px 设计稿不能让 AI 自行猜。

## 组件映射

新增组件前按顺序判断：

1. 项目已有 `components/ui/*` 或 `components/domain/*` 是否能满足。
2. 已引入组件库是否有现成组件，或能通过 props、theme、slot、externalClasses、wrapper 适配。
3. 基础视觉组件优先包装为 `components/ui/*`。
4. 标准能力组件包装为 `components/vendor/*` 或 `components/ui/*`。
5. 强视觉、高定制、复杂交互模块再用 UI Kernel 组合或自研。

组件映射至少记录：

| Figma 组件 | 变体 | 组件库候选 | 目标路径 | usingComponents | 自研原因 |
| --- | --- | --- | --- | --- | --- |
| Button | primary/disabled | TDesign Button | `components/ui/ui-button` | `ui-button` | 无 |

## 布局映射

可直接映射的 Auto Layout 子集：

- `HORIZONTAL` / `VERTICAL` -> `display: flex` 和 `flex-direction`。
- padding、item spacing -> token 化间距。
- align -> `align-items` / `justify-content`。
- FILL/HUG/FIXED -> 结合 `flex`、`width`、`min-width`、`height` 判断。

需要记录差异或人工处理：

- 绝对定位、复杂 constraints、overlay。
- clip、mask、blend mode、复杂渐变和多层 effects。
- 多层 shadow、backdrop blur、滤镜。
- 依赖 Web CSS 但 WXSS 不稳定支持的属性。

## 实施流程

1. Intake：确认输入、权限、manifest 和设计稿质量。
2. Mapping：先映射 token，再映射组件，再映射页面布局。
3. Decision：判断组件库包装、自研或业务组件组合。
4. Implementation：只通过 token、`ui-*`、`vendor-*` 和 `domain-*` 改小程序。
5. Verification：运行 `npm run check:ui`、项目测试、微信开发者工具编译和截图比对。
6. Differences：记录无法等价还原的设计差异和原因。

## 还原实施门禁

Figma 还原度是交付标准，不因是否使用组件库而降低。组件库只是实现手段，不能成为尺寸、层级、间距、状态或交互不一致的理由。

### 规格冻结

开始写 WXML/WXSS 前，必须把目标 frame 转成可执行规格，至少记录：

- frame/node、设计稿基准宽度、目标 viewport 和安全区。
- 内容区边距、主要区域宽高、间距、层级和滚动关系。
- 重复元素的目标尺寸：Card、Cell、Input、Button、Popup、图标和点击区域。
- 空态、加载态、错误态、长文案、长列表和输入态。
- Figma component/variant 到项目组件的映射。

“Card Style”“固定底部”等设计语言必须转换成工程约束。页面已有 padding 时，要检查组件默认 margin，避免嵌套间距造成宽度偏差。

### 组件默认值审计

引入组件库组件前，检查实际默认的 padding、margin、min-height、line-height、border、background、radius、shadow，以及公开的 props、theme、slot、CSS variables 和 external class。

样式隔离下不能假设页面传入的 `class` 可以覆盖组件内部节点。优先使用组件公开的覆盖能力和 wrapper；无法满足设计要求时，记录差异后再组合或自研。

### 先布局后业务

复杂页面先实现不带业务数据的布局骨架，再接入业务状态。骨架必须包含真实尺寸的身份区、代表性 Card/Cell/Input、滚动容器、固定底部操作和悬浮层。

滚动和固定布局必须显式设置父容器高度、`flex`、`min-height`、`scroll-view` 高度、安全区和内容 padding。不能只依赖 `flex: 1` 或组件默认高度。至少检查 0 条、1 条、设计稿数量和长列表四种状态，确认最后一项可以滚动到固定层上方完整显示。

### 真实视觉验收

`npm test`、`npm run check:ui` 和 `build-npm` 只能证明代码、静态规则和编译通过，不能替代视觉验收。完成实现后：

1. 用微信开发者工具执行 `build-npm`，确认无 warning。
2. 用 `miniprogram-automator` 或项目提供的 automator runner 进入目标页面并截图。
3. 使用与 Figma 相同的 viewport、缩放和安全区，对比空态、正常态、输入态、错误态和长列表态。
4. 逐项检查结构、边界、宽高、间距、文字、颜色、圆角、阴影、固定层和滚动行为。
5. 差异必须先归因于规格、组件默认值、页面布局或运行时渲染，再修改对应边界；不能通过页面层随机叠加 margin、height 或 position 试错。

如果 automator 不可用，不能把“仅通过编译”标记为视觉完成，应请求安装或改用开发者工具人工截图，并明确记录剩余风险。

## 返工复盘

每次用户反馈返工或预览发现 UI 问题时，先记录：

- 症状和可复现状态。
- 根因类别：设计规格遗漏、组件默认值、布局约束、运行时差异、数据状态或验证缺口。
- 修复边界、验证结果和仍存在的风险。
- 下一次应增加的规格、检查、契约或自动化步骤。

返工经验先进入工作日志和实现说明，不自动修改技能。只有获得明确批准后，才将可复用的通用规则提炼到技能中；不要把具体项目名称、页面编号、业务字段或一次性尺寸写入通用技能。

### 通用返工模式

- 页面 padding 与组件库默认 margin 叠加，导致 Card 或 Cell 宽度偏窄。
- 组件默认 padding、border 或 line-height 与设计稿不同，导致输入框或 Cell 过高。
- 把一个连续 Cell Group 机械拆成多个 Card，导致层级和分割线不一致。
- flex 布局中的 `scroll-view` 没有明确高度，导致编译通过但运行时内容不可见。
- 只做静态节点断言或编译验证，没有同 viewport 的真实截图和长列表交互验证。
- 样式隔离下错误假设普通 `class` 可以覆盖第三方组件内部节点。

## 禁止项

- 不要直接粘贴 Figma Dev Mode CSS 到 WXSS。
- 不要把每个 Figma 图层机械转换成小程序组件。
- 不要只凭截图抽色并写入页面 WXSS。
- 不要自动覆盖现有 tokens；先输出 token diff 和原因。
- 不要跳过组件库重复自研基础视觉组件。
- 不要让页面直接使用 `<t-*>`、`<van-*>` 等第三方标签。

## 验收清单

- source manifest 已记录 file、node、version、frame width 和来源方式。
- token 映射表能解释每个新增或修改 token 的来源。
- 组件映射表能解释每个 Figma component 的目标路径。
- 不支持或降级的视觉效果已记录。
- `npm run check:ui` 和项目测试通过；无法运行时说明原因。
- 关键页面在微信开发者工具中截图，并与 Figma 做人工差异审查。

## 资料依据

- Figma variables 和 modes：`https://help.figma.com/hc/en-us/articles/15339657135383-Guide-to-variables-in-Figma`
- Figma REST file/node/variables API：`https://developers.figma.com/docs/rest-api/`
- Figma MCP Server：`https://developers.figma.com/docs/figma-mcp-server/`
- Figma Code Connect：`https://developers.figma.com/docs/code-connect/`
- Design Tokens Community Group format：`https://www.designtokens.org/tr/drafts/format/`
- 微信小程序 WXSS 和自定义组件样式隔离：`https://developers.weixin.qq.com/miniprogram/dev/framework/`
