# 食材知识层数据管线

## 目标

本管线把 Foundation Foods、SR Legacy 和人饭菜谱导入同一份离线 SQLite 主库，为后续审核和生成 CloudBase 运行时集合提供稳定输入。

它解决三个边界问题：

- 不覆盖或改写 USDA 原始数据；不同来源版本的同一营养素分别保留。
- 人饭菜谱原料先保留原文和位置，不在导入阶段自动绑定 `food_id`。
- 食材概念、营养形态、犬食安全策略和菜谱原料映射分表维护。

当前阶段生成离线主库、营养快照、覆盖狗饭常用范围的 `ingredient_catalog`、首个保守的犬食安全策略快照、营养素排行，以及经过精确映射和安全过滤的人饭菜谱运行时投影。策略明确标记为非兽医终审；所有投影保持 staging，不会自动激活生产。

## 数据源

本次验证使用：

- Foundation SQLite：`/Users/cyr/Documents/Codex/2026-07-07/ge/outputs/fooddata_foundation.sqlite`
- SR Legacy CSV：`/Users/cyr/Documents/Documents/Dogfood/FoodData_Central_sr_legacy_food_csv_2018-04`
- 人饭菜谱 CSV：`/Users/cyr/Documents/Documents/Dogfood/capu_data_5w/caipu_1.csv`

路径仅作为本地构建参数，不写死在脚本中。

USDA 数据在主库中标记为 `public_domain`。人饭菜谱授权已经由项目所有者确认，版本化声明位于 `data/human-recipes/sources/capu-5w.json`；映射生成器校验实际 CSV SHA-256 后把来源标记为 `verified`。授权合同或原始凭证由项目所有者在代码库之外保管。

## 构建命令

```bash
python3 scripts/fooddata/build_ingredient_data_sqlite.py \
  --foundation-sqlite /Users/cyr/Documents/Codex/2026-07-07/ge/outputs/fooddata_foundation.sqlite \
  --sr-legacy-dir /Users/cyr/Documents/Documents/Dogfood/FoodData_Central_sr_legacy_food_csv_2018-04 \
  --recipes-csv /Users/cyr/Documents/Documents/Dogfood/capu_data_5w/caipu_1.csv \
  --out-sqlite fooddata-cloudbase-export/2026-07-21-ingredient-data/ingredient_data.sqlite \
  --release-id 2026-07-21-initial
```

输出目录已由 `.gitignore` 忽略。构建器拒绝覆盖已有 SQLite；需要重建时必须先明确处理旧产物，避免误删人工审核结果。

构建完成后，用版本化种子写入首批标准食材概念、别名和营养形态：

```bash
python3 scripts/fooddata/seed_ingredient_catalog.py \
  --sqlite fooddata-cloudbase-export/2026-07-22-v2-final/ingredient_data.sqlite \
  --seed data/ingredient-catalog/releases/2026-07-22-v2.json
```

种子脚本会校验每个 `source_version + fdc_id` 的原始英文描述和营养记录，任何一条不匹配都会整体回滚。

随后写入与目录版本兼容的完整犬食安全策略快照：

```bash
python3 scripts/fooddata/seed_canine_ingredient_policies.py \
  --sqlite fooddata-cloudbase-export/2026-07-22-policy-v1/ingredient_data.sqlite \
  --seed data/canine-ingredient-policies/releases/2026-07-22-v1.json
```

未显式给出非 `unknown` 结论的概念会生成审核过的保守默认，不会因为缺行而变成允许。

最后按兼容目录和策略生成营养素排行：

```bash
python3 scripts/fooddata/seed_nutrient_rankings.py \
  --sqlite fooddata-cloudbase-export/2026-07-22-ranking-v1-final/ingredient_data.sqlite \
  --rules data/nutrient-rankings/releases/2026-07-22-v1.json
```

排行只包含有效 `is_selectable=true` 的目录形态；缺少完整组成值的组合营养素不会把缺失值当零。

随后生成完整原料写法映射快照：

```bash
python3 scripts/fooddata/seed_recipe_ingredient_mappings.py \
  --sqlite fooddata-cloudbase-export/2026-07-23-human-recipes-v1/ingredient_data.sqlite \
  --mapping data/human-recipes/mappings/2026-07-23-v1.json
```

首版只使用已批准唯一别名精确匹配；其余写法明确保存为 `unmatched` 并保持不可选择。

## 导出 CloudBase 只读投影

```bash
python3 scripts/fooddata/export_ingredient_cloudbase.py \
  --sqlite fooddata-cloudbase-export/2026-07-21-ingredient-data/ingredient_data.sqlite \
  --out-dir fooddata-cloudbase-export/2026-07-22-ingredient-catalog-v1/cloudbase-jsonl
```

当前生成：

