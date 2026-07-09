# 小程序 UI 系统重整计划

> **For agentic workers:** 实施本计划时优先使用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans`，按任务逐项完成并在每项后验证。  
> 计划日期：2026-07-09  
> 配套问题清单：`docs/ui/ui-system-problem-inventory.md`

## 目标

把当前“全局样式类 + 页面局部样式”的 UI 实现，重整为“设计 token + UI Kernel + 业务组件组合 + 自动检查”的小程序前端体系，让后续页面只能沿稳定组件接口扩展，而不是继续复制全局类和裸色值。

## 架构方向

第一阶段先建立 `styles/*`、`components/ui/*`、`components/vendor/*` 和 `scripts/check-ui-system.js`，并把 `app.wxss` 缩小为入口 imports 与页面基础样式。第二阶段逐页迁移按钮、卡片、标签、提示、表单、空状态，保留业务组件的业务职责。第三阶段收紧自动检查，把裸色值、全局泛名和页面直用基础样式变成可检测问题。

## 技术栈

- 微信小程序原生框架
- WXSS 自定义属性作为设计 token
- 自研 `components/ui/*` 作为 UI Kernel
- 当前不引入 TDesign、Vant 或 WeUI；如后续引入，必须通过 `components/vendor/*` 或 `components/ui/*` 包装
- `node` 脚本作为 UI 静态检查

## 全局约束

- 始终用中文写文档和注释。
- 不回滚用户已有改动。
- 手工改文件优先使用 `apply_patch`。
- 页面不新增 `.button`、`.card`、`.tag`、`.notice`、`.title`、`.row`、`.input` 等泛名选择器。
- 普通页面和组件不新增裸 hex、`rgba()` 或 `hsla()` 色值；新增颜色先进入 `styles/tokens.wxss`，无法读取 WXSS token 的 JSON 和 canvas 常量需记录同步规则。
- 自定义组件默认设置 `"styleIsolation": "isolated"`。
- 页面不直接使用第三方组件标签。
- 每批改动后运行与范围匹配的验证，至少包含 `npm run check:ui` 和 `npm test`；如无法运行，记录原因和剩余风险。
- 每次代码、配置、资源、设计稿或文档改动后，追加 `docs/work-logs/YYYY-MM-DD.md`。
- 完成任务后不提交，除非得到明确允许。

## 需要先确认的决策

1. 是否接受第一阶段使用现有脚手架生成基础 UI 系统文件。
   - 建议：接受。dry-run 已确认不会覆盖现有文件，能降低手写骨架的遗漏风险。
2. token 前缀使用 `df` 还是脚手架默认 `mp`。
   - 建议：使用 `df`，和“dogfood/狗饭”项目语义一致，生成 `--df-*`。
3. canonical token 命名采用脚手架兼容命名，还是重命名为更业务化的语义命名。
   - 建议：第一轮沿用脚手架兼容命名，例如 `--df-color-primary`、`--df-color-text`、`--df-color-bg`，并在 `docs/ui/design-system.md` 记录它们分别对应品牌色、主文本、页面背景。这样初始化后不需要大面积同步 `components/ui/*` 引用。
4. `check:ui` 迁移期采用 baseline/allowlist、分 scope 检查，还是允许阶段 1 到阶段 6 失败但只记录。
   - 建议：采用 baseline/allowlist。第一阶段记录既有问题为 baseline，新 UI Kernel 和已迁移文件必须通过检查；阶段 7 删除 baseline，让全项目通过。
5. 是否把 `app.json` 的 `window` 和 `tabBar` 颜色纳入设计系统同步规则。
   - 建议：纳入。小程序 JSON 无法读取 WXSS token，但必须在 `docs/ui/design-system.md` 记录 `app.json` 色值与 token 的对应关系。
6. 当前是否暂不引入第三方组件库。
   - 建议：暂不引入。项目已有原生实现且依赖为零，先自研 UI Kernel，后续如需要 dialog、toast、picker 再做 vendor wrapper。
7. 是否在第一轮迁移中移动业务组件目录到 `components/domain/*`。
   - 建议：先不移动。第一轮只迁移引用和样式边界，避免路径变更扩大风险；第二轮稳定后再评估目录整理。

## 计划文件结构

计划会新增或修改以下文件：

| 路径 | 动作 | 责任 |
| --- | --- | --- |
| `styles/tokens.wxss` | 新增 | 定义颜色、字号、间距、圆角、阴影、z-index 等语义 token |
| `styles/typography.wxss` | 新增 | 定义标题、正文、辅助文字等字体层级 |
| `styles/utilities.wxss` | 新增 | 保留极少量布局工具类，避免业务样式进入全局 |
| `app.wxss` | 修改 | 只保留 imports、`page` 基础样式和必要页面容器 |
| `app.json` | 修改/记录 | `window` 和 `tabBar` 色值无法直接读取 WXSS token，需和 token 建立同步规则 |
| `components/ui/ui-button/*` | 新增 | 统一按钮 variants、sizes、loading、disabled、block |
| `components/ui/ui-card/*` | 新增 | 统一卡片边框、背景、阴影、内边距 |
| `components/ui/ui-tag/*` | 新增 | 统一标签基础、success、warning、neutral 等状态 |
| `components/ui/ui-notice/*` | 新增 | 统一提示条状态和长文案排版 |
| `components/ui/ui-field/*` | 新增 | 统一表单字段 label、input slot、错误和帮助文案 |
| `components/ui/ui-empty/*` | 新增 | 统一空状态标题、说明、操作按钮 |
| `components/vendor/.gitkeep` | 新增 | 预留第三方 wrapper 目录 |
| `scripts/check-ui-system.js` | 新增 | 检查裸色值、全局泛名、页面直用第三方标签和基础类扩散 |
| `package.json` | 修改 | 增加 `check:ui` 脚本 |
| `docs/ui/design-system.md` | 新增 | 记录 token、颜色语义、排版、间距和组件使用规则 |
| `docs/ui/component-contracts.md` | 新增 | 记录 `components/ui/*` props、events、slots 和状态 |
| `docs/ui/ai-frontend-rules.md` | 新增 | 固化 AI/开发者 UI 改动前后规则 |
| `components/*/index.json` | 修改 | 增加 `styleIsolation: "isolated"`，必要时声明 `externalClasses` |
| `pages/**/index.json` | 修改 | 注册迁移所需 `ui-*` 组件 |
| `pages/**/index.wxml` | 修改 | 替换全局基础类为 `ui-*` 组件 |
| `pages/**/index.wxss` | 修改 | 删除基础视觉样式，只保留页面布局 |
| `components/**/index.wxml` | 修改 | 业务组件组合 `ui-*`，不重复实现基础按钮/标签/卡片 |
| `components/**/index.wxss` | 修改 | 删除重复基础视觉，使用 token |
| `pages/plan/index/index.js` | 修改 | 分享图颜色从 token 映射常量读取，避免散落裸色值 |

## 分阶段任务

### 阶段 1：初始化 UI 系统骨架

原因：先建立 token、UI Kernel 和检查脚本，后续页面迁移才有明确目标。

- [ ] 运行 dry-run 确认输出：

```bash
node .agents/skills/miniapp-ui-system/scripts/init-ui-system.js --project . --token-prefix df --dry-run
```

预期：只显示 create/update，不修改文件。

- [ ] 执行真实初始化：

```bash
node .agents/skills/miniapp-ui-system/scripts/init-ui-system.js --project . --token-prefix df
```

预期：新增 `styles/*`、`components/ui/*`、`components/vendor/.gitkeep`、`docs/ui/*`、`scripts/check-ui-system.js`，并更新 `package.json`。

- [ ] 在 `app.wxss` 顶部引入：

```css
@import "./styles/tokens.wxss";
@import "./styles/typography.wxss";
@import "./styles/utilities.wxss";
```

- [ ] 将当前品牌色映射到脚手架兼容 token。第一轮不把 canonical token 重命名为 `brand/text-primary/page-bg`，避免生成后还要同步所有 `components/ui/*` 引用；业务语义写入 `docs/ui/design-system.md`。

```css
--df-color-bg: #f4f8f3;
--df-color-surface: #ffffff;
--df-color-surface-muted: #edf4ee;
--df-color-text: #17201b;
--df-color-text-secondary: #34423a;
--df-color-muted: #6f7b73;
--df-color-line: #d8e1da;
--df-color-line-strong: #b7c7bc;
--df-color-primary: #25684a;
--df-color-on-primary: #ffffff;
--df-color-primary-soft: #e3f0e8;
--df-color-warning: #a84f34;
--df-color-warning-soft: #f6e8e1;
--df-shadow-card: 0 12rpx 32rpx rgba(20, 37, 28, 0.06);
--df-shadow-hero: 0 12rpx 32rpx rgba(20, 37, 28, 0.07);
```

- [ ] 在 `docs/ui/design-system.md` 记录 `app.json` 同步关系：
  - `window.navigationBarBackgroundColor` 对应 `--df-color-surface`。
  - `window.backgroundColor` 对应 `--df-color-bg`。
  - `tabBar.backgroundColor` 对应 `--df-color-surface`。
  - `tabBar.color` 对应 `--df-color-muted`。
  - `tabBar.selectedColor` 对应 `--df-color-primary`。

- [ ] 建立 `check:ui` 迁移期 baseline。baseline 只允许当前未迁移文件保留旧问题；`styles/*`、`components/ui/*` 和已完成迁移的页面/组件不得新增裸色值、直接 `<button>` 或禁用泛名。

- [ ] 运行：

```bash
npm run check:ui
npm test
```

预期：`check:ui` 在建立 baseline 前会报出现有旧样式问题；建立 baseline 后应允许未迁移文件暂时保留旧问题，但新建 UI Kernel 必须通过。`npm test` 应保持通过。

### 阶段 2：定义 UI Kernel 契约

原因：先明确基础组件接口，再迁移页面，避免边迁移边改组件 API。

- [ ] 调整 `components/ui/ui-button` 支持：
  - `variant`: `primary | secondary | warning | ghost`
  - `size`: `small | medium | large`
  - `disabled`
  - `loading`
  - `block`
  - `openType`
  - `bindtap`

- [ ] 调整 `components/ui/ui-card` 支持：
  - `variant`: `plain | soft | primary`
  - `padding`: `none | small | medium`
  - 默认 slot

- [ ] 调整 `components/ui/ui-tag` 支持：
  - `variant`: `neutral | good | warning`
  - `size`: `small | medium`
  - 长文案自动换行或省略规则

- [ ] 调整 `components/ui/ui-notice` 支持：
  - `variant`: `neutral | good | warning`
  - 默认 slot
  - 可点击态

- [ ] 调整 `components/ui/ui-field` 支持：
  - `label`
  - `helpText`
  - `errorText`
  - 默认 slot 承载 input/picker

- [ ] 调整 `components/ui/ui-empty` 支持：
  - `title`
  - `description`
  - `actionText`
  - `bind:action`

- [ ] 更新 `docs/ui/component-contracts.md`，记录每个组件的 props、events、slots、可接受状态。

- [ ] 运行组件相关静态检查：

```bash
npm run check:ui
```

预期：在 baseline 或 scope 策略下，UI Kernel 自身不出现裸色值、`rgba()`、禁用泛名和直接 `<button>` 之外的页面级基础实现问题；旧页面遗留问题不阻塞本阶段。

### 阶段 3：收紧组件样式隔离

原因：样式隔离是迁移安全边界，先处理 JSON 风险低、收益高。

- [ ] 为所有 `components/*/index.json` 增加：

```json
{
  "component": true,
  "styleIsolation": "isolated"
}
```

- [ ] 检查确实需要外部覆盖的组件，使用明确 `externalClasses`，例如：

```json
{
  "externalClasses": ["custom-class"]
}
```

- [ ] 保持页面 JSON 只注册必要组件，不添加第三方标签。

- [ ] 运行：

```bash
npm test
```

预期：组件配置变更不影响业务测试。

### 阶段 4：迁移主包浏览链路

原因：首页、食谱列表、食谱详情是游客首屏路径，优先消除全局基础类依赖。

范围：

- `pages/home/index.*`
- `pages/recipes/list/index.*`
- `pages/recipes/detail/index.*`
- `components/recipe-card/index.*`
- `components/risk-badge/index.*`
- `components/auth-guard/index.*`

操作：

- [ ] 在页面 JSON 注册所需 `ui-button`、`ui-card`、`ui-tag`、`ui-notice`、`ui-empty`。
- [ ] 将 `<button class="button">` 替换为 `<ui-button>`。
- [ ] 将 `<view class="card">` 替换为 `<ui-card>`。
- [ ] 将 `<text class="tag">` 替换为 `<ui-tag>`。
- [ ] 将 `<view class="notice">` 替换为 `<ui-notice>`。
- [ ] 将 `recipe-card` 内部标签和卡片视觉改为组合 `ui-tag` 和 token。
- [ ] 明确食谱列表筛选区策略：搜索 input 和多个 picker 不继续作为页面级“准组件”扩散；优先用 `ui-field` 包装输入和 picker 展示值，筛选区布局可保留在 `pages/recipes/list/index.wxss`。
- [ ] 页面 WXSS 只保留布局类，例如列表间距、筛选区布局、底部弹层布局。

验证：

```bash
npm run check:ui
npm test
```

手动检查：

- 游客进入首页后能看到推荐食谱。
- 点击“先浏览食谱”进入食谱列表。
- 点击食谱卡片进入详情。
- 未建档时点击“选择制作周期”出现登录建档提示。

### 阶段 5：迁移清单和周期链路

原因：清单页包含分享图、采购勾选、固定底部操作，视觉和交互状态集中。

范围：

- `pages/plan/index/index.*`
- `subpackages/plan-extra/period/index.*`
- `subpackages/plan-extra/detail/index.*`
- `components/ingredient-list/index.*`
- `components/period-selector/index.*`
- `components/share-card/index.*`
- `components/dog-target-selector/index.*`

操作：

- [ ] 用 `ui-card` 统一分装参考、制作步骤、历史清单卡片。
- [ ] 用 `ui-button` 统一生成清单、导出图片、分享按钮。
- [ ] 用 `ui-tag` 或 token 统一选中态、状态徽章。
- [ ] 将 `ingredient-list` 的边框、背景、勾选态改为 token。
- [ ] 将 `pages/plan/index/index.js` 的 canvas 颜色集中为本文件顶部常量，常量名称和 token 语义一致：

```javascript
const SHARE_COLORS = {
  surface: '#ffffff',
  text: '#17201b',
  primary: '#25684a',
  textSecondary: '#34423a',
  muted: '#6f7b73',
}
```

- [ ] 在 `docs/ui/design-system.md` 记录 canvas 和 `app.json` 目前无法直接读取 WXSS token，需保持常量和 JSON 色值与 token 同步。

验证：

```bash
npm run check:ui
npm test
```

手动检查：

- 制作周期页可以选择狗狗和周期。
- 生成清单后，采购项可以勾选。
- 分享卡片按钮可触发导出和分享入口。

### 阶段 6：迁移档案和自定义食谱表单

原因：表单页面重复最高，迁移后能显著减少 `.field`、`.input` 和选项卡样式扩散。

范围：

- `pages/profile/index/index.*`
- `subpackages/dog-profile/dog-edit/index.*`
- `subpackages/dog-profile/dog-quick-create/index.*`
- `subpackages/custom-recipe/edit/index.*`
- `subpackages/custom-recipe/advice/index.*`
- `components/ingredient-editor/index.*`
- `components/advice-card/index.*`
- `components/dog-card/index.*`
- `components/empty-state/index.*`

操作：

- [ ] 用 `ui-field` 包装狗狗名称、体重、每日餐数、过敏源、忌口等输入。
- [ ] 用 `ui-button` 替换登录、新增、保存、删除、保存草稿、返回调整等按钮。
- [ ] 用 `ui-card` 统一档案卡片、建议卡片、表单容器。
- [ ] 用 `ui-empty` 替换旧 `components/empty-state` 或让旧组件内部委托给 `ui-empty`。
- [ ] 合并 `dog-edit` 与 `dog-quick-create` 中重复的头像区、表单字段和选项样式。
- [ ] 处理删除按钮 `warning` 或 `ghost` 变体，确保误触风险低。

验证：

```bash
npm run check:ui
npm test
```

手动检查：

- 游客登录入口可见。
- 新建狗狗档案表单可输入并保存。
- 快速建档表单只展示生成清单必填项。
- 自定义食谱可新增食材、保存草稿、进入建议页。

### 阶段 7：清理全局样式和检查规则

原因：迁移完成后必须把旧入口堵住，否则新页面会继续复制旧类。

- [ ] 从 `app.wxss` 删除基础组件类：
  - `.hero`
  - `.title`
  - `.subtitle`
  - `.section-title`
  - `.link`
  - `.card`
  - `.row`
  - `.tag`
  - `.button`
  - `.notice`
  - `.field`
  - `.input`
  - `.metric`

- [ ] 保留极少量页面布局：
  - `page`
  - `.page`
  - `.page.with-bottom-action`
  - `.section`
  - `.section-head`
  - `.stack`
  - `.grid-2`

- [ ] 强化 `scripts/check-ui-system.js`：
  - 检查普通页面和组件 WXSS 中的裸 hex 色值。
  - 检查普通页面和组件 WXSS 中的裸 `rgba()`、`rgb()`、`hsl()`、`hsla()` 色值；阴影和遮罩色也应来自 token。
  - 检查页面 WXSS 新增禁用泛名选择器。
  - 检查页面 WXML 直接使用 `<t-*>`、`<van-*>`、`<weui-*>`。
  - 检查页面 WXML 继续使用 `class="button"`、`class="card"`、`class="tag"`、`class="notice"`、`class="input"`。
  - 允许 `styles/tokens.wxss`、`app.json` token 同步白名单和 canvas 映射常量中的白名单色值。
  - 删除迁移期 baseline，要求全项目通过检查。

- [ ] 运行：

```bash
npm run check:ui
npm test
```

预期：两条命令都通过。

### 阶段 8：文档和验收

原因：UI 系统只有写成规则并被检查脚本执行，才能长期稳定。

- [ ] 更新 `docs/ui/design-system.md`：
  - 色彩语义
  - 字体层级
  - 间距与圆角
  - 阴影规则
  - 页面布局规则

- [ ] 更新 `docs/ui/component-contracts.md`：
  - `ui-button`
  - `ui-card`
  - `ui-tag`
  - `ui-notice`
  - `ui-field`
  - `ui-empty`

- [ ] 更新 `docs/ui/ai-frontend-rules.md`：
  - 改 UI 前必须说明 token、组件、变体、影响页面。
  - 改 UI 后必须运行 `npm run check:ui` 和 `npm test`。

- [ ] 追加 `docs/work-logs/YYYY-MM-DD.md`：
  - 时间
  - 改动摘要
  - 原因
  - 验证结果
  - 提交信息

- [ ] 进行最终验证：

```bash
npm run check:ui
npm test
```

- [ ] 手动验收核心路径：
  - 首页游客浏览。
  - 食谱列表筛选。
  - 食谱详情进入周期选择。
  - 登录或建档提示。
  - 周期选择生成清单。
  - 清单采购勾选。
  - 我的页面档案空状态和档案列表。
  - 自定义食谱编辑和建议页。

## 推荐实施顺序

1. 阶段 1、2、3 作为第一批提交范围：只建立系统、组件契约和隔离，不大规模迁移页面。
2. 阶段 4 作为第二批提交范围：迁移游客浏览链路。
3. 阶段 5 作为第三批提交范围：迁移清单和周期链路。
4. 阶段 6 作为第四批提交范围：迁移表单链路。
5. 阶段 7、8 作为第五批提交范围：删除旧全局类，收紧检查，完成文档验收。

每批完成后都应单独运行验证并等待 review。用户未明确允许前不提交。

## 风险和缓解

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| 一次性迁移所有页面导致回归面过大 | 难以定位问题 | 按主包浏览、清单周期、表单链路拆批 |
| 删除全局类过早导致旧页面样式丢失 | 页面错乱 | 先让页面完成 `ui-*` 替换，再删除全局类 |
| `check:ui` 初始规则过严 | 迁移初期阻塞开发 | 第一阶段记录旧问题数量，最终阶段再强制清零 |
| canvas 分享图不能直接读取 WXSS token | 分享图颜色可能漂移 | 用 `SHARE_COLORS` 常量映射，并在文档中记录同步要求 |
| 组件目录移动造成引用路径大面积变化 | 分包路径容易出错 | 第一轮不移动业务组件到 `components/domain/*` |

## 完成标准

- `styles/tokens.wxss` 是普通 WXSS 颜色、圆角、阴影、字号的唯一来源。
- `components/ui/*` 覆盖按钮、卡片、标签、提示、表单字段和空状态。
- 页面不再直接使用全局 `.button`、`.card`、`.tag`、`.notice`、`.input`。
- 自定义组件默认声明 `styleIsolation: "isolated"`。
- `npm run check:ui` 能阻止裸色值和禁用泛名继续扩散。
- `npm test` 通过。
- 核心手动路径通过。
