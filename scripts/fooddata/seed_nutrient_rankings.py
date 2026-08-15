#!/usr/bin/env python3
"""按版本化规则生成经过目录与犬食策略过滤的营养素食材排行。"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any


REQUIRED_TABLES = {
    "ingredient_alias",
    "ingredient_concept",
    "ingredient_variant",
    "canine_ingredient_policy",
    "source_food_nutrient",
    "nutrient_ranking",
    "nutrient_ranking_item",
}
OPERATION_RULES_PATH = (
    Path(__file__).resolve().parents[2]
    / "contracts"
    / "shared-meal"
    / "ingredient-operation-rules-v1.json"
)


def load_operation_rules() -> dict[str, Any]:
    rules = json.loads(OPERATION_RULES_PATH.read_text(encoding="utf-8"))
    if (
        rules.get("contract") != "ingredientOperationRules/v1"
        or rules.get("blockedStatus") != "blocked"
        or rules.get("operableStatuses") != ["allowed", "conditional", "unknown"]
    ):
        raise ValueError("食材操作规则契约无效")
    return rules


OPERATION_RULES = load_operation_rules()


def can_operate_ingredient(value: Any) -> bool:
    normalized = str(value or "unknown").strip().lower()
    if normalized not in set(OPERATION_RULES["knownStatuses"]):
        normalized = "unknown"
    return normalized in set(OPERATION_RULES["operableStatuses"])


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, required=True)
    parser.add_argument("--rules", type=Path, required=True)
    return parser.parse_args()


def stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def load_rules(path: Path) -> dict[str, Any]:
    rules = json.loads(path.read_text(encoding="utf-8"))
    required = {
        "ranking_version",
        "compatible_catalog_version",
        "compatible_policy_version",
        "generated_at",
        "max_items",
        "nutrients",
    }
    missing = sorted(required - rules.keys())
    if missing:
        raise ValueError(f"排行规则缺少字段：{', '.join(missing)}")
    if not isinstance(rules["nutrients"], list) or not rules["nutrients"]:
        raise ValueError("排行规则 nutrients 必须是非空数组")
    if int(rules["max_items"]) <= 0:
        raise ValueError("排行规则 max_items 必须大于 0")
    return rules


def validate_tables(conn: sqlite3.Connection) -> None:
    tables = {
        row[0]
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    missing = sorted(REQUIRED_TABLES - tables)
    if missing:
        raise ValueError(f"离线主库缺少必要表：{', '.join(missing)}")


def catalog_version(conn: sqlite3.Connection) -> str:
    versions = [
        str(row[0])
        for row in conn.execute(
            """
            SELECT DISTINCT decision_version
            FROM ingredient_alias
            WHERE source = 'catalog_seed'
              AND review_status = 'approved'
              AND decision_version IS NOT NULL
            ORDER BY decision_version
            """
        )
    ]
    if len(versions) != 1:
        raise ValueError(f"离线主库必须且只能包含一个目录版本：{versions}")
    return versions[0]


def policy_version(conn: sqlite3.Connection, expected_catalog_version: str) -> str:
    versions = [
        (str(row[0]), str(row[1]))
        for row in conn.execute(
            """
            SELECT DISTINCT policy_version, compatible_catalog_version
            FROM canine_ingredient_policy
            WHERE review_status = 'approved'
            ORDER BY policy_version
            """
        )
    ]
    if len(versions) != 1:
        raise ValueError(f"离线主库必须且只能包含一个策略版本：{versions}")
    version, catalog = versions[0]
    if catalog != expected_catalog_version:
        raise ValueError(f"策略兼容目录版本不匹配：policy={catalog}, catalog={expected_catalog_version}")
    return version


def validate_formula(rule: dict[str, Any]) -> list[list[dict[str, Any]]]:
    code = str(rule.get("nutrient_code", "")).strip()
    if not code or not str(rule.get("nutrient_name_zh", "")).strip():
        raise ValueError("每条营养素规则必须包含 nutrient_code 和 nutrient_name_zh")
    if not str(rule.get("unit_name", "")).strip():
        raise ValueError(f"营养素规则缺少 unit_name：{code}")
    formulas = rule.get("formulas")
    if not isinstance(formulas, list) or not formulas:
        raise ValueError(f"营养素规则 formulas 必须是非空数组：{code}")
    normalized: list[list[dict[str, Any]]] = []
    for formula in formulas:
        if not isinstance(formula, list) or not formula:
            raise ValueError(f"营养素公式必须是非空数组：{code}")
        components: list[dict[str, Any]] = []
        for component in formula:
            nutrient_id = int(component.get("nutrient_id", 0))
            factor = float(component.get("factor", 1))
            if nutrient_id <= 0 or factor <= 0:
                raise ValueError(f"营养素公式包含无效 nutrient_id 或 factor：{code}")
            components.append({"nutrient_id": nutrient_id, "factor": factor})
        normalized.append(components)
    return normalized


def eligible_variants(conn: sqlite3.Connection, policy: str) -> list[sqlite3.Row]:
    conn.row_factory = sqlite3.Row
    return list(
        conn.execute(
            """
            WITH effective_policy AS (
              SELECT
                v.variant_id,
                COALESCE(vp.decision, cp.decision, 'unknown') AS decision,
                COALESCE(vp.conditions_json, cp.conditions_json, '{}') AS conditions_json
              FROM ingredient_variant v
              LEFT JOIN canine_ingredient_policy vp
                ON vp.policy_version = ?
               AND vp.variant_id = v.variant_id
               AND vp.review_status = 'approved'
              LEFT JOIN canine_ingredient_policy cp
                ON cp.policy_version = ?
               AND cp.concept_id = v.concept_id
               AND cp.variant_id IS NULL
               AND cp.review_status = 'approved'
            )
            SELECT
              v.variant_id,
              v.concept_id,
              v.source_release_id,
              v.source_food_id,
              v.display_name_zh,
              e.decision,
              e.conditions_json
            FROM ingredient_variant v
            JOIN ingredient_concept c ON c.concept_id = v.concept_id
            JOIN effective_policy e ON e.variant_id = v.variant_id
            WHERE c.status IN ('reviewed', 'published')
              AND v.status IN ('reviewed', 'published')
            ORDER BY v.variant_id
            """,
            (policy, policy),
        )
    )


def is_operation_eligible(row: sqlite3.Row) -> bool:
    return can_operate_ingredient(row["decision"])


def nutrient_values(
    conn: sqlite3.Connection,
    source_release_id: str,
    source_food_id: int,
) -> dict[int, float]:
    values: dict[int, float] = {}
    for nutrient_id, amount in conn.execute(
        """
        SELECT nutrient_id, amount
        FROM source_food_nutrient
        WHERE source_release_id = ? AND fdc_id = ? AND amount IS NOT NULL
        ORDER BY nutrient_id, source_record_id
        """,
        (source_release_id, source_food_id),
    ):
        nutrient_id = int(nutrient_id)
        numeric_amount = float(amount)
        existing = values.get(nutrient_id)
        if existing is not None and existing != numeric_amount:
            raise ValueError(
                "同一食物营养素存在冲突值："
                f"{source_release_id}/{source_food_id}/{nutrient_id}"
            )
        values[nutrient_id] = numeric_amount
    return values


def calculate_amount(
    values: dict[int, float], formulas: list[list[dict[str, Any]]]
) -> tuple[float, list[dict[str, Any]]] | None:
    for formula in formulas:
        if not all(component["nutrient_id"] in values for component in formula):
            continue
        components = [
            {
                "nutrient_id": component["nutrient_id"],
                "source_amount": values[component["nutrient_id"]],
                "factor": component["factor"],
            }
            for component in formula
        ]
        amount = sum(item["source_amount"] * item["factor"] for item in components)
        return amount, components
    return None


def seed_rankings(conn: sqlite3.Connection, rules: dict[str, Any]) -> dict[str, Any]:
    validate_tables(conn)
    actual_catalog = catalog_version(conn)
    expected_catalog = str(rules["compatible_catalog_version"])
    if actual_catalog != expected_catalog:
        raise ValueError(f"排行兼容目录版本不匹配：rules={expected_catalog}, sqlite={actual_catalog}")
    actual_policy = policy_version(conn, actual_catalog)
    expected_policy = str(rules["compatible_policy_version"])
    if actual_policy != expected_policy:
        raise ValueError(f"排行兼容策略版本不匹配：rules={expected_policy}, sqlite={actual_policy}")

    ranking_version = str(rules["ranking_version"])
    generated_at = str(rules["generated_at"])
    max_items = int(rules["max_items"])
    variants = [
        row
        for row in eligible_variants(conn, actual_policy)
        if is_operation_eligible(row)
    ]
    value_cache = {
        str(row["variant_id"]): nutrient_values(
            conn, str(row["source_release_id"]), int(row["source_food_id"])
        )
        for row in variants
    }

    nutrient_codes: set[str] = set()
    conn.execute(
        "DELETE FROM nutrient_ranking_item WHERE ranking_version = ?",
        (ranking_version,),
    )
    conn.execute("DELETE FROM nutrient_ranking WHERE ranking_version = ?", (ranking_version,))
    total_items = 0
    empty_rankings = 0
    for rule in rules["nutrients"]:
        code = str(rule.get("nutrient_code", "")).strip()
        if code in nutrient_codes:
            raise ValueError(f"营养素排行规则重复：{code}")
        nutrient_codes.add(code)
        formulas = validate_formula(rule)
        candidates: list[dict[str, Any]] = []
        for variant in variants:
            calculated = calculate_amount(value_cache[str(variant["variant_id"])], formulas)
            if calculated is None or calculated[0] <= 0:
                continue
            candidates.append(
                {
                    "variant": variant,
                    "amount": calculated[0],
                    "components": calculated[1],
                }
            )
        candidates.sort(
            key=lambda item: (
                -item["amount"],
                str(item["variant"]["display_name_zh"]),
                str(item["variant"]["variant_id"]),
            )
        )
        ranked = candidates[:max_items]
        conn.execute(
            """
            INSERT INTO nutrient_ranking (
              ranking_version, compatible_catalog_version, compatible_policy_version,
              nutrient_code, nutrient_name_zh, unit_name, formula_json, max_items,
              candidate_count, ranked_count, generated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ranking_version,
                actual_catalog,
                actual_policy,
                code,
                str(rule["nutrient_name_zh"]),
                str(rule["unit_name"]).upper(),
                stable_json(formulas),
                max_items,
                len(candidates),
                len(ranked),
                generated_at,
            ),
        )
        if not ranked:
            empty_rankings += 1
        for position, item in enumerate(ranked, start=1):
            variant = item["variant"]
            conn.execute(
                """
                INSERT INTO nutrient_ranking_item (
                  ranking_version, nutrient_code, rank_position, concept_id, variant_id,
                  source_release_id, source_food_id, amount_per_100g,
                  component_values_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ranking_version,
                    code,
                    position,
                    variant["concept_id"],
                    variant["variant_id"],
                    variant["source_release_id"],
                    variant["source_food_id"],
                    item["amount"],
                    stable_json(item["components"]),
                ),
            )
        total_items += len(ranked)

    return {
        "ranking_version": ranking_version,
        "compatible_catalog_version": actual_catalog,
        "compatible_policy_version": actual_policy,
        "non_blocked_variants": len(variants),
        "nutrient_rankings": len(nutrient_codes),
        "ranking_items": total_items,
        "empty_rankings": empty_rankings,
    }


def main() -> int:
    args = parse_args()
    if not args.sqlite.is_file():
        print(f"离线 SQLite 不存在：{args.sqlite}", file=sys.stderr)
        return 2
    if not args.rules.is_file():
        print(f"排行规则不存在：{args.rules}", file=sys.stderr)
        return 2
    try:
        rules = load_rules(args.rules)
        with sqlite3.connect(args.sqlite) as conn:
            conn.execute("PRAGMA foreign_keys = ON")
            summary = seed_rankings(conn, rules)
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, sqlite3.Error, json.JSONDecodeError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
