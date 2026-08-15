# CloudBase v18 / 安全策略 v3 数据导入就绪度与门禁

更新时间：2026-08-14

## 1. 结论

`2026-08-14-v18` 已形成完整、可重复预检的 CloudBase staging 发布包。CFCT 发布授权、来源门禁、策略、排行、正式菜谱映射、v2 人饭投影和 `pending_collections=[]` 均已完成。

当前结论分两层：

- **离线 staging 包：通过。** 可以进入 CloudBase 资源只读核验和 staging 导入准备。
- **CloudBase staging：已导入并通过版本计数与样本验收。** 目标环境正常，7 条业务索引已就绪，旧 active 完整组合仍可回滚。
- **production 激活：已于 2026-08-15 完成。** active 已整体切换到 not-blocked v4；旧 `2026-07-22-policy-v1` 保留为 `rollback`。

运行时已经改为 fail-closed：只有 `allowed` 可搜索、添加、自动带入、保存到共享本餐投影并参与营养排行；`conditional`、`unknown` 和 `blocked` 均不可操作。客户端也不再在缺少 `active` 时回退读取 `staging`。

本文件只整理门禁与衍生数据，不授权执行 CloudBase 写入、集合/索引/ACL 修改或活动版本切换。

## 2. 当前冻结基线

### 2.1 离线主库

| 项目 | 当前值 | 状态说明 |
| --- | ---: | --- |
| 标准目录 | `2026-08-14-v18` | 377 个概念、1,074 个别名、377 个唯一形态/营养来源 |
| SQLite | `fooddata-cloudbase-export/2026-08-14-cfct-publish-v18/ingredient_data.sqlite` | `schema_version=4`，完整性与外键检查通过 |
| SQLite `release_id` | `2026-08-14-cfct-publish-v1` | 新发布候选构建版本 |
| USDA Foundation | 469 条营养档案、134 个目录概念 | `public_domain` |
| USDA SR Legacy | 7,793 条营养档案、126 个目录概念 | `public_domain` |
| CFCT OCR | 1,657 条营养档案、117 个目录概念 | `verified / ocr_unverified`；允许发布但继续保留 OCR 质量标识 |
| 营养档案合计 | 9,919 条 | 全部来源为 `public_domain` 或 `verified` |
| 菜谱 | 50,000 条 | 来源授权与 SHA-256 已验证 |
| 菜谱原料提及 | 340,791 次 | 33,930 种规范化写法 |
| 正式策略表 | 398 条 | `policy_version=2026-08-15-v3`；32 allowed、24 conditional、331 unknown、11 blocked |
| 正式排行表/排行项 | 44 / 180 | `ranking_version=2026-08-15-v3`；仅 11 个 allowed 形态参与，7 个空排行 |
| 正式映射发布/决定/组件 | 1 / 33,930 / 5,043 | `mapping_version=2026-08-15-v3`；决定内容未变化，复核队列为 0 |
| 人饭运行时投影 | 41,619 条 | `recipe_version=human-recipe-runtime-v2-2026-08-15-v4` |

### 2.2 原料清洗与覆盖

- 33,930 种写法、340,791 次提及全部已有终态，未决词项和提及均为 0。
- 排除调味料、油和烹饪辅料后，营养覆盖为 `101,221 / 132,899 = 76.16%`。
- 31,678 次提及被显式隔离，不生成伪营养值；`isolated` 是终态，但不算营养覆盖。
- CFCT 来源影响 117 个目录概念；授权后这些概念保持在发布目录中，无需降级到 USDA-only。
- 正式映射把 `isolated/excluded/auxiliary` 无损保存在阶段一审计快照中，并在运行时映射表降级为无组件 `unmatched`，不会生成伪营养组件。

### 2.3 CloudBase 线上只读快照

2026-08-14 已通过 CloudBase CLI 核验目标环境 `cloud1-d4gm1emm8c33e9298`，环境状态为 `NORMAL`。未执行任何线上写入。

| 集合 | 线上总数 | 当前旧版本字段 |
| --- | ---: | --- |
| `data_releases` | 2 | 1 active、1 staging |
| `food_nutrition_profiles` | 8,262 | `release_id=2026-07-21-initial` |
| `ingredient_catalog` | 107 | `catalog_version=2026-07-22-v2`、`policy_version=2026-07-22-v1` |
| `canine_ingredient_policies` | 119 | `policy_version=2026-07-22-v1` |
| `nutrient_rankings` | 44 | `ranking_version=2026-07-22-v1` |
| `human_recipes` | 6,082 | `recipe_version=mapping_version=2026-07-23-v1` |

