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
- SR Legacy 中文名称 SQLite：`data/usda-localized-names/releases/sr-legacy-2018-04-zh-CN-v1.sqlite`
- 人饭菜谱 CSV：`/Users/cyr/Documents/Documents/Dogfood/capu_data_5w/caipu_1.csv`
- CFCT 第6版 OCR JSON：固定到 `Sanotsu/china-food-composition-data@76ea8a4724b59cea882cc2f59fef8b62e41a0a16` 的 `json_data_vision_251206_Qwen2-5-VL-72B-Instruct/`；来源清单为 `data/cfct/releases/2025-12-06-v1.json`

路径仅作为本地构建参数，不写死在脚本中。

CFCT OCR 上游仓库没有 SPDX 许可证，并声明 OCR 准确率不能保证、版权归原作者所有。项目所有者已确认固定版本可用于本项目 CloudBase 发布，因此来源清单记录为 `license_status=verified`；授权绑定上游提交、61个文件、1,657个唯一食品编码和 SHA-256。`data_quality` 仍为 `ocr_unverified`，允许发布不代表 OCR 已人工校正；16个无效 OCR 值继续隔离。实际冻结数量与上游 README 声明的1,677条相差20条，差异保留在来源清单中。

USDA 数据在主库中标记为 `public_domain`。人饭菜谱授权已经由项目所有者确认，版本化声明位于 `data/human-recipes/sources/capu-5w.json`；映射生成器校验实际 CSV SHA-256 后把来源标记为 `verified`。授权合同或原始凭证由项目所有者在代码库之外保管。

## 构建命令

```bash
python3 scripts/fooddata/build_ingredient_data_sqlite.py \
  --foundation-sqlite /Users/cyr/Documents/Codex/2026-07-07/ge/outputs/fooddata_foundation.sqlite \
  --sr-legacy-dir /Users/cyr/Documents/Documents/Dogfood/FoodData_Central_sr_legacy_food_csv_2018-04 \
  --sr-localized-names-sqlite data/usda-localized-names/releases/sr-legacy-2018-04-zh-CN-v1.sqlite \
  --recipes-csv /Users/cyr/Documents/Documents/Dogfood/capu_data_5w/caipu_1.csv \
  --out-sqlite fooddata-cloudbase-export/2026-07-21-ingredient-data/ingredient_data.sqlite \
  --release-id 2026-07-21-initial
```

输出目录已由 `.gitignore` 忽略。构建器拒绝覆盖已有 SQLite；需要重建时必须先明确处理旧产物，避免误删人工审核结果。

SR Legacy 中文名称由 Apple 系统翻译生成，版本化 SQLite 中的 `food_localized_name` 与 Foundation 同名表字段完全一致。构建器要求7,793个 `fdc_id` 与 SR Legacy `food.csv` 一一对应，然后按 SR 来源版本写入统一的 `source_localized_name`。机器译名置信度为0.65，只属于来源本地化层；“犹太人的耳朵”等直译不得直接作为标准食材名。

构建完成后，用版本化种子写入首批标准食材概念、别名和营养形态：

```bash
python3 scripts/fooddata/seed_ingredient_catalog.py \
  --sqlite fooddata-cloudbase-export/2026-07-22-v2-final/ingredient_data.sqlite \
  --seed data/ingredient-catalog/releases/2026-07-22-v2.json
```

CFCT 以独立来源叠加到已有 SQLite，不覆盖 Foundation 或 SR Legacy：

```bash
python3 scripts/fooddata/import_cfct_ocr_source.py \
  --base-sqlite fooddata-cloudbase-export/<base>/ingredient_data.sqlite \
  --cfct-json-dir /path/to/china-food-composition-data/json_data_vision_251206_Qwen2-5-VL-72B-Instruct \
  --manifest data/cfct/releases/2025-12-06-v1.json \
  --out-sqlite fooddata-cloudbase-export/<cfct_batch>/ingredient_data.sqlite
```

导入器保留 CFCT 原始食品编码、中文名、分类、可食部、备注、源文件和上游提交。数值与测定后修约的0写入通用营养表；`Tr`、`—`、`un`、空值、带星号计算值和 OCR 错位分别保存为 `trace / not_measured / unavailable / missing / calculated / invalid_ocr`，不能互相替代。当前导入1,657个食品和39,552个可计算营养值；16个 OCR 错位值被隔离，36个带星号计算值被显式标记。

只有显式 CFCT 食品编码决定可以进入标准目录：

