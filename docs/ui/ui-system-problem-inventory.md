# 小程序 UI 系统问题清单

> 盘点日期：2026-07-09
> 依据：`.agents/skills/miniapp-ui-system/SKILL.md`、`references/ui-system-architecture.md`、`references/ai-frontend-rules.md`、`references/scaffold.md`、现有 `app.wxss`、`pages/`、`components/`、`subpackages/`。

## 结论

当前 UI 实现已经能支撑 MVP 页面，但仍属于“全局通用类 + 页面和组件各自补样式”的阶段。它和 miniapp-ui-system 规范的主要差距在于：没有设计 token，没有 UI Kernel，没有自动检查，页面和业务组件直接依赖 `.button`、`.card`、`.tag`、`.notice` 等全局基础样式，组件也没有显式样式隔离。

因此后续不应继续在页面里追加同类 WXSS，而应先建立 `styles/*`、`components/ui/*`、`components/vendor/*` 和 `scripts/check-ui-system.js`，再按页面风险逐步迁移。

## 问题分级

| 等级 | 含义 | 处理建议 |
| --- | --- | --- |
| P0 | 会继续放大 UI 维护成本或违反规范硬约束 | 第一阶段处理 |
| P1 | 影响一致性、可复用性和后续迁移效率 | 第二阶段处理 |
| P2 | 视觉质量、长文案和细节体验问题 | 随页面迁移处理 |

## P0 问题

### 1. 缺少设计 token 和样式分层

现状：

- 仓库没有 `styles/` 目录。
- `app.wxss` 直接维护颜色、字号、圆角、阴影、按钮、卡片、标签、提示、表单等基础视觉。
- 页面和组件 WXSS 中存在大量裸色值，例如 `#25684a`、`#edf4ee`、`#d8e1da`、`rgba(20, 37, 28, 0.06)`。

影响：

- 颜色、圆角、阴影和字体没有唯一来源。
- 后续调整品牌色或暗色/高对比模式时需要跨页面替换。
- AI 或开发者容易继续复制裸值，造成视觉漂移。

证据：

- `app.wxss` 第 1 到 236 行承担了全局视觉和基础组件样式。
- `pages/recipes/list/index.wxss`、`pages/recipes/detail/index.wxss`、`pages/plan/index/index.wxss`、`pages/profile/index/index.wxss`、`components/*/index.wxss` 都直接写裸色值。
- `pages/plan/index/index.js` 中 canvas 分享图也直接写 `#ffffff`、`#17201b`、`#25684a` 等颜色。
- `app.json` 中 `window` 和 `tabBar` 也直接写 `#ffffff`、`#f4f8f3`、`#6f7b73`、`#25684a` 等颜色；小程序 JSON 不能直接读取 WXSS token，后续需要单独记录同步规则。

### 2. 缺少 UI Kernel

现状：

- 仓库没有 `components/ui/`。
- 页面直接使用 `<button class="button">`、`<view class="card">`、`<text class="tag">`、`<view class="notice">`。
- 已存在 `empty-state`，但它位于 `components/empty-state`，不是统一的 `components/ui/ui-empty` 契约。

影响：

- 按钮、卡片、标签、提示、输入、空状态没有统一接口。
- 加载、禁用、错误、长文案等状态无法在基础组件层统一处理。
- 页面迁移和视觉验收缺少稳定边界。

证据：

- `node .agents/skills/miniapp-ui-system/scripts/init-ui-system.js --project . --dry-run` 显示会新增 `components/ui/ui-button`、`ui-card`、`ui-tag`、`ui-notice`、`ui-field`、`ui-empty`。
- `pages/home/index.wxml`、`pages/recipes/detail/index.wxml`、`subpackages/custom-recipe/edit/index.wxml`、`subpackages/dog-profile/dog-edit/index.wxml` 等页面直接使用全局 `.button`、`.card`、`.field`、`.input`。

### 3. 全局泛名选择器过多

现状：

- `app.wxss` 定义了 `.hero`、`.title`、`.subtitle`、`.section`、`.section-title`、`.link`、`.card`、`.stack`、`.row`、`.muted`、`.tiny`、`.tag`、`.button`、`.notice`、`.field`、`.input`、`.grid-2`、`.metric` 等全局类。
- 这些类与规范明确禁止继续扩散的 `.button`、`.card`、`.tag`、`.notice`、`.title`、`.row`、`.input` 等泛名重叠。

影响：

- 任一全局类修改都可能影响多个页面和组件。
- 业务组件内部也会继承或复制这些名字，难以判断样式来源。
- 新增页面会自然复制旧类，继续扩大耦合。

证据：

- `app.wxss` 第 20 行起出现 `.hero`，第 34 行 `.title`，第 69 行 `.card`，第 83 行 `.row`，第 105 行 `.tag`，第 132 行 `.button`，第 176 行 `.notice`，第 194 行 `.field`，第 206 行 `.input`。
- `components/recipe-card/index.wxss` 也定义了 `.row`、`.tag`、`.tag.good`。
- `components/auth-guard/index.wxss`、`components/share-card/index.wxss`、`components/empty-state/index.wxss` 都各自定义 `.button` 或 `.title`。

### 4. 自定义组件缺少显式样式隔离

现状：

- `components/*/index.json` 基本只有 `"component": true`。
- 没有组件显式声明 `"styleIsolation": "isolated"`。
- 没有统一的 `externalClasses` 规则。

影响：

- 组件样式是否受页面和全局样式影响不够明确。
- 后续迁移到 UI Kernel 时，组件边界不稳定。
- 业务组件难以安全暴露少量覆盖点。

证据：

