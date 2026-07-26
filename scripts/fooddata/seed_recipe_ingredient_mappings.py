#!/usr/bin/env python3
"""生成可审计的人饭原料写法映射快照，并更新已确认的来源授权状态。"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import sys
import unicodedata
from pathlib import Path
from typing import Any


REQUIRED_TABLES = {
    "source_release",
    "recipe_ingredient_term",
    "ingredient_alias",
    "ingredient_concept",
    "ingredient_variant",
    "canine_ingredient_policy",
    "recipe_mapping_release",
    "ingredient_mapping_decision",
    "ingredient_mapping_component",
    "review_task",
}
MAPPING_STATUSES = {"matched", "ambiguous", "unmatched", "composite", "alternative"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, required=True)
    parser.add_argument("--mapping", type=Path, required=True)
    return parser.parse_args()


def normalize_alias(value: str) -> str:
    return "".join(unicodedata.normalize("NFKC", value).strip().lower().split())


def stable_id(prefix: str, *parts: str) -> str:
    digest = hashlib.sha256("\0".join(parts).encode("utf-8")).hexdigest()[:20]
    return f"{prefix}_{digest}"


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"JSON 顶层必须是对象：{path}")
    return value


def validate_tables(conn: sqlite3.Connection) -> None:
    tables = {
        row[0]
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    missing = sorted(REQUIRED_TABLES - tables)
    if missing:
        raise ValueError(f"离线主库缺少必要表：{', '.join(missing)}")


def single_version(conn: sqlite3.Connection, sql: str, label: str) -> str:
    versions = [str(row[0]) for row in conn.execute(sql)]
    if len(versions) != 1:
        raise ValueError(f"离线主库必须且只能包含一个{label}版本：{versions}")
    return versions[0]


def verify_versions(conn: sqlite3.Connection, mapping: dict[str, Any]) -> tuple[str, str]:
    catalog = single_version(
        conn,
        """
        SELECT DISTINCT decision_version
        FROM ingredient_alias
        WHERE source='catalog_seed'
          AND review_status='approved'
          AND decision_version IS NOT NULL
        ORDER BY decision_version
        """,
        "目录",
    )
    policy = single_version(
        conn,
        """
        SELECT DISTINCT policy_version
        FROM canine_ingredient_policy
        WHERE review_status='approved'
        ORDER BY policy_version
        """,
        "策略",
    )
    if catalog != str(mapping.get("compatible_catalog_version", "")):
        raise ValueError(
            f"映射兼容目录版本不匹配：mapping={mapping.get('compatible_catalog_version')}, sqlite={catalog}"
        )
    if policy != str(mapping.get("compatible_policy_version", "")):
        raise ValueError(
            f"映射兼容策略版本不匹配：mapping={mapping.get('compatible_policy_version')}, sqlite={policy}"
        )
    return catalog, policy


def verify_source_authorization(
    conn: sqlite3.Connection,
    mapping_path: Path,
    mapping: dict[str, Any],
) -> dict[str, Any]:
    declaration_value = str(mapping.get("source_declaration", "")).strip()
    if not declaration_value:
        raise ValueError("映射快照缺少 source_declaration")
    declaration_path = Path(declaration_value)
    if not declaration_path.is_absolute():
        declaration_path = Path.cwd() / declaration_path
    if not declaration_path.is_file():
        raise ValueError(f"来源授权声明不存在：{declaration_path}")
    declaration = load_json(declaration_path)
    if declaration.get("license_status") != "verified":
        raise ValueError("菜谱来源授权状态不是 verified，禁止生成运行时投影")
    for field in (
        "source_version",
        "source_sha256",
        "authorization_basis",
        "authorization_confirmed_by",
        "authorization_confirmed_at",
    ):
        if not str(declaration.get(field, "")).strip():
            raise ValueError(f"来源授权声明缺少字段：{field}")

    rows = conn.execute(
        """
        SELECT release_id, source_sha256
        FROM source_release
        WHERE source_kind='human_recipe' AND source_version=?
        """,
        (str(declaration["source_version"]),),
    ).fetchall()
    if len(rows) != 1:
        raise ValueError(f"无法唯一定位菜谱来源：{rows}")
    release_id, actual_sha256 = str(rows[0][0]), str(rows[0][1])
    if actual_sha256 != str(declaration["source_sha256"]):
        raise ValueError(
            f"菜谱来源 SHA-256 不匹配：declaration={declaration['source_sha256']}, sqlite={actual_sha256}"
        )
    conn.execute(
        "UPDATE source_release SET license_status='verified' WHERE release_id=?",
        (release_id,),
    )
    return {
        "release_id": release_id,
        "source_sha256": actual_sha256,
        "declaration_path": str(declaration_path),
        "mapping_path": str(mapping_path),
    }


def catalog_maps(
    conn: sqlite3.Connection,
) -> tuple[dict[str, str], dict[str, str], dict[str, str]]:
    alias_owners: dict[str, set[str]] = {}
    for alias, concept_id in conn.execute(
        """
        SELECT normalized_alias, concept_id
        FROM ingredient_alias
        WHERE review_status='approved'
        ORDER BY normalized_alias, concept_id
        """
    ):
        alias_owners.setdefault(str(alias), set()).add(str(concept_id))
    conflicts = {
        alias: sorted(owners) for alias, owners in alias_owners.items() if len(owners) != 1
    }
    if conflicts:
        first = next(iter(conflicts.items()))
        raise ValueError(f"审核别名存在跨概念冲突：{first}")
    aliases = {alias: next(iter(owners)) for alias, owners in alias_owners.items()}

    defaults: dict[str, str] = {}
    variant_owners: dict[str, str] = {}
    for variant_id, concept_id, is_default in conn.execute(
        """
        SELECT variant_id, concept_id, is_default
        FROM ingredient_variant
        WHERE status IN ('reviewed','published')
        ORDER BY concept_id, variant_id
        """
    ):
        variant_id = str(variant_id)
        concept_id = str(concept_id)
        variant_owners[variant_id] = concept_id
        if int(is_default):
            if concept_id in defaults:
                raise ValueError(f"标准食材概念存在多个默认形态：{concept_id}")
            defaults[concept_id] = variant_id
    concepts = {
        str(row[0])
        for row in conn.execute(
            "SELECT concept_id FROM ingredient_concept WHERE status IN ('reviewed','published')"
        )
    }
    missing_defaults = sorted(concepts - defaults.keys())
    if missing_defaults:
        raise ValueError(f"标准食材概念缺少默认形态：{missing_defaults[:5]}")
    return aliases, defaults, variant_owners


def manual_decision_map(mapping: dict[str, Any]) -> dict[str, dict[str, Any]]:
    decisions: dict[str, dict[str, Any]] = {}
    for decision in mapping.get("manual_decisions", []):
        normalized_name = str(decision.get("normalized_name", "")).strip()
        if not normalized_name or normalized_name in decisions:
            raise ValueError(f"人工映射 normalized_name 缺失或重复：{normalized_name!r}")
        status = str(decision.get("mapping_status", ""))
        if status not in MAPPING_STATUSES:
            raise ValueError(f"人工映射状态无效：{normalized_name}={status}")
        decisions[normalized_name] = decision
    return decisions


def resolve_manual_components(
    decision: dict[str, Any],
    defaults: dict[str, str],
    variant_owners: dict[str, str],
) -> list[tuple[str, str]]:
    status = str(decision["mapping_status"])
    components = decision.get("components", [])
    if not isinstance(components, list):
        raise ValueError("人工映射 components 必须是数组")
    if status in {"matched", "composite", "alternative"} and not components:
        raise ValueError(f"{status} 人工映射必须包含 components")
    if status in {"ambiguous", "unmatched"} and components:
        raise ValueError(f"{status} 人工映射不得直接发布 components")
    if status == "matched" and len(components) != 1:
        raise ValueError("matched 人工映射必须且只能包含一个 component")
    if status in {"composite", "alternative"} and len(components) < 2:
        raise ValueError(f"{status} 人工映射至少需要两个 components")

    resolved = []
    for component in components:
        concept_id = str(component.get("concept_id", ""))
        if concept_id not in defaults:
            raise ValueError(f"人工映射引用未知概念：{concept_id}")
        variant_id = str(component.get("variant_id") or defaults[concept_id])
        if variant_owners.get(variant_id) != concept_id:
            raise ValueError(
                f"人工映射形态不属于指定概念：{concept_id}/{variant_id}"
            )
        resolved.append((concept_id, variant_id))
    return resolved


def seed_mappings(
    conn: sqlite3.Connection,
    mapping_path: Path,
    mapping: dict[str, Any],
) -> dict[str, Any]:
    validate_tables(conn)
    required = {
        "mapping_version",
        "compatible_catalog_version",
        "compatible_policy_version",
        "source_declaration",
        "generated_at",
        "automatic_rules",
        "review_task_min_occurrences",
        "manual_decisions",
    }
    missing = sorted(required - mapping.keys())
    if missing:
        raise ValueError(f"映射快照缺少字段：{', '.join(missing)}")
    if mapping["automatic_rules"] != ["approved_alias_exact"]:
        raise ValueError("首版映射只允许 approved_alias_exact 自动规则")
    task_threshold = int(mapping["review_task_min_occurrences"])
    if task_threshold <= 0:
        raise ValueError("review_task_min_occurrences 必须大于 0")

    catalog_version, policy_version = verify_versions(conn, mapping)
    source = verify_source_authorization(conn, mapping_path, mapping)
    aliases, defaults, variant_owners = catalog_maps(conn)
    manual = manual_decision_map(mapping)
    mapping_version = str(mapping["mapping_version"])
    generated_at = str(mapping["generated_at"])

    terms = list(
        conn.execute(
            """
            SELECT normalized_name, occurrence_count
            FROM recipe_ingredient_term
            ORDER BY normalized_name
            """
        )
    )
    unknown_manual = sorted(set(manual) - {str(row[0]) for row in terms})
    if unknown_manual:
        raise ValueError(f"人工映射引用不存在的原料写法：{unknown_manual[:5]}")

    conn.execute("DELETE FROM ingredient_mapping_component")
    conn.execute("DELETE FROM ingredient_mapping_decision")
    conn.execute("DELETE FROM review_task")
    conn.execute("DELETE FROM recipe_mapping_release")
    conn.execute(
        """
        INSERT INTO recipe_mapping_release (
          mapping_version, compatible_catalog_version, compatible_policy_version,
          source_release_id, source_sha256, license_status, generated_at,
          rule_config_json
        ) VALUES (?, ?, ?, ?, ?, 'verified', ?, ?)
        """,
        (
            mapping_version,
            catalog_version,
            policy_version,
            source["release_id"],
            source["source_sha256"],
            generated_at,
            json.dumps(
                {
                    "automatic_rules": mapping["automatic_rules"],
                    "review_task_min_occurrences": task_threshold,
                    "manual_decision_count": len(manual),
                },
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ),
        ),
    )

    status_counts = {status: 0 for status in sorted(MAPPING_STATUSES)}
    matched_occurrences = 0
    total_occurrences = 0
    review_tasks = 0
    for normalized_name_value, occurrence_count_value in terms:
        normalized_name = str(normalized_name_value)
        occurrence_count = int(occurrence_count_value)
        total_occurrences += occurrence_count
        manual_decision = manual.get(normalized_name)
        components: list[tuple[str, str]] = []
        if manual_decision is not None:
            status = str(manual_decision["mapping_status"])
            components = resolve_manual_components(
                manual_decision, defaults, variant_owners
            )
            rule_id = str(manual_decision.get("rule_id") or "manual_review")
            reviewed_by = str(manual_decision.get("reviewed_by") or "项目数据审核")
            reviewed_at = str(manual_decision.get("reviewed_at") or generated_at)
            notes = str(manual_decision.get("notes") or "")
        else:
            concept_id = aliases.get(normalize_alias(normalized_name))
            if concept_id:
                status = "matched"
                components = [(concept_id, defaults[concept_id])]
                rule_id = "approved_alias_exact"
                reviewed_by = "system:approved-alias"
                reviewed_at = generated_at
                notes = "由已审核且唯一的标准食材名称/别名精确匹配。"
            else:
                status = "unmatched"
                rule_id = "no_approved_exact_alias"
                reviewed_by = None
                reviewed_at = None
                notes = "当前目录没有审核过的唯一精确别名；保持不可选择。"

        conn.execute(
            """
            INSERT INTO ingredient_mapping_decision (
              normalized_name, mapping_status, rule_id, decision_version,
              reviewed_by, reviewed_at, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                normalized_name,
                status,
                rule_id,
                mapping_version,
                reviewed_by,
                reviewed_at,
                notes,
            ),
        )
        for position, (concept_id, variant_id) in enumerate(components):
            conn.execute(
                """
                INSERT INTO ingredient_mapping_component (
                  normalized_name, position, concept_id, variant_id
                ) VALUES (?, ?, ?, ?)
                """,
                (normalized_name, position, concept_id, variant_id),
            )
        status_counts[status] += 1
        if components:
            matched_occurrences += occurrence_count
        elif occurrence_count >= task_threshold:
            conn.execute(
                """
                INSERT INTO review_task (
                  task_id, normalized_name, reason, priority, status
                ) VALUES (?, ?, 'unmatched', ?, 'pending')
                """,
                (
                    stable_id("recipe_review", mapping_version, normalized_name),
                    normalized_name,
                    occurrence_count,
                ),
            )
            review_tasks += 1

    foreign_key_errors = conn.execute("PRAGMA foreign_key_check").fetchall()
    if foreign_key_errors:
        raise ValueError(f"原料映射外键校验失败：{foreign_key_errors[:3]}")
    return {
        "mapping_version": mapping_version,
        "compatible_catalog_version": catalog_version,
        "compatible_policy_version": policy_version,
        "source_release_id": source["release_id"],
        "source_license_status": "verified",
        "terms": len(terms),
        "occurrences": total_occurrences,
        "matched_occurrences": matched_occurrences,
        "occurrence_coverage": (
            round(matched_occurrences / total_occurrences, 6)
            if total_occurrences
            else 0
        ),
        "decisions": status_counts,
        "components": conn.execute(
            "SELECT COUNT(*) FROM ingredient_mapping_component"
        ).fetchone()[0],
        "review_tasks": review_tasks,
    }


def main() -> int:
    args = parse_args()
    if not args.sqlite.is_file():
        print(f"离线 SQLite 不存在：{args.sqlite}", file=sys.stderr)
        return 2
    if not args.mapping.is_file():
        print(f"映射快照不存在：{args.mapping}", file=sys.stderr)
        return 2
    try:
        mapping = load_json(args.mapping)
        with sqlite3.connect(args.sqlite) as conn:
            conn.execute("PRAGMA foreign_keys=ON")
            summary = seed_mappings(conn, args.mapping, mapping)
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, sqlite3.Error, json.JSONDecodeError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
