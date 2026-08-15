# USDA 中文名称生成物

`releases/sr-legacy-2018-04-zh-CN-v1.sqlite` 保存 SR Legacy 2018-04 的简体中文来源译名。其 `food_localized_name` 表与 Foundation SQLite 的同名表使用完全相同的字段合同：

```text
id / fdc_id / locale / name / name_type / confidence / created_at / updated_at
```

当前版本由 macOS Apple Translation framework 的 `high_fidelity` 策略生成，一条 SR Legacy food 对应一条 `zh-CN` 记录，`confidence=0.65`。`translation_build` 表额外保存来源校验值、翻译引擎、策略、操作系统和生成日期；这些元数据不进入 Foundation 兼容业务表。

机器译名只属于来源本地化层，不等于产品标准食材名。直译错误和不自然术语必须由后续食品术语归一化与概念聚类处理，不能直接展示或发布。

重新生成：

```bash
python3 scripts/fooddata/generate_sr_legacy_localized_names.py \
  --sr-food-csv <SR Legacy food.csv> \
  --out-sqlite data/usda-localized-names/releases/<version>.sqlite \
  --generated-at <YYYY-MM-DD>
```

脚本拒绝覆盖已有版本；中断时保留 `.translations.jsonl.partial` 缓存，再次运行相同命令即可续跑。完整生成后缓存自动删除。
