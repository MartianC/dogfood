# TDesign 食谱 01-05 界面实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 `superpowers:executing-plans` 逐项执行；完成后使用 `superpowers:requesting-code-review` 交给独立 subagent 审核。步骤使用复选框（`- [ ]`）追踪。

**Goal：** 使用 TDesign 微信小程序组件还原 Figma F01-F05，把第二个 Tab 替换为“我的食谱”，并打通列表、空态、新建 Popup 与空食材设计页的可用流程。

**Architecture：** `custom-tab-bar` 作为 TDesign TabBar 的项目适配层，页面通过 `getTabBar()` 同步选中路由；标准 Popup、Cell、Input、Button、Empty、Fab 通过 `components/vendor/*` 或既有 `components/ui/*` 暴露稳定契约，业务页面不直接使用 `<t-*>`。自定义食谱服务统一管理本地列表和当前草稿，现有公共食谱详情代码保留但不再作为第二个 Tab 主入口。

**Tech Stack：** 微信小程序原生 WXML/WXSS/JavaScript、TDesign Mini Program `1.15.3`、Node.js `node:test`、项目 UI token 与 UI Kernel。

## Global Constraints

- Figma 来源固定为 `CHUlIiWUhuXHA0IUwQe6Qe`，F01-F05 节点依次为 `19518:2`、`19518:23`、`19518:72`、`19518:97`、`19518:116`，画布宽度为 375 px。
- TabBar 必须使用 TDesign 原生 `theme=tag`、`shape=round`、四项图标加文字布局；选中项使用项目主绿与浅绿 token。
- 页面不能直接使用 `<t-*>`；第三方组件只允许出现在 `custom-tab-bar`、`components/vendor/*` 或 `components/ui/*` 适配层。
- 普通 WXSS 不新增裸色值，点击区不小于 `88rpx`，组件默认样式隔离。
- F01-F05 之外的公共食谱详情、食材搜索、营养抽屉和营养算法不在本轮重做范围内。
- 不创建 Git 提交；完成后等待用户明确允许。

---

### Task 1：锁定行为并接入 TDesign TabBar

**Files：**
- Modify: `package.json`
- Create: `package-lock.json`
- Modify: `app.json`
- Create: `custom-tab-bar/index.{js,json,wxml,wxss}`
- Modify: `pages/home/index.js`
- Modify: `pages/recipes/list/index.js`
- Modify: `pages/plan/index/index.js`
- Modify: `pages/profile/index/index.js`
- Modify: `tests/storage-structure.test.js`

**Interfaces：**
- Produces: `custom-tab-bar` 接收 `selected` 路由值，并在 `change` 后调用 `wx.switchTab`。
- Produces: 四个 Tab 页的 `onShow()` 调用 `this.getTabBar().setData({ selected: route })`。

- [x] **Step 1：新增失败测试。** 断言 `app.json.tabBar.custom === true`、移除 `style: v2`、四个 Tab 路由不变，并断言适配组件使用 `t-tab-bar` / `t-tab-bar-item` 且页面不直接引用 TDesign 标签。
- [x] **Step 2：运行 `npm test`。** 预期新测试因 TDesign 配置和 `custom-tab-bar` 尚不存在而失败。
- [x] **Step 3：安装 `tdesign-miniprogram@1.15.3` 并实现自定义 TabBar。** 使用 `theme="tag"`、`shape="round"`、`fixed="false"`、`split="false"`；四项映射到首页、食谱、清单、我的。
- [x] **Step 4：为四个 Tab 页同步选中状态。** 保留各页已有 `onShow` 业务逻辑，只增加安全的 `getTabBar()` 同步。
- [x] **Step 5：运行定向测试。** `node --test tests/storage-structure.test.js` 预期通过。

### Task 2：建立食谱列表服务与 TDesign 适配组件

**Files：**
- Modify: `subpackages/custom-recipe/services/customRecipeService.js`
- Create: `components/vendor/recipe-create-popup/index.{js,json,wxml,wxss}`
- Create: `components/vendor/recipe-fab/index.{js,json,wxml,wxss}`
- Create: `components/vendor/recipe-empty/index.{js,json,wxml,wxss}`
- Create: `tests/custom-recipe-service.test.js`

**Interfaces：**
- Produces: `listRecipes()` 返回按 `updatedAt` 倒序排列的本地自定义食谱。
- Produces: `createDraft({ title, targetDogId, targetDogName })` 校验名称、保存当前草稿并加入本地列表。
- Produces: `recipe-create-popup` props `visible/dogs/loading`，events `cancel/confirm/visiblechange`。
- Produces: `recipe-fab` event `tap`；`recipe-empty` event `action`。

