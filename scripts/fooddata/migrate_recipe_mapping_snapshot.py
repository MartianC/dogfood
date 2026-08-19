#!/usr/bin/env python3
"""迁移正式人饭原料映射的兼容版本，不改变阶段一决定内容。"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--previous", type=Path, required=True)
    parser.add_argument("--mapping-version", required=True)
    parser.add_argument("--catalog-version", required=True)
    parser.add_argument("--policy-version", required=True)
    parser.add_argument("--generated-at", required=True)
    parser.add_argument("--stage1-decisions", type=Path)
    parser.add_argument("--stage1-migration-report", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if not args.previous.is_file():
        print("上一版映射快照不存在", file=sys.stderr)
        return 2
    if args.out.exists():
        print(f"拒绝覆盖已有映射快照：{args.out}", file=sys.stderr)
        return 2
    try:
        output = json.loads(args.previous.read_text(encoding="utf-8"))
        if not output.get("stage1_decisions") or not output.get("stage1_decisions_sha256"):
            raise ValueError("上一版映射缺少阶段一不可变快照绑定")
        previous_version = str(output["mapping_version"])
        output["mapping_version"] = args.mapping_version
        output["compatible_catalog_version"] = args.catalog_version
        output["compatible_policy_version"] = args.policy_version
        output["generated_at"] = args.generated_at
        stage1_migration = None
        if args.stage1_decisions:
            if not args.stage1_decisions.is_file():
                raise ValueError(f"新的阶段一决定不存在：{args.stage1_decisions}")
            output["stage1_decisions"] = str(args.stage1_decisions)
            output["stage1_decisions_sha256"] = sha256_file(args.stage1_decisions)
            if args.stage1_migration_report:
                if not args.stage1_migration_report.is_file():
                    raise ValueError(
                        f"阶段一迁移报告不存在：{args.stage1_migration_report}"
                    )
                stage1_migration = json.loads(
                    args.stage1_migration_report.read_text(encoding="utf-8")
                )
        output["migration"] = {
            "previous_mapping_version": previous_version,
            "decision_change": (
                "stage1_catalog_migration" if args.stage1_decisions else "none"
            ),
        }
        if stage1_migration is not None:
            output["migration"]["stage1_catalog_migration"] = stage1_migration
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(
            json.dumps(output, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(json.dumps({
            "mapping_version": args.mapping_version,
            "compatible_catalog_version": args.catalog_version,
            "compatible_policy_version": args.policy_version,
            "decision_change": (
                "stage1_catalog_migration" if args.stage1_decisions else "none"
            ),
        }, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        args.out.unlink(missing_ok=True)
        print(f"映射迁移失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