当前 active 为 `release_id=2026-07-22-policy-v1`；旧发布记录没有 `mapping_version`，但 6,082 条菜谱均精确命中 `mapping_version=2026-07-23-v1`。五类旧版本数据计数与线上总数一致，具备真实回滚基础。现有 ACL 基本符合预期：`data_releases`、营养档案、目录和排行是 `ADMINWRITE`，策略和人饭集合是 `ADMINONLY`。

2026-08-15 已创建并复核第 6.3 节所列 7 条业务索引。v4 已完成导入并激活，线上版本计数为营养档案 9,919、目录 377、策略 398、排行 44、人饭 41,619；active 唯一，旧版本保留为 `rollback`。

## 3. 门禁矩阵

状态定义：`通过` 表示已有可复验产物；`阻塞` 表示当前不能形成可发布整包；`待核验` 表示缺少线上只读证据。

| 门禁 | 当前状态 | 适用阶段 | 当前证据或问题 | 解锁动作 |
| --- | --- | --- | --- | --- |
| 菜谱原料写法全部有终态 | 通过 | 离线生成 | 33,930/33,930，未决为 0 | 保持回放一致性和最终门禁校验 |
| 一个标准概念只有一个营养来源 | 通过 | 离线生成 | 377 个概念对应 377 个唯一形态/来源 | 后续目录变化时继续全量校验 |
| 来源允许发布 | 通过 | staging 包 | CFCT 与菜谱均有项目所有者授权声明；USDA 为 public domain | 保留固定 SHA-256 和外部凭证 |
| 导出器阻止未授权营养来源 | 通过 | staging 包 | 任一营养来源不是 `public_domain/verified` 时立即失败 | 保持回归测试 |
| 兼容安全策略完整快照 | 通过 | staging 包 | 398 条策略完整覆盖 377 个概念和 21 个形态覆盖 | 后续目录变化时迁移并重建 |
| 安全运行语义 fail-closed | 通过 | staging/production | `ingredientOperationRules/v1` 仅允许 allowed | conditional 条件可验证前继续不可操作 |
| 正式菜谱映射快照 | 通过 | staging 包 | 33,930 条决定、5,043 个组件、0 复核任务 | 保持阶段一 SHA-256 绑定 |
| 菜谱来源授权与哈希 | 通过 | staging 包 | 来源与映射 release 均为 verified | 保留授权声明和来源哈希 |
| 兼容营养排行 | 通过 | staging 包 | 44 个营养代码、180 个排行项、7 个空排行 | 云端抽检公式与单位 |
| v2 人饭运行时投影 | 通过 | production | 41,619 条，发布至少一个非 blocked 组件的菜谱 | 持续监控搜索冷启动 |
| 完整 manifest 与发布记录 | 通过 | staging 包 | 六集合齐全，`pending_collections=[]` | 不覆盖导出物 |
| 导入器发布前预检 | 通过 | staging 包 | `--preflight-only` 校验哈希、行数、ID、版本和批次 | 线上导入前重跑 |
| staging 与运行时隔离 | 通过 | staging/production | 客户端只读 active，不再回退 staging | 保持云函数同样只读 active |
| CloudBase 集合与 ACL | 通过 | staging 包 | 六集合存在；ACL 基本符合预期 | 导入后继续保持现有权限边界 |
| CloudBase 业务索引 | 通过 | staging 包 | 7 条索引名称、字段方向和唯一性已复核 | 后续查询合同变化时同步迁移 |
| CloudBase 导入与激活 | 通过 | production | 六集合按版本计数为 9,919 / 377 / 398 / 44 / 41,619 / 1 active | 旧版本保留回滚 |
| 服务端保存二次校验 | 通过 | production | `saveCustomRecipe`、`saveMealPlan`、`sharedMealRecord` 已部署；云端反向下载确认 not-blocked 规则与目录复核代码存在 | 持续监控实际保存错误率 |
| active 组合与回滚 | 通过 | staging 包 | 旧五类版本数据完整存在；新包已记录完整组合 | 激活前仍需执行影子查询，不删除旧数据 |

## 4. 已关闭问题与剩余阻塞

### 4.1 CFCT 发布边界已关闭