- `data_releases.jsonl`：1 条 staging 版本文档，不会自动切换活动版本。
- `food_nutrition_profiles.jsonl`：8,262 条一食物一文档的营养快照。
- `ingredient_catalog.jsonl`：107 条一食材形态一文档的狗饭常用食材搜索目录。
- `canine_ingredient_policies.jsonl`：119 条概念或形态级完整策略快照。
- `nutrient_rankings.jsonl`：44 条一营养素一文档的安全过滤排行，共180个排行项。
- `human_recipes.jsonl`：6,082条至少含一个当前安全可选组件的菜谱运行时投影。
- `cloudbase-ingredient-import-manifest.json`：来源 SHA-256、行数、最大文档体积和文件校验值。

真实导出中，最大营养快照为 13,357 bytes，低于项目采用的 512 KiB 文档预算。营养素按稳定 `nutrient_id` 存入 `nutrients` 对象：

```json
{
  "1004": {
    "name": "Total lipid (fat)",
    "unit": "G",
    "amount": 0,
    "value_status": "known"
  },
  "1008": {
    "name": "Energy",
    "unit": "KCAL",
    "amount": null,
    "value_status": "unknown"
  }
}
```

明确测得的零值是 `known + 0`；没有可靠数值是 `unknown + null`，两者不得在营养评估中混用。

## 本次真实数据结果

| 数据 | 数量 |
| --- | ---: |
| USDA 食物 | 8,262 |
| USDA 营养明细 | 665,551 |
| 人饭菜谱 | 50,000 |
| 菜谱原料提及 | 340,791 |
| 规范化后不同原料写法 | 33,930 |
| 原料与分量长度一致的菜谱 | 49,991 |
| 原料与分量长度不一致的菜谱 | 9 |
| 当前标准食材概念 | 97 |
| 当前审核别名（含标准名称） | 164 |
| 当前食材形态/目录项 | 107 |
| 当前概念级安全策略 | 97 |
| 当前形态级策略覆盖 | 22 |
| 当前安全策略文档 | 119 |
| 当前营养素排行文档 | 44 |
| 当前营养素排行项 | 180 |
| 当前空排行 | 7 |
| 当前菜谱映射写法 | 33,930 |
| 当前精确匹配写法 | 128 |
| 当前高频映射审核任务 | 983 |
| 当前 CloudBase 可用人饭菜谱 | 6,082 |

其中 Foundation 和 SR Legacy 没有重复 `fdc_id`。两个数据源有 474 个重叠营养素 ID，但部分名称或排序元数据不同，所以 `source_nutrient` 使用 `(source_release_id, nutrient_id)` 复合主键，不进行覆盖式合并。

## 离线主库结构

### 来源和原始数据

| 表 | 职责 |
| --- | --- |
| `data_build` | 当前离线构建版本和 Schema 版本 |
| `source_release` | 来源路径、版本、SHA-256 和授权状态 |
| `source_import_stat` | 每个来源的导入行数 |
| `source_food` | 来源隔离的 USDA 食物记录 |
| `source_nutrient` | 来源隔离的营养素字典 |
| `source_food_nutrient` | 来源隔离的营养明细 |
| `source_localized_name` | Foundation 中文名称和别名 |
| `source_food_category` | SR Legacy 分类 |
| `source_sr_legacy_food` | SR Legacy NDB 编号映射 |

### 人饭菜谱

| 表 | 职责 |
| --- | --- |
| `human_recipe` | 菜谱 ID、原始分类、主分类、标题和原料原文 |
| `human_recipe_ingredient_mention` | 按原始位置拆出的原料和分量文本 |
| `recipe_ingredient_term` | 规范化原料写法及出现频次 |

`cid` 和 `zid` 只作为来源字段保存，不直接当作产品分类。`yl` 和 `fl` 以 `#` 按位置对应，保留空分量位置；狗饭配方不会沿用人饭分量。

### 食材知识与审核

| 表 | 职责 |
| --- | --- |
| `ingredient_concept` | 用户理解的标准食材概念 |
| `ingredient_alias` | 审核过的别名到概念映射 |
| `ingredient_variant` | 生熟、部位等营养形态及 USDA 来源记录 |
| `canine_ingredient_policy` | 概念或形态级犬食安全策略 |
| `nutrient_ranking` | 营养素排行版本、兼容版本、公式和覆盖统计 |
| `nutrient_ranking_item` | 经过安全过滤的食材名次、数值和计算组成 |
| `recipe_mapping_release` | 映射版本、兼容目录/策略、来源和授权状态 |
| `ingredient_mapping_decision` | 原料写法的审核结论 |
| `ingredient_mapping_component` | 复合原料拆出的一个或多个概念 |
| `review_task` | 歧义、复合、安全关键等人工审核队列 |

