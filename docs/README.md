# 项目文档目录

## 目录约定

- 产品、设计、架构、审核记录和实现记录统一放在 `docs/`。
- 高保真界面稿保留在 `docs/狗饭小程序完整界面稿-批量制作版.html`。
- 设计稿依赖图片放在 `docs/design-assets/`，只服务设计稿预览，不进入小程序运行包。
- `AGENTS.md` 保留在仓库根目录，作为工具和协作规则入口。

## 数据管线入口

- `docs/cloudbase-fooddata-import.md`：现有 Foundation Foods 与犬粮标准的 CloudBase 导入说明。
- `docs/ingredient-data-pipeline.md`：Foundation、SR Legacy、人饭菜谱和食材知识审核层的离线主库构建说明。
- `docs/data/ingredient-catalog-sop.md`：后续新增、修正、审核和发布 `ingredient_catalog` 的强制标准流程。
- `docs/data/canine-ingredient-policies-sop.md`：每次目录导入后的犬食安全策略对账、证据审核、版本化和发布流程。
- `docs/data/nutrient-rankings-sop.md`：营养素排行的公式、过滤、版本化、空排行、导入和回滚流程。
- `docs/data/human-recipes-sop.md`：授权菜谱的原料映射、安全过滤、运行时投影和增量发布流程。
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
