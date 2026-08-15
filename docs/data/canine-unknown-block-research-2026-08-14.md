# 犬食策略 unknown → blocked 证据复核（2026-08-14 快照）

## 1. 结论

针对 `policy_version=2026-08-14-v2` 与 `catalog_version=2026-08-14-v18` 的 338 个 `unknown` 标准食材概念，本次只回答“哪些食材必须禁止作为狗饭配方原料”，不尝试把其余食材升级为 `allowed`。

结论是建议将下列 **7 个标准食材概念**升级为 concept-level `blocked`：

1. 可可粉；
2. 红葱头；
3. 韭菜；
4. 韭黄；
5. 韭薹；
6. 柠檬皮；
7. 白果。

其中前 6 个是预先初筛项，白果是审计 338 个 `unknown` 全表时发现的遗漏。这里的 `blocked` 表示“不允许作为狗饭配方食材进入搜索、添加、自动带入、排行或保存链路”，不等同于声称任意微量意外接触都必然造成临床中毒。

除这 7 个以外，本次没有在剩余 331 个概念中找到足以支持 whole-concept `blocked` 的高可信证据。这个结论**不代表其余 331 个可以放行**；它们仍应保持 fail-closed，后续分别研究 `conditional` 或 `allowed`。

### 1.1 菜谱影响范围

按当前 SQLite 正式映射组件统计，这 7 个概念共关联 51 种规范化原料写法、1,158 次菜谱原料提及：

| 标准概念 | 规范化写法 | 原料提及 |
| --- | ---: | ---: |
| 可可粉 | 21 | 543 |
| 韭菜 | 13 | 428 |
| 红葱头 | 3 | 65 |
| 韭黄 | 1 | 44 |
| 白果 | 3 | 44 |
| 柠檬皮 | 7 | 25 |
| 韭薹 | 3 | 9 |

这些提及在当前 `unknown` + fail-closed 规则下已经不可操作；升级为 `blocked` 的新增价值是形成明确危害结论、阻断原因、回归门禁和面向用户的稳定警示，不是从“当前可添加”改为“不可添加”。

## 2. 判定边界

本次采用以下边界区分 `blocked` 与 `conditional`：

- `blocked`：风险来自食材身份或当前概念所指部位本身；没有权威证据支持、且系统能够服务端验证的去毒处理或安全使用条件，因此不应作为配方原料使用。
- `conditional`：存在权威资料支持的安全食用部位、熟制、去核、去籽、去皮、无调味或产品标签条件，并且未来有可能把这些条件结构化并在服务端验证。
- “毒性与剂量有关”本身不足以降级为 `conditional`。多数毒物都存在剂量效应；只有存在可验证的安全用法，才适合进入条件策略。
- 形态是营养档案形态，不自动等于喂食形态；但是 concept-level `blocked` 必须覆盖该概念未来可能出现的生、熟、干制或粉末形态。

## 3. 建议升级为 blocked 的概念

### 3.1 可可粉

- `concept_id`：`ingredient_stage2_edb8f30ddf374568`
- 标准名：可可粉
- 当前形态：`可可粉（干制）`
- 当前来源身份：`Cocoa, dry powder, unsweetened`
- 建议状态：`blocked`
- 建议危害类型：`methylxanthine_toxicity`
- 置信度：高

理由：Merck Veterinary Manual 指出巧克力毒性的主要成分是可可碱和咖啡因；犬摄入约 `20 mg/kg` 甲基黄嘌呤即可出现轻度临床表现，`40–50 mg/kg` 可出现心脏毒性，约 `60 mg/kg` 可出现癫痫。ASPCA 和 UC Davis 均明确指出可可粉属于甲基黄嘌呤浓度最高的可可制品之一。

为何不是 `conditional`：风险成分是可可粉固有成分，没有烹调步骤可可靠去除。实际浓度还受可可豆与产品批次影响，当前系统无法通过犬体重、累计摄入量和实物浓度建立可验证的安全阈值。它不应被当作狗饭配方原料。

证据：

