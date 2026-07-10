# 项目文档目录

## 目录约定

- 产品、设计、架构、审核记录和实现记录统一放在 `docs/`。
- 高保真界面稿保留在 `docs/狗饭小程序完整界面稿-批量制作版.html`。
- 设计稿依赖图片放在 `docs/design-assets/`，只服务设计稿预览，不进入小程序运行包。
- `AGENTS.md` 保留在仓库根目录，作为工具和协作规则入口。

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
