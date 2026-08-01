# 项目现状清单与导航迁移契约

**状态：** 已冻结（P0.2 完成）

**日期：** 2026-08-01

**上游：** [`目标信息架构冻结`](./2026-08-01-target-information-architecture.md)

**机器契约：** [`project-navigation-migration-v1.json`](../../../contracts/navigation/project-navigation-migration-v1.json)

## 1. 文档定位

本文记录 P0.2 的只读审计结果，固定当前页面与依赖基线、目标 canonical 页面、迁移分类、旧深链处理和回滚路径。本文不改 `app.json`、页面、服务或云端资源；后续节点必须消费本契约，不能在 UI 重排时另建一套登录、档案、草稿、评估或保存逻辑。

机器契约中的页面路径、分类、依赖 profile、迁移 owner 和不变量是后续 `A1.2` 与 `G1.1` 的输入。本文负责解释原因和已知风险。

## 2. 当前运行结构

### 2.1 页面与包

当前 `app.json` 注册 18 个页面：主包 6 个页面，4 个分包共 12 个页面。

```text
主包
├─ pages/home/index
├─ pages/records/index
├─ pages/profile/index/index
├─ pages/recipes/list/index
├─ pages/recipes/detail/index
└─ pages/plan/index/index

subpackages/dog-profile
├─ dog-edit/index
└─ dog-quick-create/index

subpackages/plan-extra
├─ period/index
└─ detail/index

subpackages/custom-recipe
├─ edit/index
├─ ingredient-search/index
└─ advice/index

subpackages/shared-meal
├─ dog-select/index
├─ menu-search/index
├─ dog-select/menu-search/index  （旧路由跳转壳）
├─ compose/index
└─ record-detail/index
```

### 2.2 当前导航

当前真实 Tab 为：

| 顺序 | 标识 | 页面 |
| --- | --- | --- |
| 1 | 首页 | `pages/home/index` |
| 2 | 记录 | `pages/records/index` |
| 3 | 我的 | `pages/profile/index/index` |

导航定义存在三个同步写面：

- `app.json`：微信运行时 Tab 注册；
- `custom-tab-bar/index.js`：渲染项目、图标、选中值和 `switchTab`；
- `services/navigationMigrationService.js`：首页等调用方消费的 Tab 与兼容路径常量。

当前 `contracts/shared-meal/navigation-migration-gate-v1.json` 和 `scripts/check-shared-meal-navigation-gate.js` 仍固定三 Tab，它们是上一轮迁移门禁。`G1.1` 必须显式升级或替换该门禁；`N1.1` 不能绕过旧门禁直接改 `app.json`。

### 2.3 当前主要耦合与缺口

1. `pages/profile/index/index` 同时加载账号和狗狗档案，并暴露历史批量清单与自定义狗饭入口，和目标“我的”职责冲突。
2. `pages/home/index` 与 `pages/records/index` 分别直接导航到 `subpackages/shared-meal/dog-select/index`，尚无统一记餐入口服务。
3. 目标 `pages/dogs/index` 尚不存在；狗狗列表、空态和编辑入口当前全部位于“我的”。
4. `pages/plan/index/index`、`subpackages/plan-extra/period/index`、`subpackages/plan-extra/detail/index` 使用 `switchTab` 跳转到已经不是 Tab 的旧食谱或清单页面。深链仍能打开页面，但这些出站动作需要按兼容页语义修复。
5. `custom-tab-bar` 的选中值由每个 Tab 页 `onShow` 手工写入；新增狗狗 Tab 后必须纳入同一门禁，中央动作不得写入选中值。
6. 当前页面通过 service/adapter 调用云函数，没有页面直接访问云数据库。重排应保持这一依赖方向。

## 3. 目标 canonical 页面与中央动作

| 目标节点 | 唯一 canonical 页面 | 处理方式 | 原因 |
| --- | --- | --- | --- |
| 首页 | `pages/home/index` | 原路径迁移 | 保留已有深链和最近记录能力，只重构状态编排 |
| 记录 | `pages/records/index` | 原路径迁移 | 保留月份状态与记录详情链路，只对齐入口和文案 |
| 狗狗 | `pages/dogs/index` | 新增 | 从“我的”拆出独立目的地；路径与首页、记录保持同级简单结构 |
| 我的 | `pages/profile/index/index` | 原路径迁移 | 保持既有 Tab 深链，移除狗狗和旧能力入口后承载账号与设置 |
| 记一顿 | 无页面；统一入口服务 | 新增 `services/sharedMealEntryService.js` | 中央动作不是 Tab，首页、记录空态和 TabBar 需复用同一守卫合同 |

中央动作完成守卫后继续进入现有 `subpackages/shared-meal/dog-select/index`，不创建第二套选狗页。入口服务的具体接口与登录/建档往返由 `A1.1` 实现和测试。

## 4. 页面迁移清单

分类语义：