```bash
python3 scripts/fooddata/integrate_cfct_ingredient_catalog.py \
  --sqlite fooddata-cloudbase-export/<cfct_batch>/ingredient_data.sqlite \
  --base-catalog data/ingredient-catalog/releases/<base>.json \
  --decisions data/ingredient-identity-lexicon/releases/<cfct_wave>.json \
  --catalog-version <catalog_version> \
  --out-catalog data/ingredient-catalog/releases/<catalog_version>.json \
  --report data/ingredient-catalog/releases/<catalog_version>-cfct-integration-report.json
```

CFCT Wave A/B 共新增31个概念：银耳、火龙果、草鱼、鲫鱼、带鱼、空心菜、茭白、百合、腐竹、豆腐皮、油豆腐、豆腐干、油菜、丝瓜、薏米、山楂、桂圆、虾米、干贝、香椿、荠菜、黄花菜、油麦菜、韭黄、猪皮、鳝鱼、芡实、猪大肠、豌豆苗、鸡毛菜和刀豆。目录版本 `2026-08-13-v13` 含288个概念和288个唯一来源。严格覆盖提及由92,724增至95,811，排除调味料和油的覆盖率为66.23%；进一步排除辅料后为70.40%。

基础食材候选 Wave C1 使用 `controlledIngredientIdentityDecisions/v1` 冻结受控同义词与菜谱裸词默认。目录别名由 `scripts/fooddata/integrate_controlled_ingredient_aliases.py` 写入新完整快照；`里脊肉/里脊 → 猪里脊`、`精肉/精瘦肉 → 猪肉` 只保存在完整裸词规则中，不作为可扩散的目录别名。v14 仍含288个概念和288个唯一来源，新增11个明确别名和4个裸词默认；阶段一新增覆盖802次，排除调味料、油和辅料后的覆盖率为70.99%。该版本仅为本地 staging。

Wave C2 扩展同一合同以支持显式来源新概念。合并器要求来源版本、食品 ID、描述和营养明细全部匹配，并拒绝复用已被其他概念占用的来源。最终修正版 `2026-08-13-wave-c2-v2` 为三黄鸡、土鸡、乌鸡、小青菜、上海青、柿子椒、菜椒、灯笼椒、红菜椒、瑶柱、肥肠、花菇、白玉菇、胡罗卜和甜豆补入既有概念别名；新增牛腩、草菇、黑鱼、千张、苋菜、武昌鱼、小黄鱼、金桔和牛腱9个唯一来源概念。v16 含297个概念和297个唯一来源；排除调味料、油和辅料后的覆盖率为71.76%。紫薯、鸭腿、龙利鱼、肥牛和梅花肉继续隔离，不使用相似食材代理。

CFCT 精确来源候选使用 `cfctExactIdentityPreparation/v1 → cfctExactIdentityControlledModel/v1 → cfctExactIdentityDecisionIntegration/v1` 完成闭环。v16 的135个词项先聚合为102个身份组：16组由单一自然食品来源门禁自动通过，86组交给本地27B模型执行正序、逆序双次判断，10组分歧触发第三次裁决。模型只能选择输入中的既有概念、CFCT食品编码或受控隔离状态；最终后置门禁纠正桂圆肉、红豆馅、鸭蛋黄、豆角、燕窝和阿胶6项越界或分类错误。v17 最终将11组并入既有概念、80组建立唯一来源新概念、11组进入状态换算或终态隔离；目录含377个概念和377个唯一来源。模型使用58,311个本地token，外部API成本为0。最新阶段一不再包含 `cfct_exact_candidate` 队列。

剩余未覆盖项使用 `scripts/fooddata/classify_recipe_ingredient_gaps.py` 生成互斥守恒分类。最新清单为 `data/ingredient-gap-classification/releases/2026-08-13-v13-v2.json`，人读版为 `docs/data/remaining-ingredient-gap-classification-v2.md`。分类器区分 CFCT/USDA 精确候选、基础身份、稳定或不稳定加工品、形态换算、上位词、组合词、菜谱噪声和低频待定；任何词项遗漏或重复归属都会失败。

从 `catalog_schema_version=2` 起，先从菜谱频次自动清洗原料写法、聚合别名并发现高置信标准概念。跨 USDA 分类、英文身份冲突和未匹配项自动隔离，不依赖人工逐条审核：

```bash
python3 scripts/fooddata/discover_standard_ingredient_concepts.py \
  --sqlite fooddata-cloudbase-export/<batch>/ingredient_data.sqlite \
  --base-seed data/ingredient-catalog/releases/<base_catalog_version>.json \
  --candidate-version <candidate_version> \
  --out-candidate-seed data/ingredient-catalog/releases/<catalog_version>-candidates.json \
  --report data/ingredient-catalog/releases/<catalog_version>-discovery-report.json
```

随后必须通过自动选择器把同一概念的营养来源候选收敛为唯一烹调基准。选择器优先生鲜、去骨、去皮、无调味且可直接烹调的记录，并保存全部候选评分和降级原因：