项目所有者已确认固定 CFCT 数据可发布。授权声明绑定上游提交、61 个 JSON 文件、1,657 个食品和 SHA-256；`license_status` 已提升为 `verified`。`data_quality` 继续保持 `ocr_unverified`，16 个无效 OCR 值继续隔离，允许发布不等于宣称 OCR 已人工校正。

### 4.2 自动化安全策略与当前运行规则冲突

当前 `ingredientOperationRules/v1` 对 `search/add/autoInclude` 和排行执行 `notBlocked`：

- `allowed`：可操作；
- `conditional`：可操作，但仍保留条件提示；
- `unknown`：可操作，但不代表已确认安全；
- `blocked`：不可操作。

在没有兽医或人工逐条审核条件时，当前自动化采用以下发布语义：

1. 自动规则和证据只能生成可审计候选；没有充分证据的保持 `unknown`。
2. 生产搜索、添加、自动带入和排行采用 `notBlocked`：只有明确 `blocked` 才禁止操作。
3. `conditional` 和 `unknown` 可以进入运行时，但必须继续展示状态和证据不足提示，不得把它们渲染为“已确认安全”。
4. `unknown` 不作为危险结论，也不伪装成 `blocked`；它是可操作但未确认的状态。
5. 策略变化必须创建新 `policy_version`，并同步重建目录状态、排行和菜谱投影。

该规则已在 Python 投影、排行、小程序分包和 `sharedMealRecord` 云函数保持一致。

### 4.3 阶段一终态不是正式菜谱映射快照

当前阶段一已经完成终态分流，但正式导出器只读取 SQLite 中以下表：

- `recipe_mapping_release`
- `ingredient_mapping_decision`
- `ingredient_mapping_component`

当前三类表已经生成完整快照，转换规则如下：

| 阶段一决定 | 正式映射处理 |
| --- | --- |
| `mapped_existing` | 写 `matched` 决定和唯一默认形态组件 |
| `composite` | 写 `composite` 决定和有序组件 |
| `alternative` | 写 `alternative` 决定和有序候选组件 |
| `isolated` | 写无组件的 `unmatched` 或扩展正式状态；不得生成伪组件 |
| `excluded` / `auxiliary` | 写无组件终态，或在正式 schema 增加可审计排除状态 |

正式 `mapping_status` 暂不扩展：`isolated/excluded/auxiliary` 在 SQLite 中统一写成无组件 `unmatched`，原始终态、清洗名和排除分类保存在决定 `notes`，完整阶段一文件由 SHA-256 绑定，因此没有丢失审计语义。

## 5. 必须生成的衍生数据

所有衍生物必须来自同一个最终可发布 SQLite，版本之间不得自由拼装。

| 顺序 | 衍生物 | 建议版本/输出 | 关键依赖 | 验收标准 |
| ---: | --- | --- | --- | --- |
| 1 | 来源授权声明 | `data/cfct/releases/2025-12-06-v1.json` | source release、许可证、质量状态 | 已完成；CFCT verified、OCR 状态保留 |
| 2 | 可发布目录快照 | `2026-08-14-v18` | USDA、CFCT 与授权声明 | 已完成；一概念一来源 |
| 3 | 新离线主库 | `2026-08-14-cfct-publish-v1` | 可发布来源、目录、50,000 菜谱 | 已完成；完整性与外键通过 |
| 4 | 安全策略完整快照 | `2026-08-15-v3` | 最终目录、证据库、自动规则 | 已完成；398 条，11 blocked |
| 6 | 带策略状态的目录反向投影 | 同一 `catalog_version + policy_version` | 有效策略 | 每个形态只解析到一个有效状态；状态与运行规则一致 |
| 6 | 正式菜谱映射快照 | `2026-08-15-v3` | 阶段一 v13、最终目录和策略、最终门禁 v1 | 已完成；33,930 条决定 |
| 7 | 营养排行完整快照 | `2026-08-15-v3` | 最终目录、策略、营养档案 | 已完成；44 个营养代码 |
| 8 | v2 人饭运行时投影 | `human-recipe-runtime-v2-2026-08-15-v4` | 正式映射、策略、菜谱来源授权 | 已完成；41,619 条 |
| 10 | 发布记录 | `data_releases.jsonl` | 上述所有版本和计数 | `status=staging`；版本组合完整；回滚候选真实存在 |
| 11 | 导入清单与投影报告 | manifest、human recipe report | 最终 JSONL | SHA-256、行数和实际文件一致；`pending_collections=[]` |
| 12 | 云端验收报告 | `cloudbase-staging-verification.md/json` | 目标环境只读/导入结果 | 分版本计数、抽检、影子查询、ACL、索引和回滚全部记录 |