- `components/recipe-card/index.json`、`components/dog-card/index.json`、`components/ingredient-list/index.json`、`components/share-card/index.json` 等文件均未设置 `styleIsolation`。

### 5. 缺少 UI 自动检查

现状：

- `package.json` 只有 `npm test`。
- 没有 `npm run check:ui`。
- 没有 `scripts/check-ui-system.js`。

影响：

- 裸 hex 色值、全局泛名、页面直用第三方标签等问题无法在提交前阻断。
- 规范只能靠人工记忆，容易回退到旧写法。

证据：

- `package.json` 的 `scripts` 仅包含 `"test": "node --test tests/*.test.js"`。
- 脚手架 dry-run 显示会新增 `scripts/check-ui-system.js` 并更新 `package.json scripts`。

## P1 问题

### 6. 页面层承担了过多基础视觉职责

现状：

- 页面 WXML 大量直接组合全局基础类。
- 页面 WXSS 中出现近似组件的视觉定义，例如筛选器、面板、指标卡、底部操作区。

影响：

- 页面既负责业务流程，又负责基础视觉。
- 迁移或复用同类结构时需要复制页面样式。

重点文件：

- `pages/home/index.wxml`
- `pages/recipes/list/index.wxml`
- `pages/recipes/detail/index.wxml`
- `pages/plan/index/index.wxml`
- `pages/profile/index/index.wxml`
- `subpackages/plan-extra/period/index.wxml`
- `subpackages/custom-recipe/edit/index.wxml`
- `subpackages/custom-recipe/advice/index.wxml`
- `subpackages/dog-profile/dog-edit/index.wxml`
- `subpackages/dog-profile/dog-quick-create/index.wxml`

### 7. 业务组件重复实现基础样式

现状：

- `recipe-card` 自己实现卡片、标签、标题、适配状态。
- `auth-guard`、`empty-state`、`share-card` 自己实现按钮。
- `ingredient-editor`、狗狗档案页面共同依赖裸 `.input` 和 `.field` 风格。
- `risk-badge`、`advice-card`、`dog-target-selector` 自己写状态色和选中态。

影响：

- 基础视觉的状态和尺寸无法统一。
- 长文案、禁用态、加载态、错误态等边界需要多处重复补齐。

重点文件：

- `components/recipe-card/index.*`
- `components/auth-guard/index.*`
- `components/empty-state/index.*`
- `components/share-card/index.*`
- `components/ingredient-editor/index.*`
- `components/dog-target-selector/index.*`
- `components/advice-card/index.*`
- `components/risk-badge/index.*`

### 8. 表单控件没有统一契约

现状：

- 狗狗档案、新建档案、自定义食谱编辑都直接使用 `<input class="input">`。
- `period-selector` 也有独立的 `custom-input`。
- picker、input、表单字段的标题、错误、帮助文案、必填态没有统一组件。

影响：

- 表单页面后续会越来越多，重复样式和校验提示会继续扩散。
- 长文案和错误状态没有统一落点。

重点文件：

- `subpackages/dog-profile/dog-edit/index.wxml`
- `subpackages/dog-profile/dog-quick-create/index.wxml`
- `subpackages/custom-recipe/edit/index.wxml`
- `components/period-selector/index.wxml`
- `components/ingredient-editor/index.wxml`

### 9. 分包页面和主包页面样式复用方式不清晰

现状：

- 分包页面继续依赖 `app.wxss` 的全局基础类。
- `subpackages/dog-profile/dog-edit/index.wxss` 和 `subpackages/dog-profile/dog-quick-create/index.wxss` 结构高度相似。
- `subpackages/plan-extra/detail/index.wxml` 使用全局 `.stack`、`.card`、`.section-title`、`.muted`、`.tiny`。

影响：

- 分包页面难以独立维护。
- 快速建档与完整建档页面后续改动容易不一致。

## P2 问题

### 10. 视觉 token 粒度还未区分语义

现状：

- 当前颜色可读出主色、文字色、弱文字、边框、成功、警告等语义，但都只是裸值。
- 缺少统一 token 命名和语义说明；脚手架默认生成 `--df-color-primary`、`--df-color-text`、`--df-color-bg` 等变量，项目需要明确这些变量和“品牌色、主文本、页面背景”等语义的对应关系。

影响：

- 后续组件接口难以描述“成功态”“警告态”“弱提示态”。
- 分享图 canvas、tabBar、WXSS 之间难以保持一致。

### 11. 可点击目标和状态覆盖没有系统验收

现状：

- 多数按钮高度足够，但小型标签、链接、筛选项和编辑入口没有统一点击目标规则。
- UI 基础组件没有统一覆盖 loading、disabled、error、empty、long text 等状态。

影响：

- 页面局部体验依赖开发者手感，缺少可重复验收标准。
- 长文案可能挤压布局，尤其是狗狗名字、食谱名、过敏源、建议理由。

### 12. 第三方组件接入边界尚未定义

现状：

- 当前未看到 TDesign、Vant、WeUI 等依赖或标签。
- 规范要求未来若引入组件库，页面不得直接使用 `<t-*>`、`<van-*>`，必须通过 `components/vendor/*` 或 `components/ui/*` 包装。

影响：

- 如果后续临时引入 picker、dialog、toast、upload，容易直接落在页面里。
- 需要在文档和检查脚本中提前固定接入规则。

## 已确认的脚手架差距

执行 dry-run：

```bash
node .agents/skills/miniapp-ui-system/scripts/init-ui-system.js --project . --dry-run
```

输出显示应新增：

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
- `package.json` 中的 `check:ui`

这说明项目尚未初始化 UI 系统骨架，后续重整应从脚手架和 token 开始。
