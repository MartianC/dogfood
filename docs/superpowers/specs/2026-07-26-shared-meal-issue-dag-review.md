# 共享本餐 Issue DAG 审查记录

## 当前结论

- 状态：`clear`，完整 DAG 已于 2026-07-26 获人工批准
- Issue 数：5
- 关键路径：`SHARED-MEAL-001 → SHARED-MEAL-002 → SHARED-MEAL-003 → SHARED-MEAL-004 → SHARED-MEAL-005`
- 并发：无安全的跨 Issue 写入并发；相邻节点共享公共契约或高冲突写面，按依赖串行执行
- PRD 覆盖：SC1–SC15 全部覆盖
- 当前授权：所有 Issue 均为 `afk-ready`，`merge=false`
- 未授权事项：生产部署、生产数据或索引迁移、秘密访问、数据删除、自动合并

完整机器契约见
[`2026-07-26-shared-meal-issue-dag.json`](./2026-07-26-shared-meal-issue-dag.json)。

## 最少充分形状

| Issue | 纵向结果 | 主要隔离收益 |
| --- | --- | --- |
| SHARED-MEAL-001 | 非 blocked 投影与受控人饭查询 | 隔离离线数据投影、活动版本解析和只读云查询 |
| SHARED-MEAL-002 | 结构化档案门禁与可恢复无克重草稿 | 隔离犬只适用范围、档案往返和跨页草稿状态 |
| SHARED-MEAL-003 | 草稿调整、双轴评估与富含营养素往返 | 隔离共享评估核心、分包边界和保存前状态机 |
| SHARED-MEAL-004 | 鉴权幂等记录与不可变快照回看 | 隔离服务端鉴权、并发幂等、schema/index 和历史快照 |
| SHARED-MEAL-005 | 首页、记录、我的主导航迁移 | 在核心闭环通过后单独切换高冲突全局入口 |

单节点会把五种不同的实现、审查和回滚模型交给同一 Worker；
合并相邻节点会重新集中数据发布、状态机、算法复用、数据库安全或全局入口风险。
继续拆分则会形成数据、API、UI、测试等水平技术层。因此 5 个节点是当前最少充分形状。

## 自动审查过程

### 第一轮：`fix`

Reviewer 发现 4 类阻断：

1. 人饭查询缺少真实云函数和 adapter 写入范围。
2. 疾病、妊娠、哺乳和治疗性体重管理缺少结构化档案字段及完整写入面。
3. 现有评估与富含营养素入口位于其他分包，草稿适配契约不兼容。
4. 调整评估与安全记录事务集中在一个过载节点，且记录读后端、schema/index 验证不完整。

Author 将 4 节点修订为 5 节点，拆出独立的调整评估节点，并补齐真实后端、档案、分包复用和记录事务契约。

### 第二轮：`fix`

Reviewer 进一步发现 4 类真实落点缺口：

1. 旧 `is_searchable` / `is_selectable` 迁移影响的测试和权威文档不在写入范围。
2. `authService` 仍持有独立的 `dogsCache` 版本常量。
3. Issue 2–4 对 `sharedMealIngredient/v1` 的版本字段表达不一致。
4. 现有主包检查器不能识别分包对根共享服务的引用。

Author 保持 5 节点形状，补齐写入范围，统一 `dogProfileContract` 与
`dogsCache v3`，以单一 JSON Schema 和 fixture 冻结
`sharedMealIngredient/v1`，并把主包检查器及正反 fixture 纳入 Issue 3。

### 第三轮：`clear`

新的独立 Reviewer 确认：

- 第二轮 4 项阻断全部实质关闭；
- 5 个 Issue 是最少充分形状，无应合并或继续拆分的节点；
- 依赖链无环，SC1–SC15 全部可追踪；
- 共享写域按依赖串行，独占资源足以预测冲突；
- 所有 Issue 的 Worker 上下文、独立验收和回滚面均可接受；
- 没有扩大到生产部署、秘密、生产迁移、删除或自动合并权限。

## 确定性校验

- `validate-issue`：5/5 通过
- `validate-dag`：通过，依赖无环
- `validate-slices`：通过，PRD SC1–SC15 全覆盖
- Reviewer 终审：`clear`，`findings=[]`

## 人工批准结果

用户于 2026-07-26 批准完整 5 节点 DAG。`approve-dag` 已重新验证 PRD 覆盖，
并将整批节点转换为 `afk-ready`。GitHub Issue 已建立双向回链：

1. [#1 SHARED-MEAL-001](https://github.com/MartianC/dogfood/issues/1)
2. [#2 SHARED-MEAL-002](https://github.com/MartianC/dogfood/issues/2)
3. [#3 SHARED-MEAL-003](https://github.com/MartianC/dogfood/issues/3)
4. [#4 SHARED-MEAL-004](https://github.com/MartianC/dogfood/issues/4)
5. [#5 SHARED-MEAL-005](https://github.com/MartianC/dogfood/issues/5)

批量写入采用两阶段门禁：先以不可调度的 `dag-review` 创建并核对全部
Issue，再通过单次 GitHub GraphQL 请求把 5 个节点一起切换为
`afk-ready`。没有单 Issue 提前获得授权。