```bash
python3 scripts/fooddata/select_preferred_ingredient_sources.py \
  --sqlite fooddata-cloudbase-export/<batch>/ingredient_data.sqlite \
  --candidate-seed data/ingredient-catalog/releases/<candidate_version>.json \
  --catalog-version <catalog_version> \
  --out-seed data/ingredient-catalog/releases/<catalog_version>.json \
  --report data/ingredient-catalog/releases/<catalog_version>-selection-report.json
```

需要对 USDA 全量差集做守恒整理时，先运行全量目录准备器。它会把 Foundation 与
SR Legacy 的每条来源归入“既有目录来源、标准食材候选、重复来源、复合/非食材隔离、
缺少营养明细或身份冲突”之一；所有剩余来源必须被精确计数，不允许静默遗漏。基础
身份按物种、部位和受控子类型聚合，同一身份的生熟、骨皮和来源差异交给唯一来源
选择器处理。既有重复概念会合并到自动评分更优的保留概念，旧标准名转为别名，并
输出概念重定向供策略和菜谱审核决定复用。

```bash
python3 scripts/fooddata/prepare_complete_usda_catalog.py \
  --sqlite fooddata-cloudbase-export/<base>/ingredient_data.sqlite \
  --base-catalog data/ingredient-catalog/releases/<base_catalog_version>.json \
  --catalog-version <catalog_version> \
  --out-candidate data/ingredient-catalog/releases/<catalog_version>-candidates.json \
  --out-report data/ingredient-catalog/releases/<catalog_version>-usda-coverage-report.json \
  --out-safety-review data/canine-ingredient-policies/reviews/<catalog_version>-usda-review-queue.json
```

2026-08-16 的 `2026-08-16-v19` 批次审计8,262条 USDA 来源，原目录使用260条，
其余8,002条全部完成守恒归类；4,745条剩余基础食材来源进入1,610个身份簇，连同
既有候选共覆盖4,928个来源。最终目录含1,624个唯一概念/来源，其中831项从多个
同种来源中择优，3组既有重复概念被合并。复合食品、项目不支持的成品类别、1条无
营养明细来源以及36条没有可靠中文标准名的来源保留在隔离报告中，不伪装成基础
食材。新增1,250个概念及75个来源切换项进入安全审核队列；标准名最长24字，等级、
脂肪修剪等 USDA 技术描述残留为0。旧有证据规则迁移后，其余保持 `unknown`，不会
自动伪造安全结论。

2026-08-17 的最终 `2026-08-17-v21` 在 v19 基础上补充受控粉条身份：新增“粉条”
概念并唯一绑定 CFCT `22203`；普通粉条以及红薯、地瓜、甘薯、番薯、蕃薯、
山芋粉条/粉丝归入该概念，其余非组合粉丝写法归入 USDA `169884` 豆制粉丝。
“红薯粉条”不再作为生红薯别名，“红薯粉丝”不再使用豆制粉丝营养值。该规则
只处理单一原料写法，包含“或”、顿号、逗号等替代/组合表达仍走拆分或隔离门禁。
初始 v20 staging 导入暴露了旧导出器目录 `_id` 未包含 `catalog_version` 的隔离缺陷；
active v18 恢复后，v21 将目录版本加入文档 ID 与排行 `catalog_id`，导入器也改按
`catalog_version` 验收目录计数。v20 只保留为未激活审计版本，不得激活。

菜谱写法进入概念发现前使用 `recipeIngredientNormalization/v8` 确定性清洗。水和加工助剂优先分流；已发布目录的精确身份优先于宽泛调味料/油排除，未进入目录的调味料和油继续排除，避免已有可靠身份仍被旧正则吞掉。油类只允许完整词或受控别名匹配，避免“牛油”误伤“牛油果”。v3回填发酵辅料、腌制调味品和裸上位词，并为熟制原料保留 `mention_preparation_state` 与 `nutrition_status`；v4增加受控裸词省略；v5增加里脊肉、里脊、精肉和精瘦肉的菜谱领域默认，并修正桂圆方向；v6将九层塔按罗勒归入调味料，并为熟牛腩保留状态；v7消费 CFCT 模型终态，桂圆肉和柿饼进入 `conversion_required`，燕窝、香米、奶白菜、珍珠及配方不稳定加工品进入终态隔离；v8增加受控粉条/粉丝身份分流，且不覆盖组合与替代表达。模型不判断安全，也不能绕过来源和营养门禁直接写数据库。