- [Merck Veterinary Manual：Chocolate Toxicosis in Animals](https://www.merckvetmanual.com/toxicology/food-hazards/chocolate-toxicosis-in-animals)
- [ASPCA：People Foods to Avoid Feeding Your Pets](https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets)
- [UC Davis：Chocolate Poisoning in Dogs](https://healthtopics.vetmed.ucdavis.edu/health-topics/chocolate-poisoning-dogs)

### 3.2 红葱头

- `concept_id`：`ingredient_stage4_0281ad73aedd22c8`
- 标准名：红葱头
- 当前形态：`红葱头（生）`
- 当前来源身份：`Shallots, bulb, peeled, root removed, raw`
- 建议状态：`blocked`
- 建议危害类型：`allium_toxicity`
- 置信度：高

理由：目录英文身份精确指向 shallot。Merck 的 Allium 中毒资料和同行评议综述均把 shallot 纳入可使犬红细胞发生氧化损伤、形成 Heinz 小体并导致溶血性贫血的 Allium 食材。

为何不是 `conditional`：Allium 风险不是“仅生食”风险。Merck 明确记录生、熟、脱水和颗粒/粉末形态均可致毒；烹饪、干燥或加工不能作为可靠去毒条件，因此整个红葱头概念都应禁止进入配方。

证据：

- [Merck Veterinary Manual：Garlic and Onion (Allium spp) Toxicosis in Animals](https://www.merckvetmanual.com/toxicology/food-hazards/garlic-and-onion-allium-spp-toxicosis-in-animals)
- [Cornell Consultant：Allium poisoning（条目包含 shallots/scallions）](https://consultant.vet.cornell.edu/?Fun=Cause_2145&dxkw=&signs=1-R301-GE91-DE0&spc=All&sxkw=vomiting)
- [Cope 2005：Allium species poisoning in dogs and cats](https://www.aspcapro.org/sites/default/files/c-vetm0805_562-566.pdf)

### 3.3 韭菜

- `concept_id`：`ingredient_auto_model_42a2a51c9c828059`
- 标准名：韭菜
- 当前形态：`韭菜（生）`
- 当前来源身份：`Chives, raw`
- 建议状态：`blocked`
- 建议危害类型：`allium_toxicity`
- 置信度：高

理由：当前营养来源英文身份是 chives，Merck 明确把 chives 列入 Allium 中毒范围。即使按中文常用身份将“韭菜”解释为 `Allium tuberosum`，也有同行评议犬病例记录犬摄入含 Chinese chive 与大蒜的食物后发生严重 Heinz 小体溶血性贫血、偏心红细胞增多及高铁血红蛋白血症。两种身份路径都指向同一阻断结论。

为何不是 `conditional`：Allium 的含硫氧化物风险不能通过普通熟制可靠消除，且重复小剂量摄入也可能造成累计损伤。没有可由系统验证的安全烹调或剂量条件。

证据：

- [Merck Veterinary Manual：Garlic and Onion (Allium spp) Toxicosis in Animals](https://www.merckvetmanual.com/toxicology/food-hazards/garlic-and-onion-allium-spp-toxicosis-in-animals)
- [Yamato et al. 2005：犬摄入 Chinese chive 与 garlic 后的严重溶血病例](https://pubmed.ncbi.nlm.nih.gov/15634869/)
- [USDA GRIN：Allium tuberosum（Chinese chive）分类身份](https://npgsweb.ars-grin.gov/gringlobal/taxonomydetail.aspx?id=2409)

数据质量备注：`canonical_name_zh=韭菜` 与 `description_contains=Chives, raw` 之间存在物种粒度不清的问题，应另开目录身份修正任务；它不影响本轮安全阻断。

### 3.4 韭黄

- `concept_id`：`ingredient_cfct_13f6c1e7623a0b06`
- 标准名：韭黄
- 当前形态：`韭黄（CFCT OCR：raw）`
- 当前来源身份：`韭黄（韭芽，黄色）`
- 建议状态：`blocked`
- 建议危害类型：`allium_toxicity`
- 置信度：高

理由：农业资料和同行评议园艺研究均表明，韭黄是 `Allium tuberosum` 经遮光软化栽培形成的黄化叶，并非另一种植物。遮光改变颜色和质地，不是毒理学去毒处理。`Allium tuberosum` 已有犬溶血性贫血病例证据。

为何不是 `conditional`：没有证据显示黄化栽培消除了 Allium 含硫氧化物，也没有经验证的犬用安全阈值；把同一物种的黄化叶视为安全形态没有依据。

证据：

- [台湾农业部食农教育平台：韭菜、韭黄与韭菜花为同一作物的不同食用产品](https://fae.moa.gov.tw/map/food_item.php?id=149&type=AS01)
- [ISHS Acta Horticulturae：Allium tuberosum 的绿叶、黄化叶和未成熟花芽](https://ishs.org/ishs-article/969_17/)
- [Yamato et al. 2005：犬摄入 Chinese chive 与 garlic 后的严重溶血病例](https://pubmed.ncbi.nlm.nih.gov/15634869/)
- [Frontiers in Veterinary Science：Household Food Items Toxic to Dogs and Cats](https://doi.org/10.3389/fvets.2016.00026)

### 3.5 韭薹

- `concept_id`：`ingredient_controlled_c5b69a0214b24818`
- 标准名：韭薹
- 当前形态：`韭薹（unspecified）`
- 当前来源身份：`韭薹`
- 建议状态：`blocked`
- 建议危害类型：`allium_toxicity`
- 置信度：高

理由：韭薹是 `Allium tuberosum` 的花薹/未成熟花芽食用部分。同行评议园艺资料明确把绿叶、黄化叶和未成熟花芽列为同一物种的三种产品；Allium 毒理资料覆盖植物材料及其衍生产品。

为何不是 `conditional`：改变食用部位不构成已验证的去毒处理。没有证据支持韭薹存在可验证的犬用安全烹调或剂量条件。

证据：

- [ISHS Acta Horticulturae：Allium tuberosum 的绿叶、黄化叶和未成熟花芽](https://ishs.org/ishs-article/969_17/)
- [USDA GRIN：Allium tuberosum 分类及叶、花食用部位](https://npgsweb.ars-grin.gov/gringlobal/taxonomydetail.aspx?id=2409)
- [Yamato et al. 2005：犬摄入 Chinese chive 与 garlic 后的严重溶血病例](https://pubmed.ncbi.nlm.nih.gov/15634869/)
- [Cope 2005：Allium species poisoning in dogs and cats](https://www.aspcapro.org/sites/default/files/c-vetm0805_562-566.pdf)

### 3.6 柠檬皮

- `concept_id`：`ingredient_auto_model_888df20a1476558b`
- 标准名：柠檬皮
- 当前形态：`柠檬皮（生）`
- 当前来源身份：`Lemon peel, raw`
- 建议状态：`blocked`
- 建议危害类型：`citrus_peel_toxicity`
- 置信度：中高

理由：ASPCA 柠檬专页将柠檬列为对犬有毒，毒性成分为精油和补骨脂素，并明确区分“果肉可食”与“果皮和植物材料可造成问题”。ASPCA 食物风险页也指出柑橘果皮含柠檬酸和精油，显著摄入可导致刺激，甚至中枢抑制。

为何不是 `conditional`：本概念不是普通柠檬果肉，而是风险物质集中的果皮本身。当前系统不能验证实际精油/补骨脂素浓度、累计剂量或标准化脱除工艺，因此不应把普通刨屑、清洗或烹调当作安全条件。若未来确需支持经标准化处理的微量 zest，应建立独立 variant 并重新取证，不能放宽当前概念。

证据：

- [ASPCA：Lemon](https://www.aspca.org/pet-care/animal-poison-control/toxic-and-non-toxic-plants/lemon)
- [ASPCA：People Foods to Avoid Feeding Your Pets](https://www.aspca.org/pet-care/animal-poison-control/people-foods-avoid-feeding-your-pets)

边界说明：此结论只封禁“柠檬皮”概念，不支持把 `ingredient_stage2_f464d7d71c06e47a` 柠檬果肉概念一起 whole-concept 阻断。

### 3.7 白果

- `concept_id`：`ingredient_stage4_d616c8bcd232bcf6`
- 标准名：白果
- 当前形态：`白果（生）`
- 当前来源身份：`Nuts, ginkgo nuts, raw`
- 建议状态：`blocked`
- 建议危害类型：`ginkgotoxin_toxicity`
- 置信度：高

理由：ASPCA 明确指出银杏雌株种子含 ginkgotoxin，对宠物有毒，可能导致呕吐、易激惹和癫痫。Merck Veterinary Manual 记录动物大量摄入银杏可出现胃肠症状、兴奋和癫痫。2023 年同行评议犬病例记录犬误食多枚银杏种子后出现呕吐、四肢震颤、流涎、瞳孔散大、嗜睡和无法站立，给予维生素 B6 及支持治疗后恢复。香港食物安全中心指出银杏种子的 4'-methoxypyridoxine 相对耐热，烹调只能降低、不能完全消除毒性。

为何不是 `conditional`：当前概念就是银杏种子，不是药用标准化银杏叶提取物。现有资料没有建立犬用安全摄入量，且烹调不能完全消除主要毒素；产品也无法验证每批毒素浓度和犬的敏感性。因此不能用“煮熟”或“少量”作为自动放行条件。未来若有经兽药规范使用的标准化银杏叶制剂，应建立完全独立的非食材概念，不能复用白果策略。

证据：

- [ASPCA：Fall Plants: Hazardous or Harmless?](https://www.aspca.org/news/fall-plants-hazardous-or-harmless)
- [Merck Veterinary Manual：Toxicoses in Animals From Human Dietary and Herbal Supplements](https://www.merckvetmanual.com/toxicology/toxicoses-from-human-vitamins-minerals-and-dietary-supplements/toxicoses-in-animals-from-human-dietary-and-herbal-supplements)
- [Tou et al. 2023：Case of Suspected Ginkgo Seed Poisoning in a Dog](https://doi.org/10.12935/jvma.76.e304)
- [香港食物安全中心：Ginkgo Seed Poisoning](https://www.cfs.gov.hk/english/multimedia/multimedia_pub/multimedia_pub_fsf_204_02.html)

## 4. 全表遗漏审查

### 4.1 审查方法

本地审查先从目录 377 个概念中扣除策略文件已有的 39 个显式概念策略，得到 338 个 `unknown`。随后对每个概念的以下字段进行联合检查：

- `concept_id`；
- `canonical_name_zh`；
- `aliases`；
- `category_code`；
- 全部 variant 的 `display_name_zh`、`preparation_state` 与 `description_contains`。

风险族扫描覆盖：

- Allium：onion、garlic、shallot、scallion、chive、leek、葱、蒜、韭；
- 甲基黄嘌呤：cocoa、cacao、chocolate、coffee、caffeine；
- 葡萄/葡萄干；
- 木糖醇；
- 澳洲坚果；
- 柑橘果皮/精油；
- 银杏种子；
- 含氰苷原料与核果种子；
- 需要熟制的豆类、木薯、肉、鱼、蛋；
- 成分依赖型加工食品。

扫描结果：

- 洋葱、大蒜、葡萄、葡萄干已在当前策略中明确 `blocked`，不属于 338 个 `unknown`。
- 未发现木糖醇、澳洲坚果、咖啡或巧克力独立标准概念。
- 在 `unknown` 中发现可可粉、红葱头、三种韭菜产品、柠檬皮和白果，共 7 个需要 concept-level `blocked` 的概念。
- 未发现其他同等级 whole-concept 阻断遗漏。

### 4.2 不能误判为 whole-concept blocked 的重点项目

以下项目仍然有安全门禁缺口，但证据更适合后续 `conditional` 或 variant-level 处理：

| 概念 | 当前形态 | 不做 whole-concept blocked 的原因 | 后续方向 |
| --- | --- | --- | --- |
| 木薯 `ingredient_stage3_9a3ade59883f876` | 生 | 木薯是含氰苷原料，但规范加工可显著降低氰化物；风险集中在生食和处理不足 | 生 variant 禁用或条件化；仅为有可靠加工状态的新 variant 建策略 |
| 樱桃 `ingredient_stage3_83afd7b114008a17`、杏 `ingredient_controlled_27bddee8cda79cc0`、李子 `ingredient_controlled_29913aea852fb1ad` | 生/未注明 | 果肉与核、籽的风险不同，不能因核含氰苷封禁整个果肉概念 | 强制去核、去梗，必要时拆分果肉 variant |
| 牛油果 `ingredient_stage4_09f00a522e023e1d` | 去皮果肉、生 | UC Davis 明确指出犬可食用果肉，需避开果核；高脂和个体耐受仍需控制 | 去核、限量、个体风险条件 |
| 柠檬 `ingredient_stage2_f464d7d71c06e47a`、橙子、西柚、橘子、金桔 | 果肉或全果粒度不一 | ASPCA 区分通常可食果肉与富含精油的果皮/植物材料 | 先明确是否去皮去籽，再做 variant 策略 |
| 土豆 `ingredient_potato` | 生、去皮 | 正常薯块经熟制可食，发绿或发芽部分风险不同 | 熟制且拒绝发绿/发芽原料 |
| 生肉、生鱼、生蛋、干豆、生豆、蕨菜 | 生/干制 | 风险主要来自病原体、抗营养因子或加工状态；存在通过熟制或规范处理降低风险的路径 | variant-level 熟制条件，不升级整个物种概念为 blocked |
| 花生酱、沙拉酱、芥末酱、香肠、火腿等加工食品 | 配方未注明 | 风险取决于是否含木糖醇、Allium、过量盐、香辛料或其他添加物，不是基础身份必然有毒 | 标签成分校验；在不能校验前保持不可操作 |

木薯及核果的含氰苷风险参考：[Merck Veterinary Manual：Cyanide Poisoning in Animals](https://www.merckvetmanual.com/toxicology/cyanide-poisoning/cyanide-poisoning-in-animals)。牛油果边界参考：[UC Davis：From Snacks to Scraps](https://synergy.vetmed.ucdavis.edu/news-article-fall-2023/snacks-scraps)。

## 5. 后续自动化建议（本报告不实施）

在策略生成器前增加“身份级毒物门禁”，用于未来目录增量自动发现，而不是依赖每轮人工目检：

1. 维护带证据版本的 toxic identity registry，至少覆盖 Allium、可可/巧克力/咖啡因、葡萄/葡萄干、木糖醇、澳洲坚果、柑橘果皮/精油和银杏种子。
2. 规则必须同时检查标准中文名、别名、英文来源描述和上游分类，不能只做中文关键词匹配。
3. Allium 与可可类命中后默认生成 concept-level `blocked` 候选；柑橘只对 peel/oil/plant material 命中，不能扩大到果肉。
4. 加工食品只生成 `unknown/conditional` 复核项，不因“可能含洋葱或木糖醇”直接封禁整个食品身份。
5. 每次目录发布执行回归检查：已知毒物族不得以 `unknown`、`conditional` 或 `allowed` 进入导出包。
6. 规则命中仍需把证据 ID、危害类型和命中字段写入机器可审计记录，避免不可解释的关键词封禁。

## 6. 证据局限

- 本次是公开资料的自动化证据复核，不是兽医专业终审，策略发布记录不得标注为兽医审核。
- ASPCA 柠檬资料足以支持“当前柠檬皮概念不可作为配方食材”，但证据强度低于 Allium、可可粉和白果；未来若引入标准化脱油/定量 zest 形态应重新评估。
- 韭菜当前中文概念与英文营养来源存在身份粒度问题，需要单独修复目录数据，但两个可能身份都属于 Allium，故不影响阻断结论。
- `blocked` 是产品操作策略，不代替误食后的临床判断；发生疑似误食时应联系兽医或动物毒物控制机构。

## 7. 复核日期

- 目标快照日期：2026-08-14
- 资料复核日期：2026-08-15
- 建议下次复核：策略版本升级前，或任何上述概念身份/形态发生变化时