- **保留：** 当前主线仍直接复用，路径和职责基本不变；
- **迁移：** 路径保留，但职责或入口需要按目标信息架构调整；
- **新增：** 当前不存在的目标页面或入口；
- **兼容：** 仅为旧深链、历史数据或现有复用链路保留，不设新主入口。

| 分类 | 页面 | 迁移处理 |
| --- | --- | --- |
| 迁移 | `pages/home/index` | 保留路径，改为自适应今日首页；记餐改走统一入口 |
| 迁移 | `pages/records/index` | 保留月份/日期模型；只调整标题、空态和统一入口 |
| 新增 | `pages/dogs/index` | 新狗狗 Tab；复用 `dogService` 和档案编辑分包 |
| 迁移 | `pages/profile/index/index` | 移除狗狗列表、历史清单和自定义食谱入口；保留账号与真实设置 |
| 保留 | `subpackages/dog-profile/dog-edit/index` | 继续承载新增、编辑和记餐过程中的档案完善 |
| 保留 | `subpackages/dog-profile/dog-quick-create/index` | 继续保留快速建档和 `redirect` 往返兼容 |
| 保留 | `subpackages/shared-meal/dog-select/index` | 作为统一入口守卫后的现有选狗/草稿恢复流程 |
| 保留 | `subpackages/shared-meal/menu-search/index` | canonical 人饭菜单选择页 |
| 保留 | `subpackages/shared-meal/compose/index` | 当前编辑、评估和保存闭环 |
| 保留 | `subpackages/shared-meal/record-detail/index` | 当前不可变快照详情 |
| 保留 | `subpackages/custom-recipe/ingredient-search/index` | 继续由共享本餐与旧自定义食谱共同复用 |
| 兼容 | `pages/recipes/list/index` | 保留直接深链，不进入 TabBar、首页或“我的” |
| 兼容 | `pages/recipes/detail/index` | 保留 `id` 深链与旧制作周期往返 |
| 兼容 | `pages/plan/index/index` | 保留历史清单读取；修复指向非 Tab 页的出站导航 |
| 兼容 | `subpackages/plan-extra/period/index` | 保留 `recipeId/source` 深链；修复指向非 Tab 页的出站导航 |
| 兼容 | `subpackages/plan-extra/detail/index` | 保留历史清单深链；修复指向非 Tab 页的出站导航 |
| 兼容 | `subpackages/custom-recipe/edit/index` | 保留旧自定义狗饭编辑和 `id` 参数，不设主入口 |
| 兼容 | `subpackages/custom-recipe/advice/index` | 保留旧建议与保存链路，不设主入口 |
| 兼容 | `subpackages/shared-meal/dog-select/menu-search/index` | 保留旧嵌套路由壳，透传参数并重定向 canonical 菜单页 |

新增页面计入目标清单后共有 19 个条目；切换时不得以“整理目录”为由删除任何 18 个当前注册页面。

## 5. 页面到服务、adapter 与云函数依赖

下表记录页面当前会调用或迁移后必须复用的业务边界。纯模型、缓存和本地文件能力标为“本地”，不应为了页面重排被搬进页面代码。

| 页面/页面组 | 直接业务服务 | adapter / 云函数 |
| --- | --- | --- |
| 首页 | `authService`、`dogService`、`sharedMealRecordService`、`navigationMigrationService` | `login`、`dogProfile`、`sharedMealRecord` |
| 记录与本餐详情 | `sharedMealRecordService`、月份状态、日历模型 | `sharedMealRecord` 的 `list/get` |
| 当前“我的” / 目标狗狗页 | `authService`、`dogService` | `login`、`dogProfile` |
| 目标“我的” | `authService`；不得继续复制狗狗读取 | `login`；后续真实设置若需云端能力必须另立合同 |
| 档案编辑/快速建档 | `authService`、`dogService`、档案推导、`fileService` | `login`、`dogProfile`；头像当前只保存本地文件，不使用云存储 |
| 共享本餐选狗 | `authService`、`dogService`、`sharedMealDogEligibility`、`sharedMealDraftService` | `login`、`dogProfile` |
| 共享本餐菜单 | `humanRecipeService`、菜单会话、草稿、食材操作规则 | `searchHumanRecipes`、`getHumanRecipe` |
| 共享本餐编辑 | 草稿、资格、能量/营养评估、`sharedMealRecordService` | `getHumanRecipe`、`sharedMealRecord.save` |
| 旧食谱列表/详情 | `dogService`、`authService`、`customRecipeService` 和本地旧食谱工具 | 登录/档案读取按需调用；列表草稿主要为本地缓存 |
| 旧批量清单与周期 | `mealPlanService`、`planCalculatorService`、`dogService` | `saveMealPlan`、`dogProfile` |
| 旧自定义狗饭编辑/建议 | `customRecipeService`、评估与食材工作台 | `saveCustomRecipe`；档案读取复用 `dogProfile` |
| 共用食材选择器 | `draftAdapters`、`ingredientService`、`ingredientWorkbench`、排行与操作规则 | 当前使用本地运行时投影和草稿，无独立云函数 |