阶段一可使用 `scripts/fooddata/run_recipe_ingredient_stage1.py` 独立执行。执行器从当前 SQLite 读取菜谱原料、已批准别名和中文来源名，生成不可覆盖的 `stage-1-decisions.json`、`stage-1-unresolved.json` 与 `stage-1-baseline-report.json`；报告固定记录模型调用数和外部 API token 成本为0，并为决定和未决产物记录 SHA-256，支持重复运行校验。目录换版时必须先把目标目录写入隔离 SQLite，再以该库运行阶段一；用旧库生成决定会使别名命中旧概念 ID，并在映射写入门禁中形成悬空引用。

阶段一未决项先由 `scripts/fooddata/route_recipe_ingredient_stage1_unresolved.py` 保存为来源精确、上位词歧义、辅料漏判、调味料漏判、状态换算、品牌复合食品和来源身份候选7个互斥队列。阶段二再由 `scripts/fooddata/cluster_source_food_identities.py` 解析全部英文来源档案的基础身份、物种、部位、加工状态、骨皮状态和附加处理，并从同一身份簇中选择唯一烹调基准来源。

阶段二不信任中文机器译名本身。只有受控中英身份约束、来源类别和英文身份簇同时一致时才生成决定；其他中文桥接只保存为 `bridge_only_unverified` 候选。缺少营养明细的来源仍进入身份簇，但不能进入营养来源决定。

```bash
python3 scripts/fooddata/route_recipe_ingredient_stage1_unresolved.py \
  --unresolved fooddata-cloudbase-export/<stage1>/stage-1-unresolved.json \
  --out-dir fooddata-cloudbase-export/<stage1-routing>

python3 scripts/fooddata/cluster_source_food_identities.py \
  --sqlite fooddata-cloudbase-export/<catalog>/ingredient_data.sqlite \
  --catalog data/ingredient-catalog/releases/<catalog_version>.json \
  --source-exact fooddata-cloudbase-export/<stage1-routing>/source_exact.json \
  --identity-candidates fooddata-cloudbase-export/<stage1-routing>/identity_candidate.json \
  --out-dir fooddata-cloudbase-export/<stage2>
```

阶段二唯一来源决定通过 `scripts/fooddata/integrate_stage2_source_decisions.py` 合并为新的完整目录。合并器只接受受控中文标准名；既有来源只能给原概念补别名，新来源必须生成稳定概念和形态ID。生成后执行目录结构校验，重复来源、跨概念别名冲突或一概念多来源都会整体失败。

```bash
python3 scripts/fooddata/integrate_stage2_source_decisions.py \
  --base-catalog data/ingredient-catalog/releases/<base_catalog>.json \
  --stage2-decisions fooddata-cloudbase-export/<stage2>/mapping-decisions.json \
  --catalog-version <catalog_version> \
  --out-catalog data/ingredient-catalog/releases/<catalog_version>.json \
  --report data/ingredient-catalog/releases/<catalog_version>-stage2-integration-report.json
```

阶段三只接收阶段二留下的2至5个受控候选。候选准备器先用身份门禁生成确定性唯一决定、模型批次和隔离项；本地模型对每组候选执行正序、倒序两次判断，只有两次结果完全一致且返回候选集合内的来源簇ID时才可合并。模型返回 `ambiguous`、两次分歧、缺项、越界ID或自由文本时统一隔离。

```bash
python3 scripts/fooddata/prepare_recipe_ingredient_stage3.py \
  --stage2-candidates fooddata-cloudbase-export/<stage2>/mapping-candidates.json \
  --source-clusters fooddata-cloudbase-export/<stage2>/source-identity-clusters.json \
  --out-dir fooddata-cloudbase-export/<stage3>

python3 scripts/fooddata/run_recipe_ingredient_stage3_lmstudio.py \
  --model-batches fooddata-cloudbase-export/<stage3>/model-batches.jsonl \
  --out-dir fooddata-cloudbase-export/<stage3>/model-results-local \
  --model <local_model_id>

python3 scripts/fooddata/integrate_recipe_ingredient_stage3.py \
  --sqlite fooddata-cloudbase-export/<stage2_catalog>/ingredient_data.sqlite \
  --base-catalog data/ingredient-catalog/releases/<base_catalog>.json \
  --stage3-candidates fooddata-cloudbase-export/<stage3>/mapping-candidates.json \
  --deterministic-decisions fooddata-cloudbase-export/<stage3>/deterministic-decisions.json \
  --model-consensus fooddata-cloudbase-export/<stage3>/model-results-local/consensus.json \
  --source-clusters fooddata-cloudbase-export/<stage2>/source-identity-clusters.json \
  --catalog-version <catalog_version> \
  --out-catalog data/ingredient-catalog/releases/<catalog_version>.json \
  --report data/ingredient-catalog/releases/<catalog_version>-stage3-integration-report.json
```

