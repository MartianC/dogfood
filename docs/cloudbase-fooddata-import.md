# FoodData 云数据库导入说明

## 数据源

源数据库：

`/Users/cyr/Documents/Codex/2026-07-07/ge/outputs/fooddata_foundation.sqlite`

导出命令：

```bash
python3 scripts/fooddata/export_fooddata_cloudbase.py \
  --sqlite /Users/cyr/Documents/Codex/2026-07-07/ge/outputs/fooddata_foundation.sqlite \
  --out-dir fooddata-cloudbase-export/2026-07-09 \
  --data-version 2026-07-09
```

如需把 FEDIAF 2025 犬粮标准一并导入，先基于源库生成带标准种子的 SQLite 副本，再导出 CloudBase JSONL：

```bash
python3 scripts/fooddata/seed_pet_nutrition_standards.py \
  --sqlite /Users/cyr/Documents/Codex/2026-07-07/ge/outputs/fooddata_foundation.sqlite \
  --seed data/pet-nutrition-standards/fediaf-2025-dog.json \
  --out-sqlite fooddata-cloudbase-export/2026-07-11-fediaf-2025/fooddata_foundation_fediaf2025.sqlite

python3 scripts/fooddata/export_fooddata_cloudbase.py \
  --sqlite fooddata-cloudbase-export/2026-07-11-fediaf-2025/fooddata_foundation_fediaf2025.sqlite \
  --out-dir fooddata-cloudbase-export/2026-07-11-fediaf-2025/cloudbase-jsonl \
  --data-version 2026-07-11-fediaf-2025
```

FEDIAF 2025 种子数据来自 FEDIAF 官方 2025 年 9 月版 Nutritional Guidelines，当前只整理犬完整食品 Table VII-17a-d 的 `Per 100 g DM` 推荐营养水平：早期生长与繁殖、晚期生长、成年犬 MER 110、成年犬 MER 95。猫、补充粮、脚注全文和其他章节暂未结构化。

## 集合

- `foods`：食物主信息，一条 SQLite `food` 记录一个文档。
- `food_nutrients`：完整 USDA 营养成分明细，一条 SQLite `food_nutrient` 记录一个文档，并补充 `name`、`unit_name` 便于展示。
- `food_localized_name`：本地化名称，一条 SQLite `food_localized_name` 记录一个文档。
- `pet_nutrition_standards`：犬粮营养标准，一条标准一个聚合文档；当前可包含 `GB/T 31216-2014` 和 `FEDIAF Nutritional Guidelines 2025`。

## 导入方式

首次导入使用 Insert。重复同步使用 Upsert，并依赖 `_id` 保持稳定。

JSON 文件是 JSON Lines 格式，每行一条文档：

- `foods.jsonl`
- `food_nutrients.jsonl`
- `food_localized_name.jsonl`
- `pet_nutrition_standards.jsonl`

推荐导入顺序：

1. `foods`
2. `food_nutrients`
3. `food_localized_name`
4. `pet_nutrition_standards`

导入前确认云环境 ID，且不要把环境 ID、密钥或登录态写入仓库。

## 推荐权限

公共营养数据集合允许小程序端读取，禁止小程序端写入。写入只通过控制台、导入流程或管理员云函数完成。

建议规则语义：

```json
{
  "read": true,
  "write": false
}
```

如果控制台使用模板权限，选择“所有用户可读，仅管理员可写”。

## 推荐索引

- `foods.fdc_id`：升序，唯一性由 `_id = food_<fdc_id>` 保证。
- `food_nutrients.food_id`：升序，用于按食物读取完整营养明细。
- `food_nutrients.fdc_id`：升序，用于按 USDA 食物 ID 查询营养明细。
- `food_nutrients.nutrient_id`：升序，用于按营养素反查食物。
- `food_localized_name.locale`：升序，用于限定语言地区。
- `food_localized_name.name`：升序，用于精确名称查询。
- `food_localized_name.name_type`：升序，用于区分主名称和别名。
- `food_localized_name.fdc_id`：升序，用于从名称结果回查食物。
- `pet_nutrition_standards.standard_code`：升序，用于按标准编号读取。

## 校验

导入前检查 `cloudbase-import-manifest.json` 的行数和 sha256。导入后在控制台确认集合记录数：

- `foods`: 469
- `food_nutrients`: 21426
- `food_localized_name`: 534
- 仅 GB/T 导入包：`pet_nutrition_standards = 1`
- 含 FEDIAF 2025 导入包：`pet_nutrition_standards = 2`

导入后抽查查询：

- `foods` 按 `_id = food_746782` 能读到食物主信息，且没有 `nutrients` 或 `nutrient_summary` 字段。
- `food_nutrients` 按 `food_id = food_746782` 能读到完整营养明细。
- `food_localized_name` 按 `locale = zh-CN` 且 `name = 全脂牛奶` 能读到 `food_id = food_746782`。
- `pet_nutrition_standards` 按 `standard_code = GB/T 31216-2014` 能读到 `profiles`。
- 含 FEDIAF 2025 导入包还应能按 `standard_code = FEDIAF Nutritional Guidelines 2025` 读到 4 个犬粮 `profiles`，其中 `fediaf_2025_dog_adult_mer_95` 的蛋白质最小值为 `21 g/100 g DM`。

## 修订流程

少量错别字可以在控制台临时修订，但长期以 SQLite 重建链路和导出脚本为准。修订源数据后重新导出 JSONL，再用 Upsert 同步到云数据库。
