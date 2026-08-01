# 项目文档目录

## 目录约定

- 产品、设计、架构、审核记录和实现记录统一放在 `docs/`。
- 高保真界面稿保留在 `docs/狗饭小程序完整界面稿-批量制作版.html`。
- 设计稿依赖图片放在 `docs/design-assets/`，只服务设计稿预览，不进入小程序运行包。
- `AGENTS.md` 保留在仓库根目录，作为工具和协作规则入口。

## 当前方向与实施计划

- `docs/superpowers/plans/2026-08-01-project-structure-and-interface-roadmap.md`：下一阶段以项目结构和界面编排为主线的 DAG 路线图；体重、护理和统一记录时间轴作为主线完成后的次要能力支线。
- `docs/superpowers/specs/2026-08-01-target-information-architecture.md`：P0.1 已冻结的目标态信息架构；在导航模型、页面职责和入口归属上优先于旧三 Tab 描述，但不表示目标导航已经上线。
- `docs/superpowers/specs/2026-08-01-current-structure-and-navigation-migration-contract.md`：P0.2 的现状页面/依赖审计、迁移分类、canonical 路径、旧深链和回滚合同；对应机器契约位于 `contracts/navigation/project-navigation-migration-v1.json`。
- `docs/superpowers/specs/2026-08-01-home-and-global-navigation-design.md`：D1.1 的首页六类状态、320/375/390pt 响应式画板、四目的地与中央“记一顿”动作规格；供 F1.3、F1.4 和 N1.1 实施消费。
- `docs/superpowers/specs/2026-08-01-dog-center-account-records-interface-design.md`：已确认的 D1.2 / D1.3 修订交接；只拆分当前“我的”的既有内容、原样保留当前记录页，并统一复用 D1.1 TabBar。
- 当前共享本餐主线按以下顺序阅读，发生冲突时以前一项为准：
  1. `docs/superpowers/specs/2026-07-26-shared-meal-checkin-prd.md`：已批准的产品事实来源。
  2. `docs/superpowers/plans/2026-07-28-shared-meal-deviation-closure.md`：相对当前实现基线的偏差收敛任务与验收状态。
  3. `docs/superpowers/plans/2026-07-26-shared-meal-checkin.md`：方向转型历史计划，仅用于追溯；其中自动克重和比例优化要求已被 PRD 替代。
- `docs/superpowers/specs/2026-07-26-shared-meal-checkin-design-concept.md`：记录方向转型的用户事实、产品澄清、Research、Prototype 证据和已选方案。
- `docs/superpowers/specs/2026-07-26-shared-meal-checkin-prd.json`：供 AFK Flow 校验和后续切片使用的机器契约。
- `docs/superpowers/specs/2026-07-26-shared-meal-issue-dag.json`：共享本餐的 5 节点纵向 Issue DAG 机器契约，已整体批准并进入 `afk-ready`。
- `docs/superpowers/specs/2026-07-26-shared-meal-issue-dag-review.md`：DAG 的自动审查轮次、阻断关闭证据、最少充分形状和人工批准门说明。

## 数据管线入口

- `docs/cloudbase-fooddata-import.md`：现有 Foundation Foods 与犬粮标准的 CloudBase 导入说明。
- `docs/ingredient-data-pipeline.md`：Foundation、SR Legacy、人饭菜谱和食材知识审核层的离线主库构建说明。
- `docs/data/ingredient-catalog-sop.md`：后续新增、修正、审核和发布 `ingredient_catalog` 的强制标准流程。
- `docs/data/canine-ingredient-policies-sop.md`：每次目录导入后的犬食安全策略对账、证据审核、版本化和发布流程。
- `docs/data/nutrient-rankings-sop.md`：营养素排行的公式、过滤、版本化、空排行、导入和回滚流程。
- `docs/data/human-recipes-sop.md`：授权菜谱的原料映射、安全过滤、运行时投影和增量发布流程。
- `docs/data/shared-meal-record-deployment.md`：共享本餐记录云函数、集合权限、索引、只读探针、烟测和回滚契约。
- `docs/domain/CONTEXT.md`：食材概念、形态、目录项、安全策略和人饭原料提及的统一领域词汇。

<!-- miniapp-ui-system:docs:start -->
### UI 系统文档入口

- `docs/ui/design-system.md`：设计 token、颜色语义、排版、间距、圆角、阴影和页面布局规则。
- `docs/ui/component-contracts.md`：`components/ui/*` 的 props、events、slots、状态和样式隔离契约。
- `docs/ui/ai-frontend-rules.md`：AI 或开发者修改 UI 前后的规则、禁止项和验证命令。
- `scripts/check-ui-system.js`：UI 静态检查入口；全项目必须通过，不再使用迁移期 baseline。
<!-- miniapp-ui-system:docs:end -->

## 工作日志格式建议

工作日志放在 `docs/work-logs/YYYY-MM-DD.md`，按日期追加。单次记录使用下面格式：

```md
## HH:mm 任务标题

- 改动摘要：说明改了哪些文件或模块。
- 原因：说明为什么要改，关联问题或需求。
- 验证：列出实际运行的测试、检查或手动验收结果。
- 提交：记录 commit hash；未提交时写“未提交”。
- 备注：记录剩余风险、后续事项或用户确认点，没有可省略。
```

选择按日期分文件，是为了让日志和实际工作节奏对齐；一天内多次改动可以集中查看，也避免单个总日志过长。
