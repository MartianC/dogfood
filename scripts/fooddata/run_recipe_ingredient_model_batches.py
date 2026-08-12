#!/usr/bin/env python3
"""通过 Codex CLI 可续跑执行原料身份模型批次，并严格校验输出。"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


RUNNER_CONTRACT = "recipeIngredientModelBatchRunner/v1"


def load_batches(path: Path) -> list[dict[str, Any]]:
    batches = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]
    if not batches:
        raise ValueError("模型批次为空")
    ids = [str(batch.get("batch_id", "")) for batch in batches]
    if any(not value for value in ids) or len(set(ids)) != len(ids):
        raise ValueError("模型批次 batch_id 缺失或重复")
    return batches


def validate_result(batch: dict[str, Any], result: dict[str, Any]) -> None:
    expected = [str(item["cleaned_name"]) for item in batch["terms"]]
    rows = result.get("results")
    if not isinstance(rows, list):
        raise ValueError("模型结果缺少 results 数组")
    actual = [str(item.get("cleaned_name", "")) for item in rows]
    if len(actual) != len(expected) or set(actual) != set(expected):
        raise ValueError(
            f"模型结果未一一覆盖输入：expected={len(expected)}, actual={len(actual)}"
        )
    if len(set(actual)) != len(actual):
        raise ValueError("模型结果包含重复 cleaned_name")
    for row in rows:
        status = row.get("status")
        base_name = row.get("base_name_zh")
        if status == "resolved" and not str(base_name or "").strip():
            raise ValueError(f"resolved 结果缺少 base_name_zh：{row.get('cleaned_name')}")
        if status == "unresolved" and base_name is not None:
            raise ValueError(f"unresolved 结果的 base_name_zh 必须为 null：{row.get('cleaned_name')}")


def prompt_for(batch: dict[str, Any]) -> str:
    compact_terms = [
        {
            "cleaned_name": item["cleaned_name"],
            "occurrence_count": item["occurrence_count"],
            "source_terms": [source["name"] for source in item["source_terms"]],
        }
        for item in batch["terms"]
    ]
    return (
        "你是中文菜谱基础食材身份归一器。对每个输入恰好输出一项。"
        "base_name_zh必须是不含品牌、数量、用途、刀工、生熟、骨皮的普通基础食材名；"
        "如果是上位词、复合食品、菜名、无法确定具体身份或不是食材，返回unresolved和null。"
        "不要判断犬食安全，不要选择营养档案，不要添加输入之外的项目。"
        "resolution_reason最多12个中文字符。输入："
        + json.dumps(compact_terms, ensure_ascii=False, separators=(",", ":"))
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-batches", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--model", default="gpt-5.6-luna")
    parser.add_argument("--reasoning-effort", default="low")
    parser.add_argument("--codex-bin", default="codex")
    parser.add_argument("--limit", type=int, help="仅执行前 N 个批次，用于小批验证")
    parser.add_argument("--schema", type=Path, default=Path(__file__).with_name("recipe_ingredient_model_results.schema.json"))
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.model_batches.is_file() or not args.schema.is_file():
        print("模型批次或输出 Schema 不存在", file=sys.stderr)
        return 2
    try:
        batches = load_batches(args.model_batches)
        if args.limit is not None:
            if args.limit <= 0:
                raise ValueError("limit 必须大于0")
            batches = batches[: args.limit]
        args.out_dir.mkdir(parents=True, exist_ok=True)
        completed = 0
        for batch in batches:
            batch_id = str(batch["batch_id"])
            target = args.out_dir / f"{batch_id}.json"
            if target.exists():
                result = json.loads(target.read_text(encoding="utf-8"))
                validate_result(batch, result)
                completed += 1
                print(f"已复用 {batch_id} ({completed}/{len(batches)})", flush=True)
                continue
            with tempfile.TemporaryDirectory(prefix="ingredient-model-") as temp_dir:
                temporary = Path(temp_dir) / "result.json"
                command = [
                    args.codex_bin,
                    "exec",
                    "--ephemeral",
                    "--ignore-user-config",
                    "--ignore-rules",
                    "--skip-git-repo-check",
                    "--sandbox",
                    "read-only",
                    "--model",
                    args.model,
                    "-c",
                    f'model_reasoning_effort="{args.reasoning_effort}"',
                    "--output-schema",
                    str(args.schema.resolve()),
                    "--output-last-message",
                    str(temporary),
                    prompt_for(batch),
                ]
                process = subprocess.run(command, text=True, check=False)
                if process.returncode != 0 or not temporary.is_file():
                    raise ValueError(f"Codex 模型批次失败：{batch_id}")
                result = json.loads(temporary.read_text(encoding="utf-8"))
                validate_result(batch, result)
                target.write_text(
                    json.dumps(result, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )
            completed += 1
            print(f"已完成 {batch_id} ({completed}/{len(batches)})", flush=True)
        manifest = {
            "contract": RUNNER_CONTRACT,
            "model": args.model,
            "reasoning_effort": args.reasoning_effort,
            "batch_count": len(batches),
            "result_count": sum(len(batch["terms"]) for batch in batches),
        }
        manifest_path = args.out_dir / "manifest.json"
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(json.dumps(manifest, ensure_ascii=False, indent=2))
        return 0
    except (OSError, json.JSONDecodeError, subprocess.SubprocessError, ValueError) as error:
        print(f"模型批次执行失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