首批基线保存在 `data/ingredient-catalog/initial-v1.json`；当前完整快照是 `data/ingredient-catalog/releases/2026-07-22-v2.json`，包含 97 个概念、164 个审核别名和 107 个形态，其中 66 个形态引用 Foundation，41 个形态引用 SR Legacy。新增范围包括常用肉类与上位食材、内脏、鱼类、奶制品、主食、豆类、蔬果，以及洋葱、大蒜、葡萄和葡萄干四个安全拦截概念。当前 `canine_ingredient_policy` 由版本化策略种子生成，未知项仍显式保存为 `unknown`，不自动推断允许。所有审核数据必须来自可版本控制的种子文件，不能只在 SQLite 或云控制台中手工维护。

后续填充、修正或下线目录项必须遵循 [`ingredient_catalog` 持续填充 SOP](data/ingredient-catalog-sop.md)。每一批使用新的完整目录快照和新建的离线 SQLite；不能把下一批种子直接叠加到上一批 SQLite，也不能绕过 staging 在云端手工补记录。

每次 `ingredient_catalog` 导入 staging 后，必须按照 [`canine_ingredient_policies` 持续整理与发布 SOP](data/canine-ingredient-policies-sop.md) 重新执行策略覆盖对账、受影响项审核和目录反向投影。无变化策略可以版本化延续；新增或受影响项在审核完成前保持 `unknown` 且不可选择。

每次目录、策略、USDA 来源或营养公式变化后，必须按照 [`nutrient_rankings` 生成与发布 SOP](data/nutrient-rankings-sop.md) 重新生成完整排行。空排行必须显式保留，不能回退到未经审核食材。

人饭菜谱的来源授权、映射、审核、运行时筛选和发布必须遵循 [`human_recipes` 映射与发布 SOP](data/human-recipes-sop.md)。后续批次复用未变化决定，只审核新增或受影响的原料写法。

## 验证

```bash
sqlite3 -readonly fooddata-cloudbase-export/2026-07-21-ingredient-data/ingredient_data.sqlite \
  "PRAGMA integrity_check; SELECT COUNT(*) FROM pragma_foreign_key_check;"
```

预期结果：

```text
ok
0
```

定向自动化测试：

```bash
node --test tests/ingredient-data-sqlite-build.test.js
```

## CloudBase 发布边界

由同一离线主库分阶段生成以下只读投影：

- 已生成：`data_releases`、`food_nutrition_profiles`、`ingredient_catalog`、`canine_ingredient_policies`、`nutrient_rankings`、`human_recipes`。

`data_releases` 导出文档固定为 `staging`。只有在所有目标集合导入、索引和影子查询都通过后，才能另外更新活动版本指针。

首次导入或重复同步已生成投影时，使用受限白名单脚本并明确指定集合：

```bash
python3 scripts/fooddata/import_ingredient_cloudbase.py \
  --package-dir fooddata-cloudbase-export/2026-07-22-ingredient-catalog-v1/cloudbase-jsonl \
  --env-id cloud1-d4gm1emm8c33e9298 \
  --tcb-bin /path/to/tcb \
  --collection ingredient_catalog
```

脚本只允许写入 `data_releases`、`food_nutrition_profiles`、`ingredient_catalog`、`canine_ingredient_policies`、`nutrient_rankings` 与 `human_recipes`，导入前校验 manifest 行数和 SHA-256，按稳定 `_id` 幂等 Upsert；各投影按 `release_id`、`policy_version`、`ranking_version` 或 `recipe_version` 核对本版本数量，不与历史版本总数混淆。它不会激活 `staging` 发布。

CloudBase staging 当前包含107条目录项、119条安全策略、44条营养素排行和6,082条人饭菜谱。目录有效结果为 `allowed=11`、`conditional=25`、`blocked=4`、`unknown=67`；只有11个具有明确证据且无需额外机器条件的形态进入排行和菜谱选择。人饭来源共50,000条，运行时只发布至少含一个安全可选组件的菜谱。该策略版本尚未通过兽医终审，发布记录保持 staging。

正常小程序查询不直接关联离线规范化表：

- 搜索读取 `ingredient_catalog`。
- 一餐计算按 `foodId` 批量读取 `food_nutrition_profiles`。
- 富含某营养素的食材读取 `nutrient_rankings`。
- 人饭菜谱通过云函数读取 `human_recipes`。
- 保存狗饭时由云函数重新校验目录、营养形态和犬食策略。

## 下一阶段

1. 完成安全策略的兽医/犬类临床营养专业终审，重点复核所有 `allowed` 及从严转宽结论。
2. 实现云函数保存配方时的策略二次校验、策略集合权限和索引。
3. 设计烹饪状态确认，满足后再评估是否开放需要熟制的 `conditional` 形态。
4. 将小程序“富含营养素食材”查询切换到当前活动 `ranking_version`，并实现空排行状态。
5. 实现人饭菜谱云函数搜索/详情接口，并始终按活动 `recipe_version` 查询。
6. 优先审核高频未匹配原料写法，并将调味料、复合食品和安全关键项分流。
7. 通过不可变版本组合和活动版本指针完成 CloudBase 发布与回滚。
