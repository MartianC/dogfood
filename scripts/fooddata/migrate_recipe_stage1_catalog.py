#!/usr/bin/env python3
"""把阶段一菜谱决定迁移到新的目录键空间，并隔离已下线的组件。"""

from __future__ import annotations

import argparse
from copy import deepcopy
import json
import sys
from pathlib import Path
from typing import Any


def parse_redirect(value: str) -> tuple[str, str]:
    source, separator, target = value.partition("=")
    if not separator or not source.strip() or not target.strip():
        raise ValueError(f"目录身份重定向格式无效：{value!r}")
    return source.strip(), target.strip()


def component_id(value: Any) -> str:
    if isinstance(value, dict):
        return str(value.get("concept_id", "")).strip()
    return str(value).strip()


def append_trace(item: dict[str, Any], trace: str) -> None:
    values = item.setdefault("rule_trace", [])
    if not isinstance(values, list):
        values = []
        item["rule_trace"] = values
    if trace not in values:
        values.append(trace)


def migrate(
    previous: dict[str, Any],
    catalog: dict[str, Any],
    redirects: dict[str, str],
) -> tuple[dict[str, Any], dict[str, Any]]:
    if previous.get("contract") != "recipeIngredientStage1Decisions/v1":
        raise ValueError("阶段一决定合同不匹配")
    catalog_ids = {
        str(item.get("concept_id", ""))
        for item in catalog.get("items", [])
        if str(item.get("concept_id", ""))
    }
    if not catalog_ids:
        raise ValueError("目标目录为空")

    output = deepcopy(previous)
    changed_items: list[dict[str, Any]] = []
    redirect_count = 0
    isolated_count = 0
    reduced_component_count = 0
    for item_index, original in enumerate(previous.get("items", [])):
        item = deepcopy(original)
        decision = str(item.get("decision", ""))
        old_concept = str(item.get("concept_id") or "").strip()
        new_concept = redirects.get(old_concept, old_concept) if old_concept else ""
        if old_concept and new_concept != old_concept:
            redirect_count += 1

        raw_components = item.get("components", [])
        if not isinstance(raw_components, list):
            raise ValueError(f"components 必须是数组：{item.get('normalized_name')}")
        old_components = [component_id(value) for value in raw_components]
        new_components = [redirects.get(value, value) for value in old_components]
        redirect_count += sum(
            old != new for old, new in zip(old_components, new_components)
        )
        valid_components = [value for value in new_components if value in catalog_ids]
        removed_components = [value for value in new_components if value not in catalog_ids]

        if decision == "mapped_existing":
            if new_concept in catalog_ids:
                item["concept_id"] = new_concept
            else:
                item["concept_id"] = None
                item["decision"] = "isolated"
                item["exclusion_category"] = "catalog_concept_removed"
                append_trace(item, "catalog_v22_removed_concept")
                isolated_count += 1
        elif decision in {"composite", "alternative"}:
            if len(valid_components) >= 2:
                item["components"] = valid_components
            elif len(valid_components) == 1:
                item["decision"] = "mapped_existing"
                item["concept_id"] = valid_components[0]
                item["components"] = []
            else:
                item["decision"] = "isolated"
                item["concept_id"] = None
                item["components"] = []
                item["exclusion_category"] = "catalog_concept_removed"
                isolated_count += 1
            if removed_components:
                append_trace(item, "catalog_v22_removed_component")
        else:
            if old_concept and new_concept in catalog_ids:
                item["concept_id"] = new_concept

        if removed_components:
            reduced_component_count += len(removed_components)
            item["migration_notes"] = {
                "catalog_version": catalog.get("catalog_version"),
                "removed_components": removed_components,
                "redirected_components": [
                    {"from": old, "to": new}
                    for old, new in zip(old_components, new_components)
                    if old != new
                ],
            }
        if item != original:
            changed_items.append({
                "normalized_name": item.get("normalized_name"),
                "from_decision": decision,
                "to_decision": item.get("decision"),
                "removed_components": removed_components,
                "from_concept_id": old_concept or None,
                "to_concept_id": item.get("concept_id"),
            })
        item["components"] = [component_id(value) for value in item.get("components", [])]

        references = []
        if item.get("decision") == "mapped_existing" and item.get("concept_id"):
            references.append(str(item["concept_id"]))
        references.extend(component_id(value) for value in item.get("components", []))
        invalid = sorted(set(references) - catalog_ids)
        if invalid:
            raise ValueError(
                f"迁移后仍引用目录外概念：{item.get('normalized_name')}={invalid}"
            )

        output["items"][item_index] = item

    output["migration"] = {
        "contract": "recipeIngredientStage1CatalogMigration/v1",
        "catalog_version": catalog.get("catalog_version"),
        "redirects": redirects,
        "changed_item_count": len(changed_items),
        "redirect_count": redirect_count,
        "isolated_item_count": isolated_count,
        "removed_component_count": reduced_component_count,
        "changed_items": changed_items,
    }
    return output, output["migration"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--previous", type=Path, required=True)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument(
        "--redirect",
        action="append",
        default=[],
        help="重复指定旧概念到新概念的重定向，格式为 old_id=new_id",
    )
    args = parser.parse_args()
    if not args.previous.is_file() or not args.catalog.is_file():
        print("阶段一迁移输入不完整", file=sys.stderr)
        return 2
    if args.out.exists():
        print(f"拒绝覆盖已有阶段一快照：{args.out}", file=sys.stderr)
        return 2
    try:
        previous = json.loads(args.previous.read_text(encoding="utf-8"))
        catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
        redirects = {
            str(source): str(target)
            for source, target in catalog.get("complete_usda_integration", {})
            .get("merged_concept_redirects", {})
            .items()
        }
        for value in args.redirect:
            source, target = parse_redirect(value)
            redirects[source] = target
        output, report = migrate(previous, catalog, redirects)
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(
            json.dumps(output, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        args.out.unlink(missing_ok=True)
        print(f"阶段一目录迁移失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