稳定依赖方向继续固定为：

```text
页面 → view model / 纯状态模型 → service → adapter → 云函数 → 集合
```

禁止事项：

- 新首页、狗狗页或中央动作直接调用 `wx.cloud.callFunction`；
- 在三个记餐调用方分别复制登录、档案、资格或草稿判断；
- 为狗狗页复制 `dogService`、档案推导或编辑表单；
- 为记录空态复制保存或记录查询逻辑；
- 把兼容页的旧批量状态接入共享本餐草稿。

## 6. 旧入口与深链处理

| 旧入口 | 当前问题 | 固定处理 |
| --- | --- | --- |
| 旧食谱列表 `pages/recipes/list/index` | 已非 Tab，仍可能由历史深链访问 | 保持注册和直接访问；不重新暴露主入口 |
| 旧食谱详情 `pages/recipes/detail/index?id=…` | 建档往返仍依赖该路径 | 保留 `id`；快速建档中的旧周期兼容映射继续有效 |
| 旧清单 `pages/plan/index/index` | 出站 `switchTab` 指向非 Tab 食谱页 | 页面保留；后续改用适合非 Tab 页的兼容导航 |
| 制作周期 `subpackages/plan-extra/period/index` | 保存后 `switchTab` 指向非 Tab 清单页 | 深链与保存保留；后续改为兼容导航，不恢复旧 Tab |
| 历史清单 `subpackages/plan-extra/detail/index` | 出站 `switchTab` 指向非 Tab 食谱页 | 深链保留；后续改为兼容导航 |
| 旧自定义狗饭编辑/建议 | 当前从“我的”暴露 | F1.2 移除主入口；页面和数据读取继续兼容 |
| 旧嵌套菜单路径 | 已有 redirect 壳 | 保留壳并继续透传 `draftId` 到 canonical 菜单页 |
| 当前“我的” Tab 深链 | 路径继续作为目标“我的” | 不重定向；只迁移页面职责 |

所有兼容页面必须继续注册，但不得出现在目标 TabBar、中央动作、首页主任务或精简后的“我的”中。

## 7. 分节点写面与迁移顺序

| 节点 | 允许处理的写面 |
| --- | --- |
| `A1.1` | 新增统一记餐入口 service 和调用合同，不切 TabBar |
| `A1.2` | 新狗狗 canonical 页面落点、页面注册准备、兼容页出站导航；不切 TabBar |
| `G1.1` | 基于机器契约建立正反静态检查，升级旧三 Tab 门禁 |
| `F1.1` | 实现狗狗页，复用档案 service/编辑分包 |
| `F1.2` | 精简当前 profile 页面，不删除兼容页 |
| `F1.3/F1.4` | 首页状态模型与页面编排 |
| `F1.5` | 记录页标题、空态和入口 |
| `N1.1` | 最后统一修改 `app.json`、`custom-tab-bar/**`、图标和导航常量 |

`app.json` 与 `custom-tab-bar/**` 仍是高冲突写面。除为新增页面提前注册所需的最小 `app.json` 变更外，TabBar 列表只能由 `N1.1` 修改。

## 8. 回滚路径

导航切换的回滚单位是客户端配置与入口，不涉及云端或数据回滚：

1. 恢复 `app.json` 的“首页、记录、我的”三 Tab 列表。
2. 恢复 `custom-tab-bar/index.js`、`index.wxml`、`index.wxss` 的三项渲染和选中态。
3. 恢复 `services/navigationMigrationService.js` 的三 Tab 常量。
4. 保留新增狗狗页和统一入口代码，不删除页面、不迁移或回填数据；回滚后它们可以暂时不作为 Tab 暴露。
5. 所有旧食谱、批量、自定义狗饭和共享本餐任务页继续注册，不随 TabBar 回滚删除。

该回滚不需要撤销云函数、集合、索引或历史数据，因为本次导航迁移不改变它们的合同。

## 9. P0.2 验收结论

- [x] 已盘点 `app.json`、自定义 TabBar、6 个主包页面、4 个分包及 12 个分包页面。
- [x] 已盘点导航服务、上一轮导航门禁及三个导航定义写面。
- [x] 19 个当前/目标页面条目均标记为保留、迁移、新增或兼容。
- [x] 首页、记录、狗狗和我的均有唯一 canonical 页面，中央动作明确不是页面或 Tab。
- [x] 页面到 service、adapter 和云函数的依赖已固定，禁止 UI 重排复制业务逻辑。
- [x] 每个旧入口都有保留、重定向或兼容导航修复方式。
- [x] 回滚固定为恢复三 Tab 客户端入口，不删除新页面、不回滚云端或数据。
- [x] 机器契约覆盖目标 Tab、中央动作、页面分类、依赖 profile、深链、owner、回滚和不变量。

P0.2 已满足验收条件，可为 `A1.2` 和 `G1.1` 提供稳定输入。