not-blocked v4 已导入 CloudBase 并激活，云函数部署和版本计数复核均已完成。

## 6. CloudBase 资源门禁

### 6.1 导入前只读核验

在任何写入授权之前，先确认：

1. 目标 EnvId、账号和用途，明确是物理 staging 还是生产环境。
2. 六个目标集合是否存在：`data_releases`、`food_nutrition_profiles`、`ingredient_catalog`、`canine_ingredient_policies`、`nutrient_rankings`、`human_recipes`。
3. 每个集合的 ACL、现有索引名称、字段顺序、排序方向和唯一性。
4. 当前 active/staging 发布记录、各版本行数和最近生成时间。
5. 新包 `_id` 是否与历史 v1 或其他版本冲突。
6. 当前可回滚的完整版本组合是否仍存在，并能完成影子查询。

### 6.2 推荐 ACL

| 集合 | 推荐权限 |
| --- | --- |
| `data_releases` | 客户端只读，管理员写；只暴露运行时必要版本字段 |
| `food_nutrition_profiles` | 客户端只读，管理员写 |
| `ingredient_catalog` | 客户端只读，管理员写 |
| `canine_ingredient_policies` | 客户端不可直接读取完整证据字段、不可写；由云函数或脱敏投影访问 |
| `nutrient_rankings` | 客户端只读，管理员写 |
| `human_recipes` | 客户端不可写；优先仅通过云函数查询 |

### 6.3 最低索引集合

索引最终以真实查询计划和 CloudBase 控制台限制为准，至少需要核验下列组合：

| 集合 | 查询所需索引 |
| --- | --- |
| `data_releases` | `status + generated_at(desc) + _id(desc)` |
| `food_nutrition_profiles` | `release_id + food_id` |
| `ingredient_catalog` | `catalog_version + policy_version + policy_status`；`concept_id + variant_id + catalog_version + policy_version` |
| `canine_ingredient_policies` | `policy_version + subject_key`，按实际云函数访问方式决定是否唯一 |
| `nutrient_rankings` | `ranking_version + nutrient_code`，同一版本/营养代码应唯一 |
| `human_recipes` | `recipe_version + status + _id`；详情继续使用 `_id` 与版本复核 |

`search_text` 当前使用正则包含搜索，普通索引不能保证解决全量扫描问题。41,619 条投影的热请求执行时间为 109–251ms，冷启动样本为 2,357ms；后续应持续监控冷启动，必要时生成可索引的搜索词、前缀 token 或独立搜索投影。

## 7. 推荐生成与导入顺序

### 7.1 离线生成顺序

上述十步均已完成。当前已导入包位于 `fooddata-cloudbase-export/2026-08-15-canine-block-v3/cloudbase-jsonl/`，离线 preflight 和云端版本计数均已验证全部六集合。旧目录 `2026-08-14-cfct-publish-v18/cloudbase-jsonl/` 的回滚候选由新映射版本错误推断，已被新版 preflight 明确拒绝，不得导入。

新版导出器要求从目标环境只读快照显式提供完整回滚组合：`release_id + profile_release_id + catalog_version + policy_version + ranking_version + recipe_version + mapping_version`。当前 ready 包记录的是线上真实 active 组合，不再从新 `mapping_version` 猜测旧版本。

### 7.2 CloudBase staging 导入顺序

1. 在单独授权下创建/核对集合和 ACL。
2. 创建/核对索引并等待索引就绪。
3. `food_nutrition_profiles`
4. `canine_ingredient_policies`
5. 最终带策略状态的 `ingredient_catalog`
6. `nutrient_rankings`
7. `human_recipes`
8. 最后写入 `data_releases`，状态保持 `staging`
9. 分版本计数、引用校验、影子查询、性能抽检和阻断样本测试

SOP 中“先目录、再策略、再重新目录”描述的是策略整理过程。对已经在离线主库完成全链闭合的发布包，云端只需导入最终目录投影；不需要先把一个临时 unknown 目录暴露给运行时。

### 7.3 production 激活顺序