2026-08-12 的正式阶段三从30个身份组中确定性接收13组，模型处理4组且全部双次一致隔离，另有13组在模型前隔离。最终 `2026-08-12-v6` 新增11个概念并为2个既有概念补别名，共211个概念、728个别名和211个唯一来源；严格覆盖率由55.45%提升到56.27%。本地模型使用1,530 token，外部API成本为0。`2026-08-12-v5` 的水果和意面来源选择存在已修复问题，不能用于后续构建或发布。

阶段四用版本化中英身份词典分频次波次扩充目录。执行器要求词典完整覆盖阈值内的全部 `identity_candidate`：既有别名必须引用当前概念ID；新概念必须给出受控中文标准名、允许的来源分类和英文描述正则；其余项目必须保存隔离原因。任何遗漏、额外项、重复分配、来源占用或跨概念别名冲突都会整体失败。

```bash
python3 scripts/fooddata/integrate_recipe_ingredient_stage4.py \
  --sqlite fooddata-cloudbase-export/<base_catalog>/ingredient_data.sqlite \
  --base-catalog data/ingredient-catalog/releases/<base_catalog>.json \
  --identity-candidates fooddata-cloudbase-export/<stage1-routing>/identity_candidate.json \
  --lexicon data/ingredient-identity-lexicon/releases/<lexicon_version>.json \
  --catalog-version <catalog_version> \
  --minimum-occurrences 100 \
  --maximum-occurrences <optional_maximum> \
  --out-catalog data/ingredient-catalog/releases/<catalog_version>.json \
  --report data/ingredient-catalog/releases/<catalog_version>-stage4-integration-report.json
```

2026-08-12 的 Wave A 使用 `2026-08-12-wave-a-v1` 词典处理57项、9,525次提及：24项、3,761次通过，33项、5,764次隔离；新增15个概念并补充7个既有概念别名。最终 `2026-08-12-v7` 包含226个概念、754个别名和226个唯一来源，严格覆盖率由56.27%提升到58.96%。鸡爪因不存在生鲜档案而降级使用唯一水煮来源；该状态不得在运行时解释为生重营养。

2026-08-13 的 Wave B 使用 `2026-08-13-wave-b-v1` 词典和频次范围50至99，避免重复处理 Wave A 隔离项。58项、4,018次提及里，25项、1,799次通过，33项、2,219次隔离；新增9个概念并补充14个既有别名。最终 `2026-08-13-v8` 包含235个概念、780个别名和235个唯一来源。覆盖提及由86,828增至88,752；调味料分流修复使分母由147,265降至147,120，严格覆盖率由58.96%提升到60.33%。

对于 Wave C 及后续更长的波次，词典可以设置 `default_isolation_reason`。执行器仍校验所有明确分配均位于冻结波次中，并把未明确通过的项目逐项展开成隔离决定；默认隔离不等于丢弃，报告保留每个原料及频次。只有受控别名和英文来源门禁通过项可以写入目录。

2026-08-13 的 Wave C 使用 `2026-08-13-wave-c-v1` 处理频次20至49的264项、8,221次提及：38项、1,341次通过，226项、6,880次隔离；新增10个概念并补28个既有别名。`2026-08-13-v9` 包含245个概念、818个别名和245个唯一来源。覆盖提及由88,752增至90,193，调味料分流修复使分母由147,120降至146,339，严格覆盖率由60.33%提升到61.63%。

2026-08-13 的 Wave D 使用 `2026-08-13-wave-d-v1` 处理频次5至19的919项、8,268次提及：78项、810次通过，841项、7,458次隔离；新增11个概念并补61个既有别名。`2026-08-13-v10` 包含256个概念、896个批准别名和256个唯一来源。阶段一未决提及由47,862降至45,373，覆盖提及由90,193增至90,718；调味料规则修复使严格分母由146,339降至144,658，覆盖率由61.63%提升到62.71%。酸牛奶、鸭掌、咸鸭蛋黄、芥兰、翅根和部位不明的瘦肉写法因身份或形态不等价继续隔离。

Wave E1 基于 v4 重跑后的候选冻结频次不少于20次的257项、13,130次提及；只有 `茼蒿` 通过 `Chrysanthemum leaves, raw` 精确来源门禁，新增1个概念，256项继续隔离。`2026-08-13-v11` 共257个概念、257个唯一来源。覆盖提及由92,683增至92,724，严格覆盖率由64.07%提升到64.10%。这验证了高频长尾当前瓶颈主要是精确营养来源缺失，而非继续扩展中文别名。

Wave E2 对 v4 最新阶段一产物的 8 个 `source_exact` 写法及全部身份候选执行阶段二身份聚类，共 14,002 项、36,493 次提及，形成 1,350 个来源身份簇，但没有项目通过唯一身份、分类、营养明细和唯一来源四重门禁。阶段二接受 0 项；中文来源名命中不会自动转成标准概念，复合食品和加工态继续隔离。

