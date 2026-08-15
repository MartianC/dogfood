#!/usr/bin/env python3
"""将阶段一未决原料分流为互斥的后续处理队列。"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any


POLICY_ID = "recipeIngredientStage1Routing/v1"
INPUT_CONTRACT = "recipeIngredientStage1Unresolved/v1"
ROUTE_CONTRACT = "recipeIngredientStage1Route/v1"
MANIFEST_CONTRACT = "recipeIngredientStage1RoutingManifest/v1"

STATE_CONVERSIONS = {
    "米饭": ("大米", "cooked", "conversion_required"),
    "剩米饭": ("大米", "cooked", "conversion_required"),
    "全蛋液": ("鸡蛋", "raw", "ready"),
    "蛋液": ("鸡蛋", "raw", "ready"),
    "熟芝麻": ("芝麻", "cooked", "conversion_required"),
    "熟白芝麻": ("白芝麻", "cooked", "conversion_required"),
    "熟黑芝麻": ("黑芝麻", "cooked", "conversion_required"),
    "土豆泥": ("土豆", "cooked", "conversion_required"),
    "南瓜泥": ("南瓜", "cooked", "conversion_required"),
}
GENERIC_IDENTITIES = {
    "鸡", "鸭", "鹅", "猪", "牛", "羊", "鱼", "蛋", "肉", "瘦肉", "肉末",
    "肉馅", "肉丝", "肉片", "肉糜", "肉沫", "碎肉", "蘑菇", "青菜", "蔬菜",
    "水果", "海鲜", "菌菇", "坚果",
}
AUXILIARY_ALIASES = {
    "开水": "水",
    "凉开水": "水",
    "冷水": "水",
    "冰块": "水",
    "酵母粉": "酵母",
    "干酵母": "酵母",
    "发酵粉": "发酵辅料",
}
EXCLUDED_GAP_PATTERN = re.compile(
    r"郫县豆瓣|豆瓣酱|红油豆瓣|老干妈|味极鲜|番茄沙司|番茄酱|甜面酱|"
    r"沙拉酱|蛋黄酱|腐乳|榨菜|泡菜|酸菜|辣白菜"
)
PROCESSED_OR_BRAND_PATTERN = re.compile(
    r"火腿肠|肉松|高汤|鸡汤|可乐|奥利奥|消化饼干|饺子皮|蛋挞皮|"
    r"豆沙馅|红豆沙|豆沙$|棉花糖|巧克力酱|方便面|浓汤宝"
)
ROUTE_ORDER = (
    "source_exact",
    "generic_ambiguous",
    "auxiliary_gap",
    "excluded_gap",
    "state_conversion",
    "processed_or_brand",
    "identity_candidate",
)


def route_item(item: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    status = str(item["status"])
    name = str(item["cleaned_name"])
    if status == "source_candidate":
        return "source_exact", {"next_stage": "source_identity_clustering"}
    if status == "ambiguous" or name in GENERIC_IDENTITIES:
        return "generic_ambiguous", {"next_stage": "isolated"}
    if name in AUXILIARY_ALIASES:
        return "auxiliary_gap", {
            "canonical_auxiliary": AUXILIARY_ALIASES[name],
            "next_stage": "normalization_rule_backfill",
        }
    if EXCLUDED_GAP_PATTERN.search(name):
        return "excluded_gap", {
            "exclusion_category": "seasoning",
            "next_stage": "normalization_rule_backfill",
        }
    if name in STATE_CONVERSIONS:
        base_name, preparation_state, nutrition_status = STATE_CONVERSIONS[name]
        return "state_conversion", {
            "base_name_zh": base_name,
            "mention_preparation_state": preparation_state,
            "nutrition_status": nutrition_status,
            "next_stage": "state_mapping",
        }
    if PROCESSED_OR_BRAND_PATTERN.search(name):
        return "processed_or_brand", {"next_stage": "isolated"}
    return "identity_candidate", {"next_stage": "source_identity_clustering"}


def route_document(payload: dict[str, Any]) -> tuple[dict[str, list[dict[str, Any]]], dict[str, Any]]:
    if payload.get("contract") != INPUT_CONTRACT or not isinstance(payload.get("items"), list):
        raise ValueError("阶段一未决产物合同不匹配")
    routes: dict[str, list[dict[str, Any]]] = {name: [] for name in ROUTE_ORDER}
    for item in payload["items"]:
        route, metadata = route_item(item)
        routes[route].append({**item, "route": route, **metadata})

    term_counts = {name: len(routes[name]) for name in ROUTE_ORDER}
    occurrence_counts = {
        name: sum(int(item["occurrence_count"]) for item in routes[name])
        for name in ROUTE_ORDER
    }
    manifest = {
        "contract": MANIFEST_CONTRACT,
        "routing_policy_id": POLICY_ID,
        "source_contract": INPUT_CONTRACT,
        "input_term_count": len(payload["items"]),
        "input_occurrence_count": sum(
            int(item["occurrence_count"]) for item in payload["items"]
        ),
        "route_term_counts": term_counts,
        "route_occurrence_counts": occurrence_counts,
        "output_term_count": sum(term_counts.values()),
        "output_occurrence_count": sum(occurrence_counts.values()),
    }
    return routes, manifest


def encoded(value: dict[str, Any]) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--unresolved", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.unresolved.is_file():
        print("阶段一未决产物不存在", file=sys.stderr)
        return 2
    if args.out_dir.exists():
        print("拒绝覆盖已有阶段一分流目录", file=sys.stderr)
        return 2
    try:
        payload = json.loads(args.unresolved.read_text(encoding="utf-8"))
        routes, manifest = route_document(payload)
        args.out_dir.mkdir(parents=True)
        artifact_sha256: dict[str, str] = {}
        for route in ROUTE_ORDER:
            filename = f"{route}.json"
            document = {
                "contract": ROUTE_CONTRACT,
                "routing_policy_id": POLICY_ID,
                "route": route,
                "items": routes[route],
            }
            content = encoded(document)
            (args.out_dir / filename).write_bytes(content)
            artifact_sha256[filename] = hashlib.sha256(content).hexdigest()
        manifest["artifact_sha256"] = artifact_sha256
        (args.out_dir / "manifest.json").write_bytes(encoded(manifest))
        print(json.dumps(manifest, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"阶段一未决分流失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