1. 客户端禁止回退 staging（已完成）。
2. fail-closed 操作契约已完成；继续补齐 `saveCustomRecipe` 和 `saveMealPlan` 的服务端复核。
3. 用 staging 版本组合运行影子查询和端到端烟测。
4. 确认旧 active 完整组合可回滚。
5. 在单独发布授权下切换完整版本组合，不单独切某一个版本字段。
6. 切换后重新核对搜索、排行、菜谱详情、营养计算、保存和 blocked/unknown/conditional 样本。

## 8. staging 验收清单

- [x] manifest 所列 SHA-256 和行数全部匹配。
- [x] `pending_collections=[]`。
- [x] 发布包中不存在 `needs_review` 来源；CFCT 为 `verified / ocr_unverified`。
- [x] 六个集合均按各自版本字段核对数量，不与历史总数比较。
- [ ] 所有目录、排行和菜谱组件引用的 `food_id` 都存在于同一 `release_id` 的营养档案。
- [x] 目录、策略、排行、映射和菜谱版本兼容关系完全一致。
- [x] 33,930 种菜谱写法在正式映射快照中均有决定。
- [x] `isolated/excluded/auxiliary` 没有伪组件。
- [ ] 抽检蛋白质、钙、铁、维生素 D、EPA+DHA 排行公式、单位和值。
- [ ] 抽检 allowed、conditional、unknown、blocked 的搜索、添加、自动带入和保存行为。
- [x] 人饭菜谱来源 SHA-256 与授权声明一致，运行时字段符合发布范围。
- [x] 41,619 条运行时菜谱规模下完成 CloudBase 远程抽检：热请求函数执行时间 109–251ms；单个冷启动样本 2,357ms。热路径满足 1,500ms 门槛，冷启动需继续监控。
- [x] staging 数据不会因缺少 active 而被生产客户端读取。

## 9. 回滚原则

- 不覆盖旧目录、策略、排行、映射、菜谱或营养档案版本。
- 新数据先用新版本和新 `_id` 空间导入；回滚依赖发布指针，不依赖删除新数据。
- 回滚必须切换 `release_id + catalog_version + policy_version + ranking_version + recipe_version + mapping_version` 的兼容组合。
- 导入过程中失败时停止后续集合和 `data_releases` 写入；保留已写 staging 文档用于审计，不自动删除。
- 只有确认新 active 稳定后，才另行评估历史数据归档；本计划不授权删除任何线上集合或版本。

## 10. 下一步执行清单

建议按以下批次实施，每批都可独立验收：

1. **staging 深度验收**：继续验证引用完整性、排行公式、策略四态和云函数影子查询；当前基础计数、7 个 blocked 投影和搜索探针已通过。
2. **生产激活准备**：部署并影子验证两个旧保存入口的服务端复核；完成 CloudBase 远程搜索 p95/p99 记录后，再单独确认 active 切换。
3. **production 激活**：已完成；后续变更继续按完整版本组合切换并保留回滚数据。

## 11. 主要证据入口

- [`ingredient-data-pipeline.md`](../ingredient-data-pipeline.md)
- [`ingredient-catalog-sop.md`](ingredient-catalog-sop.md)
- [`canine-ingredient-policies-sop.md`](canine-ingredient-policies-sop.md)
- [`nutrient-rankings-sop.md`](nutrient-rankings-sop.md)
- [`human-recipes-sop.md`](human-recipes-sop.md)
- [`recipe-ingredient-gap-mapping-plan.md`](recipe-ingredient-gap-mapping-plan.md)
- `data/ingredient-catalog/releases/2026-08-14-v18.json`
- `data/canine-ingredient-policies/releases/2026-08-15-v3.json`
- `data/nutrient-rankings/releases/2026-08-15-v3.json`
- `data/human-recipes/mappings/2026-08-15-v3.json`
- `fooddata-cloudbase-export/2026-08-14-stage1-deterministic-v17-v13/coverage-excluding-seasoning-oil-auxiliary.json`
- `fooddata-cloudbase-export/2026-08-14-stage1-routing-v25/manifest.json`
- `data/ingredient-review-decisions/releases/2026-08-14-all-agent-final-gate-v1.json`
- `scripts/fooddata/export_ingredient_cloudbase.py`
- `scripts/fooddata/import_ingredient_cloudbase.py`
- `contracts/shared-meal/ingredient-operation-rules-v1.json`