本地模型结果必须经过 `recipeIngredientModelResultIntegration/v1` 门禁后才能生成目录候选。门禁要求模型基础名与清洗名保持足够字面一致，并且能够唯一落到既有目录概念或 Foundation / SR Legacy 中文来源；裸动物、上位词、模型近形误判和受控动物身份冲突继续隔离。模型结果不能绕过 `readyToCookNutritionSource/v1` 唯一来源选择器。

```bash
python3 scripts/fooddata/run_recipe_ingredient_lmstudio_batches.py \
  --model-batches fooddata-cloudbase-export/<normalization_batch>/model-batches.jsonl \
  --out-dir fooddata-cloudbase-export/<normalization_batch>/model-results-local \
  --chunk-size 50

python3 scripts/fooddata/integrate_recipe_ingredient_model_results.py \
  --sqlite fooddata-cloudbase-export/<source_batch>/ingredient_data.sqlite \
  --base-seed data/ingredient-catalog/releases/<base_catalog_version>.json \
  --model-batches fooddata-cloudbase-export/<normalization_batch>/model-batches.jsonl \
  --model-results-dir fooddata-cloudbase-export/<normalization_batch>/model-results-local \
  --candidate-version <candidate_version> \
  --out-candidate-seed data/ingredient-catalog/releases/<catalog_version>-candidates.json \
  --report data/ingredient-catalog/releases/<catalog_version>-integration-report.json
```

LM Studio 执行器按分片即时落盘并复用已存在分片，中断后可原命令续跑。本地模型不产生外部 API token 费用；`manifest.json` 只在全部批次一一完成后生成，合并器缺少 manifest 时拒绝继续。

全量候选完成唯一来源选择并写入新 SQLite 后，覆盖率统一用版本化脚本复算。分母只排除调味料和油；水、加工助剂、歧义词及其他尚未映射项仍计入分母，避免通过扩大排除范围虚增覆盖率。

```bash
python3 scripts/fooddata/report_recipe_ingredient_coverage.py \
  --sqlite fooddata-cloudbase-export/<catalog_version>/ingredient_data.sqlite \
  --report fooddata-cloudbase-export/<catalog_version>/recipe-ingredient-coverage.json
```

真实50,000条菜谱运行结果：33,930种写法中，12,300种调味料/油写法被零 token 排除，663种由目录别名确定性匹配，23种命中来源名称，74种属于烹饪辅料，31种替代和36种组合被结构化拆分，4,265种歧义项隔离。剩余16,538种模型候选聚合为15,675个身份组；只发送聚合频次至少5次的1,851组，共38批、覆盖84,159次原料提及，预计约307,560 token。13,824个长尾身份组继续延后，不产生 token 消耗。

2026-08-11 的本地正式执行把5个大批在运行时拆成38个可续跑分片，1,851组全部一一返回，外部 API token 成本为0。模型给出1,057个 `resolved` 提议；经过当前调味料/油与辅料规则、字面一致、动物/品类身份和来源档案门禁后，134组并入既有概念，自动新增60个概念，1,559组继续隔离。目录由131个概念扩展至191个概念、694个别名和191个唯一营养来源。

按相同严格分母（只排除调味料和油）比较，v2覆盖35,911 / 149,278次提及，即24.06%；v3覆盖68,508 / 149,278次提及，即45.89%，提升21.84个百分点。水、加工助剂、来源中文名但未形成标准概念的项目和其余未映射项均保留在分母中。

v3之后剩余原料的真实缺口口径、来源基础身份聚类、受控候选模型、熟制状态换算，以及13,824个低频长尾身份组的L0至L3分层、频次波次和停止条件，见 [`docs/data/recipe-ingredient-gap-mapping-plan.md`](data/recipe-ingredient-gap-mapping-plan.md)。

种子脚本会校验每个 `source_version + fdc_id` 的原始英文描述和营养记录，任何一条不匹配都会整体回滚。

随后写入与目录版本兼容的完整犬食安全策略快照：

```bash
python3 scripts/fooddata/seed_canine_ingredient_policies.py \
  --sqlite fooddata-cloudbase-export/2026-07-22-policy-v1/ingredient_data.sqlite \
  --seed data/canine-ingredient-policies/releases/2026-07-22-v1.json
```

未显式给出非 `unknown` 结论的概念会生成审核过的保守默认，不会因为缺行而变成允许。

当前 `2026-08-15-v3` 策略在 v2 基础上使用公开兽医毒理证据，把可可粉、红葱头、韭菜、韭黄、韭薹、柠檬皮和白果7个原 `unknown` 概念提升为 `blocked`。完整快照仍为398条：32 allowed、24 conditional、331 unknown、11 blocked。其余需熟制、去核、去皮、标签校验或剂量限制的项目不做 whole-concept 强封禁，继续 fail-closed。