- [x] **Step 1：新增服务失败测试。** 覆盖空标题拒绝、标题 trim、首次创建、同 ID 更新不重复、按更新时间倒序、草稿恢复。
- [x] **Step 2：运行 `node --test tests/custom-recipe-service.test.js`。** 预期因新接口不存在而失败。
- [x] **Step 3：实现服务接口。** 复用 `utils/storage.js`，不改变现有 `saveDraft/getDraft/clearDraft/save` 契约。
- [x] **Step 4：实现三个 TDesign 适配组件。** Popup 包装 `Popup/Cell/Input/Button` 并提供内联错误；Fab 包装圆形 `Fab`；空态包装 `Empty/Button`。
- [x] **Step 5：运行服务测试与 UI 静态检查。** 预期服务测试通过；如 UI 检查发现第三方标签，只允许其位于适配层。

### Task 3：还原 F02-F04 我的食谱列表与创建流程

**Files：**
- Modify: `pages/recipes/list/index.{js,json,wxml,wxss}`
- Create: `components/recipe-library-card/index.{js,json,wxml,wxss}`
- Modify: `tests/miniapp-runtime.test.js`

**Interfaces：**
- Consumes: `listRecipes()`、`createDraft()`、`recipe-create-popup`、`recipe-fab`、`recipe-empty`。
- Produces: F02 数据态卡片点击进入编辑页；F03 空态唯一主操作；F04 Popup 取消、遮罩关闭、校验和确认跳转。

- [x] **Step 1：新增页面结构失败测试。** 断言标题“我的食谱”、Figma 说明文案、数据/空态条件、Fab、Popup 和确认事件存在，并断言旧公共食谱筛选器不再出现在该页面。
- [x] **Step 2：运行定向测试。** 预期因旧列表结构仍存在而失败。
- [x] **Step 3：实现列表页状态。** `onShow` 加载狗狗和自定义食谱；有数据渲染三层卡片信息，无数据渲染空态；Fab 与空态按钮打开同一 Popup。
- [x] **Step 4：实现创建交互。** 选择狗狗、输入食谱名称、内联校验，确认后创建草稿并跳转 `/subpackages/custom-recipe/edit/index?id=...`。
- [x] **Step 5：实现业务卡片。** 使用 `ui-card/ui-tag`，覆盖草稿、已完成、长标题与整卡点击状态。
- [x] **Step 6：运行定向测试和 `npm run check:ui`。** 预期通过。

### Task 4：还原 F05 空食材设计页

**Files：**
- Modify: `subpackages/custom-recipe/edit/index.{js,json,wxml,wxss}`
- Modify: `tests/miniapp-runtime.test.js`

**Interfaces：**
- Consumes: `getDraft()` 和 `saveDraft()`。
- Produces: 无食材时展示 F05 空态；“新增食材”进入现有可编辑状态，输入继续保存在草稿中。

- [x] **Step 1：新增失败测试。** 断言页面标题“食谱设计”、空食材文案、TDesign 空态适配组件和新增食材入口。
- [x] **Step 2：运行定向测试。** 预期因旧自定义食谱编辑页结构而失败。
- [x] **Step 3：重构页面状态。** 从 query/draft 恢复标题和目标狗狗；空数组渲染 F05；点击新增后使用既有 `ingredient-editor` 进入可编辑状态，避免丢失草稿。
- [x] **Step 4：保留保存草稿与建议流程。** 已有食材时仍可保存并检查建议，确保本轮没有切断既有后续能力。
- [x] **Step 5：运行定向测试、完整测试与 UI 检查。** 预期全部通过。

### Task 5：视觉验证、文档与独立审核

**Files：**
- Modify: `docs/ui/figma-implementation-notes.md`
- Modify: `docs/work-logs/2026-07-11.md`

**Interfaces：**
- Produces: F01-F05 实现映射、差异说明、验证记录和未提交状态。

- [x] **Step 1：运行 `npm run check:ui && npm test`。** 两项都必须通过；失败时先确认是实现、测试还是环境问题再修复。
- [x] **Step 2：通过微信开发者工具构建 npm 并检查 F01-F05。** 检查 375×812 与窄屏，重点比对 TabBar 安全区、卡片长标题、空态、Popup 键盘/遮罩和 F05 空态。
- [x] **Step 3：更新交接文档和工作日志。** 记录 TDesign 版本、组件映射、不能等价还原处、验证命令和“未提交，等待确认”。
- [x] **Step 4：清理 `.design-check/` 临时截图。** 验证资产不进入版本控制。
- [x] **Step 5：交给独立 subagent 审核。** 审核需求覆盖、Figma 还原、TDesign 适配边界、数据丢失风险、测试缺口和回归风险。
- [x] **Step 6：处理审核结论并复跑验证。** 修复 Critical/Important 问题；对不采纳项给出代码或测试依据。
