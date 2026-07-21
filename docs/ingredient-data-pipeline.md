# 食材知识层数据管线

## 目标

本管线把 Foundation Foods、SR Legacy 和人饭菜谱导入同一份离线 SQLite 主库，为后续审核和生成 CloudBase 运行时集合提供稳定输入。

它解决三个边界问题：

- 不覆盖或改写 USDA 原始数据；不同来源版本的同一营养素分别保留。
- 人饭菜谱原料先保留原文和位置，不在导入阶段自动绑定 `food_id`。
- 食材概念、营养形态、犬食安全策略和菜谱原料映射分表维护。

当前阶段生成离线主库，以及不依赖人工审核的 `data_releases`、`food_nutrition_profiles` CloudBase JSONL；不会生成或上传未经审核的食材目录、安全策略、营养排行和人饭菜谱。

## 数据源

本次验证使用：

- Foundation SQLite：`/Users/cyr/Documents/Codex/2026-07-07/ge/outputs/fooddata_foundation.sqlite`
- SR Legacy CSV：`/Users/cyr/Documents/Documents/Dogfood/FoodData_Central_sr_legacy_food_csv_2018-04`
- 人饭菜谱 CSV：`/Users/cyr/Documents/Documents/Dogfood/capu_data_5w/caipu_1.csv`

路径仅作为本地构建参数，不写死在脚本中。

USDA 数据在主库中标记为 `public_domain`。当前人饭菜谱目录只有数据文件和字段说明，没有足以确认生产商用授权的材料，因此标记为 `needs_review`；授权确认前不得把该来源发布到生产环境。

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

## 导出 CloudBase 只读投影

```bash
python3 scripts/fooddata/export_ingredient_cloudbase.py \
  --sqlite fooddata-cloudbase-export/2026-07-21-ingredient-data/ingredient_data.sqlite \
  --out-dir fooddata-cloudbase-export/2026-07-21-ingredient-data/cloudbase-jsonl
```

当前生成：

- `data_releases.jsonl`：1 条 staging 版本文档，不会自动切换活动版本。
- `food_nutrition_profiles.jsonl`：8,262 条一食物一文档的营养快照。
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
| `ingredient_mapping_decision` | 原料写法的审核结论 |
| `ingredient_mapping_component` | 复合原料拆出的一个或多个概念 |
| `review_task` | 歧义、复合、安全关键等人工审核队列 |

这些表当前只有 Schema，没有自动写入未经审核的结论。后续审核数据应来自可版本控制的种子文件，不能只在 SQLite 或云控制台中手工维护。

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

- 已生成：`data_releases`、`food_nutrition_profiles`。
- 等待审核种子：`canine_ingredient_policies`、`ingredient_catalog`、`nutrient_rankings`。
- 等待来源授权和原料映射审核：`human_recipes`。

`data_releases` 导出文档固定为 `staging`。只有在所有目标集合导入、索引和影子查询都通过后，才能另外更新活动版本指针。

首次导入或重复同步这两个已审核投影时，使用受限白名单脚本：

```bash
python3 scripts/fooddata/import_ingredient_cloudbase.py \
  --package-dir fooddata-cloudbase-export/2026-07-21-ingredient-data/cloudbase-jsonl \
  --env-id cloud1-d4gm1emm8c33e9298 \
  --tcb-bin /path/to/tcb
```

脚本只允许写入 `data_releases` 与 `food_nutrition_profiles`，导入前校验 manifest 行数和 SHA-256，按稳定 `_id` 幂等 Upsert，并在结束后核对集合总数。它不会激活 `staging` 发布，也不会写入待审核集合。

正常小程序查询不直接关联离线规范化表：

- 搜索读取 `ingredient_catalog`。
- 一餐计算按 `foodId` 批量读取 `food_nutrition_profiles`。
- 富含某营养素的食材读取 `nutrient_rankings`。
- 人饭菜谱通过云函数读取 `human_recipes`。
- 保存狗饭时由云函数重新校验目录、营养形态和犬食策略。

## 下一阶段

1. 建立首批食材概念、别名、营养形态和安全策略种子。
2. 优先审核高频原料写法，并将调味料、复合食品和安全关键项分流。
3. 生成 `food_nutrition_profiles` 与发布 manifest。
4. 在菜谱授权确认后，才生成可用于生产的 `human_recipes`。
5. 通过不可变 `release_id` 和活动版本指针完成 CloudBase 发布与回滚。