最后按兼容目录和策略生成营养素排行：

```bash
python3 scripts/fooddata/seed_nutrient_rankings.py \
  --sqlite fooddata-cloudbase-export/2026-07-22-ranking-v1-final/ingredient_data.sqlite \
  --rules data/nutrient-rankings/releases/2026-07-22-v1.json
```

新排行按 `ingredientOperationRules/v1` 仅包含 `allowed`；`conditional`、`unknown` 和 `blocked` 均不进入排行。缺少完整组成值的组合营养素不会把缺失值当零。

随后生成完整原料写法映射快照：

```bash
python3 scripts/fooddata/seed_recipe_ingredient_mappings.py \
  --sqlite fooddata-cloudbase-export/2026-07-23-human-recipes-v1/ingredient_data.sqlite \
  --mapping data/human-recipes/mappings/2026-07-23-v1.json
```

当前 `2026-08-15-v3` 映射以阶段一 v13 的同一 SHA-256 快照为输入，只迁移兼容策略版本，不改变33,930条决定和5,043个组件。`isolated/excluded/auxiliary` 写为无组件 `unmatched`，详细终态保存在审计备注，不制造目录身份或安全结论。

## 导出 CloudBase 只读投影

```bash
python3 scripts/fooddata/export_ingredient_cloudbase.py \
  --sqlite fooddata-cloudbase-export/2026-07-21-ingredient-data/ingredient_data.sqlite \
  --out-dir fooddata-cloudbase-export/2026-07-22-ingredient-catalog-v1/cloudbase-jsonl
```

不提供回滚参数时，导出物仅用于离线检查，发布记录会标记 `requires-active-pointer`，导入 preflight 会拒绝它。生成可导入包前必须先只读核验目标环境，再完整提供 `--rollback-release-id`、`--rollback-profile-release-id`、`--rollback-catalog-version`、`--rollback-policy-version`、`--rollback-ranking-version`、`--rollback-recipe-version` 和 `--rollback-mapping-version`；七个字段不允许部分提供，也不能从新版本号推断。

当前生成：

- `data_releases.jsonl`：1 条 staging 版本文档，不会自动切换活动版本。
- `food_nutrition_profiles.jsonl`：当前候选9,919条一食物一文档的营养快照。
- `ingredient_catalog.jsonl`：当前候选377条，一标准食材一个唯一营养来源。
- `canine_ingredient_policies.jsonl`：当前候选398条概念或形态级完整策略快照。
- `nutrient_rankings.jsonl`：44 条一营养素一文档的安全过滤排行，共180个排行项。
- `human_recipes.jsonl`：当前候选7,197条；v2 只发布至少一个 `allowed` 组件的菜谱，历史文件不就地改写。
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
| 当前线上活动形态/目录项（历史多形态版本） | 107 |
| 下一版单来源目录项 | 97 |
| 自动发现后的本地 v2 标准概念/目录项 | 131 |
| 本地 v2 标准名称之外的别名 | 256 |
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
| `source_localized_name` | Foundation 中文名称及 SR Legacy 系统机器译名；按来源版本隔离 |
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
| `ingredient_variant` | 标准食材与唯一烹调基准营养来源的技术绑定；历史版本兼容多形态 |
| `canine_ingredient_policy` | 概念或形态级犬食安全策略 |
| `nutrient_ranking` | 营养素排行版本、兼容版本、公式和覆盖统计 |
| `nutrient_ranking_item` | 经过安全过滤的食材名次、数值和计算组成 |
| `recipe_mapping_release` | 映射版本、兼容目录/策略、来源和授权状态 |
| `ingredient_mapping_decision` | 原料写法的审核结论 |
| `ingredient_mapping_component` | 复合原料拆出的一个或多个概念 |
| `review_task` | 歧义、复合、安全关键等人工审核队列 |

首批基线保存在 `data/ingredient-catalog/initial-v1.json`；当前完整快照是 `data/ingredient-catalog/releases/2026-07-22-v2.json`，包含 97 个概念、164 个审核别名和 107 个形态，其中 66 个形态引用 Foundation，41 个形态引用 SR Legacy。新增范围包括常用肉类与上位食材、内脏、鱼类、奶制品、主食、豆类、蔬果，以及洋葱、大蒜、葡萄和葡萄干四个安全拦截概念。当前 `canine_ingredient_policy` 由版本化策略种子生成，未知项仍显式保存为 `unknown`，不自动推断允许。所有审核数据必须来自可版本控制的种子文件，不能只在 SQLite 或云控制台中手工维护。

