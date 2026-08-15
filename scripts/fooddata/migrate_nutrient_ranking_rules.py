#!/usr/bin/env python3
"""把营养排行公式无损迁移到新的目录和策略版本。"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--previous", type=Path, required=True)
    parser.add_argument("--ranking-version", required=True)
    parser.add_argument("--catalog-version", required=True)
    parser.add_argument("--policy-version", required=True)
    parser.add_argument("--generated-at", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if not args.previous.is_file():
        print("上一版排行规则不存在", file=sys.stderr)
        return 2
    if args.out.exists():
        print(f"拒绝覆盖已有排行规则：{args.out}", file=sys.stderr)
        return 2
    try:
        output = json.loads(args.previous.read_text(encoding="utf-8"))
        nutrients = output.get("nutrients")
        if not isinstance(nutrients, list) or len(nutrients) != 44:
            raise ValueError("上一版排行规则必须完整包含 44 个营养代码")
        codes = [str(item.get("nutrient_code", "")) for item in nutrients]
        if any(not code for code in codes) or len(set(codes)) != len(codes):
            raise ValueError("上一版排行规则包含空或重复营养代码")
        output["ranking_version"] = args.ranking_version
        output["compatible_catalog_version"] = args.catalog_version
        output["compatible_policy_version"] = args.policy_version
        output["generated_at"] = args.generated_at
        output["eligibility"] = (
            "包含 ingredientOperationRules/v1 判定为非 blocked 的目录形态；"
            "allowed、conditional、unknown 可进入排行，blocked 排除"
        )
        output["migration"] = {
            "previous_ranking_version": str(
                json.loads(args.previous.read_text(encoding="utf-8"))["ranking_version"]
            ),
            "formula_change": "none",
        }
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(
            json.dumps(output, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(
            json.dumps(
                {
                    "ranking_version": args.ranking_version,
                    "compatible_catalog_version": args.catalog_version,
                    "compatible_policy_version": args.policy_version,
                    "nutrients": len(nutrients),
                    "formula_change": "none",
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        args.out.unlink(missing_ok=True)
        print(f"排行规则迁移失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
