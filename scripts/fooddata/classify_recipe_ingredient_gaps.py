#!/usr/bin/env python3
"""把阶段一剩余未覆盖原料分成互斥、守恒且可执行的处理队列。"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from collections import Counter
from pathlib import Path
from typing import Any


CONTRACT = "recipeIngredientGapClassification/v1"
POLICY_ID = "recipeIngredientGapClassification/v1"

STATE_PATTERN = re.compile(
    r"干|鲜|新鲜|熟|生|冻|冷冻|泡发|水发|脱水|罐头|切片|切段|切块|片$|段$|丝$|丁$|泥$|汁$|粉$"
)
VARIABLE_PROCESSED_PATTERN = re.compile(
    r"香肠|腊肠|腊肉|午餐肉|火腿肠|肉松|肉丸|鱼丸|芝士|奶酪|巧克力|饼干|奥利奥|罐头|饮料|可乐|雪碧|馅料|酱$|沙司"
)
STABLE_PROCESSED_PATTERN = re.compile(
    r"面包糠|面包屑|吐司|粉条|年糕|腐竹|豆腐皮|油豆腐|豆腐干|冻豆腐|红曲粉|澄粉|吉士粉|淀粉|粉丝|挂面|馒头|饺子皮|馄饨皮|蛋挞皮|海苔|皮蛋|咸蛋黄|虾皮|虾米|海米|干贝|椰蓉|椰丝|抹茶粉"
)
COMPOSITE_PATTERN = re.compile(r"(?:或|或者|/|、|,|，|和|混合|青红|红绿|各种|适量|少许)")
RECIPE_NOISE_PATTERN = re.compile(
    r"^(?:主料|辅料|配料|装饰|表面|馅料|面团|面糊|油酥|水油皮|其他|无|适量)[:：]?$|"
    r"材料|部分|用料|需要|蛋糕体|装饰用|表面用|模具|烤箱|保鲜膜|油纸|竹签|牙签"
)
LIKELY_BASIC_PATTERN = re.compile(
    r"肉$|鱼$|虾$|蟹$|贝$|蛋$|菜$|瓜$|果$|米$|豆$|菇$|菌$|笋$|薯$|芋$|藕$|椒$|叶$|苗$|芽$|根$|骨$|皮$|肠$|肚$|肝$|心$|肺$|舌$|蹄$"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, required=True)
    parser.add_argument("--unresolved", type=Path, required=True)
    parser.add_argument("--routing-dir", type=Path, required=True)
    parser.add_argument("--release-id", required=True)
    parser.add_argument("--out-json", type=Path, required=True)
    parser.add_argument("--out-markdown", type=Path, required=True)
    return parser.parse_args()


def load_route_owners(directory: Path) -> dict[str, str]:
    owners: dict[str, str] = {}
    for route in ("source_exact", "generic_ambiguous", "processed_or_brand", "identity_candidate"):
        document = json.loads((directory / f"{route}.json").read_text(encoding="utf-8"))
        for item in document.get("items", []):
            name = str(item["normalized_name"])
            if name in owners:
                raise ValueError(f"分流项目重复：{name}")
            owners[name] = route
    return owners


def exact_source_subtype(conn: sqlite3.Connection, cleaned_name: str) -> str:
    rows = conn.execute(
        """
        SELECT DISTINCT r.source_kind
        FROM source_localized_name n
        JOIN source_release r ON r.release_id=n.source_release_id
        WHERE n.locale='zh-CN' AND n.name=?
        """,
        (cleaned_name,),
    ).fetchall()
    kinds = {str(row[0]) for row in rows}
    if kinds == {"cfct_ocr"}:
        if VARIABLE_PROCESSED_PATTERN.search(cleaned_name):
            return "cfct_variable_processed_candidate"
        if STABLE_PROCESSED_PATTERN.search(cleaned_name):
            return "cfct_stable_processed_candidate"
        if STATE_PATTERN.search(cleaned_name):
            return "cfct_state_candidate"
        return "cfct_exact_candidate"
    if kinds == {"usda_fooddata"}:
        return "usda_exact_candidate"
    return "multi_source_exact_candidate"


def classify_identity(name: str, occurrence_count: int) -> tuple[str, str]:
    if RECIPE_NOISE_PATTERN.search(name):
        return "recipe_text_or_non_food", "菜谱段落、用途说明或非食材对象"
    if COMPOSITE_PATTERN.search(name):
        return "composite_or_alternative", "包含组合、替代或多身份表达"
    if VARIABLE_PROCESSED_PATTERN.search(name):
        return "variable_processed_food", "品牌或配方会显著改变营养值"
    if STABLE_PROCESSED_PATTERN.search(name):
        return "stable_processed_food", "加工状态明确，适合寻找同状态通用来源"
    if STATE_PATTERN.search(name):
        return "state_or_form_conversion", "身份可能明确，但需匹配干湿、生熟或切分状态"
    if LIKELY_BASIC_PATTERN.search(name) or occurrence_count >= 10:
        return "basic_identity_candidate", "可能是单一基础食材，优先做来源身份门禁"
    return "low_frequency_unclear", "低频且缺少足够结构证据"


def classify(conn: sqlite3.Connection, unresolved: dict[str, Any], owners: dict[str, str], release_id: str) -> dict[str, Any]:
    items = []
    for item in unresolved.get("items", []):
        name = str(item["normalized_name"])
        count = int(item["occurrence_count"])
        route = owners.get(name)
        if route is None:
            raise ValueError(f"未覆盖项没有分流归属：{name}")
        if route == "source_exact":
            category = exact_source_subtype(conn, str(item.get("cleaned_name", name)))
            reason = "中文来源名精确命中，仍需确认唯一食品身份和状态"
        elif route == "generic_ambiguous":
            category = "generic_ambiguous"
            reason = "上位词或省略词，需受控默认值或更多上下文"
        elif route == "processed_or_brand":
            category = "processed_or_brand"
            reason = "品牌、商品或复合加工食品"
        else:
            category, reason = classify_identity(name, count)
        items.append({
            "normalized_name": name,
            "example_raw_name": item.get("example_raw_name"),
            "cleaned_name": item.get("cleaned_name"),
            "occurrence_count": count,
            "category": category,
            "reason": reason,
            "source_route": route,
            "status": item.get("status"),
            "rule_id": item.get("rule_id"),
        })
    items.sort(key=lambda value: (-int(value["occurrence_count"]), str(value["normalized_name"])))
    term_counts = Counter(item["category"] for item in items)
    occurrence_counts = Counter()
    for item in items:
        occurrence_counts[item["category"]] += int(item["occurrence_count"])
    return {
        "contract": CONTRACT,
        "policy_id": POLICY_ID,
        "release_id": release_id,
        "input_term_count": len(items),
        "input_occurrence_count": sum(int(item["occurrence_count"]) for item in items),
        "category_term_counts": dict(sorted(term_counts.items())),
        "category_occurrence_counts": dict(sorted(occurrence_counts.items())),
        "items": items,
    }


def markdown(document: dict[str, Any]) -> str:
    labels = {
        "cfct_exact_candidate": "CFCT 精确来源候选",
        "cfct_stable_processed_candidate": "CFCT 稳定加工候选",
        "cfct_variable_processed_candidate": "CFCT 配方不稳定候选",
        "cfct_state_candidate": "CFCT 状态候选",
        "usda_exact_candidate": "USDA 精确来源候选",
        "multi_source_exact_candidate": "多来源精确候选",
        "generic_ambiguous": "上位词或省略词",
        "processed_or_brand": "品牌或复合加工品",
        "variable_processed_food": "配方不稳定加工品",
        "stable_processed_food": "相对稳定加工品",
        "state_or_form_conversion": "形态或状态换算",
        "composite_or_alternative": "组合或替代写法",
        "recipe_text_or_non_food": "菜谱文本或非食材",
        "basic_identity_candidate": "基础食材身份候选",
        "low_frequency_unclear": "低频待定",
    }
    order = sorted(document["category_term_counts"], key=lambda key: -document["category_occurrence_counts"][key])
    lines = [
        "# 剩余未覆盖原料分类清单",
        "",
        f"版本：`{document['release_id']}`",
        "",
        f"共 {document['input_term_count']:,} 种写法、{document['input_occurrence_count']:,} 次提及。分类互斥，词项和提及次数严格守恒。",
        "",
        "| 分类 | 写法数 | 提及数 | 占未覆盖提及 |",
        "|---|---:|---:|---:|",
    ]
    total = int(document["input_occurrence_count"])
    for key in order:
        terms = int(document["category_term_counts"][key])
        occurrences = int(document["category_occurrence_counts"][key])
        lines.append(f"| {labels.get(key, key)} | {terms:,} | {occurrences:,} | {occurrences / total:.1%} |")
    for key in order:
        values = [item for item in document["items"] if item["category"] == key][:20]
        lines += ["", f"## {labels.get(key, key)}", "", values[0]["reason"] if values else "", "", "高频示例：", ""]
        lines += [f"- {item['normalized_name']}：{item['occurrence_count']:,} 次" for item in values]
    lines += [
        "",
        "## 建议处理顺序",
        "",
        "1. CFCT/USDA 精确来源候选：执行唯一身份、状态和营养完整度门禁。",
        "2. 基础食材身份候选：优先高频单一物种和部位，建立受控来源决定。",
        "3. 相对稳定加工品：只使用同加工状态的通用来源。",
        "4. 形态换算：建立干湿、生熟和可食部换算后再计入营养覆盖。",
        "5. 上位词、省略词和组合词：只接受显式约定或结构化拆分。",
        "6. 配方不稳定加工品、品牌品和低频噪声最后处理。",
        "",
        "完整逐项结果见同版本 JSON。",
    ]
    return "\n".join(lines) + "\n"


def main() -> int:
    args = parse_args()
    if any(path.exists() for path in (args.out_json, args.out_markdown)):
        print("拒绝覆盖已有未覆盖分类产物", file=sys.stderr)
        return 2
    try:
        unresolved = json.loads(args.unresolved.read_text(encoding="utf-8"))
        owners = load_route_owners(args.routing_dir)
        with sqlite3.connect(args.sqlite) as conn:
            document = classify(conn, unresolved, owners, args.release_id)
        if document["input_term_count"] != len(owners):
            raise ValueError("分类输入与分流词项数不守恒")
        for path in (args.out_json, args.out_markdown):
            path.parent.mkdir(parents=True, exist_ok=True)
        args.out_json.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        args.out_markdown.write_text(markdown(document), encoding="utf-8")
        print(json.dumps({key: value for key, value in document.items() if key != "items"}, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, sqlite3.Error, json.JSONDecodeError) as error:
        for path in (args.out_json, args.out_markdown):
            path.unlink(missing_ok=True)
        print(f"未覆盖原料分类失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