下一版单来源快照是 `data/ingredient-catalog/releases/2026-08-11-v1.json`：97个概念、164个别名、97个唯一烹调基准营养来源。它由 `readyToCookNutritionSource/v1` 从上一版候选自动生成；10个原多候选概念均收敛为一个来源，完整选择记录位于同目录的 `2026-08-11-v1-selection-report.json`。该快照尚未生成兼容策略和云端发布，不代表线上活动版本已经切换。

自动发现后的本地快照是 `data/ingredient-catalog/releases/2026-08-11-v2.json`：以 v1 为基础，从33,930种菜谱写法中自动发现34个新概念，最终包含131个概念、256个标准名称之外的别名和131个唯一来源。已匹配既有概念的写法覆盖41,796次原料提及，新概念覆盖6,528次；唯一来源冲突项“意大利细面”被隔离。候选、发现报告和选择报告与最终快照保存在同一目录。该版本仍是本地产物，尚未生成兼容安全策略、菜谱映射或 CloudBase staging 包。

后续填充、修正或下线目录项必须遵循 [`ingredient_catalog` 持续填充 SOP](data/ingredient-catalog-sop.md)。每一批使用新的完整目录快照和新建的离线 SQLite；不能把下一批种子直接叠加到上一批 SQLite，也不能绕过 staging 在云端手工补记录。

每次 `ingredient_catalog` 导入 staging 后，必须按照 [`canine_ingredient_policies` 持续整理与发布 SOP](data/canine-ingredient-policies-sop.md) 重新执行策略覆盖对账、受影响项审核和目录反向投影。无变化策略可以版本化延续；新增或受影响项在审核完成前保持 `unknown`，不得制造安全结论。

每次目录、策略、USDA 来源或营养公式变化后，必须按照 [`nutrient_rankings` 生成与发布 SOP](data/nutrient-rankings-sop.md) 重新生成完整排行。空排行必须显式保留，不能回退到未经审核食材。

人饭菜谱的来源授权、映射、审核、运行时筛选和发布必须遵循 [`human_recipes` 映射与发布 SOP](data/human-recipes-sop.md)。后续批次复用未变化决定，只审核新增或受影响的原料写法。

上位词或省略词的版本化审核决定通过 `run_recipe_ingredient_stage1.py --review-decisions` 消费。决定只允许映射既有标准概念或进入受控终态，不能新增营养来源。2026-08-14最终版本将3,901个身份组全部终态化，其中1,441组映射既有概念；重跑后 `generic_ambiguous` 队列为0。覆盖率脚本使用同一决定文件，并按项目口径排除调味料、油和烹饪辅料。

`--review-decisions` 支持按顺序传入多个版本化决定文件。普通重复键必须得出相同决定；只有最终代码门禁文件显式声明 `supersedes: true` 时才能覆盖前序subagent决定。2026-08-14阶段一v13已将33,930种菜谱写法全部终态化，未决队列为0；这表示每项都有映射、排除或隔离结论，不表示所有原料都有营养值。营养覆盖率仍只计算 `matched`、`alternative` 和 `composite`，隔离项不得回退到相似食材来源。

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

脚本只允许写入 `data_releases`、`food_nutrition_profiles`、`ingredient_catalog`、`canine_ingredient_policies`、`nutrient_rankings` 与 `human_recipes`，导入前校验 manifest 行数和 SHA-256，按稳定 `_id` 幂等 Upsert；各投影按 `release_id`、`policy_version`、`ranking_version` 或 `recipe_version` 核对本版本数量，不与历史版本总数混淆。v2 人饭投影从输入 `mapping_version` 派生独立的运行时 `recipe_version`、`release_id` 和文档 ID，`data_releases` 同时保留旧 active 回滚候选，禁止与历史 v1 键空间重叠。脚本不会激活 `staging` 发布。

目录文档 `_id` 必须同时包含营养底库版本、`catalog_version` 和 `variant_id`；仅使用
营养底库版本与形态 ID 会让新 staging 覆盖旧 active。网络超时可能出现“服务端已
提交、客户端未收到响应”，导入器只对网络错误有限重试，并允许在同一包、同一批次
大小且线上版本计数精确命中批次边界时用 `--start-batch` 续传。

CloudBase staging 的历史 v1 包含107条目录项、119条安全策略、44条营养素排行和6,082条人饭菜谱。目录结果为 `allowed=11`、`conditional=25`、`blocked=4`、`unknown=67`；这些历史投影按旧规则生成并保持不变。新 v2 投影使用 `allowed|conditional|unknown` 可操作、`blocked` 拒绝的统一规则，只写 staging，不自动切换 active。

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
5. 优先审核高频未匹配原料写法，并将调味料、复合食品和安全关键项分流。
6. 通过不可变版本组合和活动版本指针完成 CloudBase 发布与回滚。
