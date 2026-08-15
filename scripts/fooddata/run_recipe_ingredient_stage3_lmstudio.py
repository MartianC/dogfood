#!/usr/bin/env python3
"""使用LM Studio对阶段三受控候选执行正反顺序双次一致性判断。"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


POLICY_ID = "recipeIngredientStage3DualPassModel/v1"
FIXED_CHOICES = ("ambiguous", "composite", "excluded", "auxiliary")


def response_schema(items: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["results"],
        "properties": {
            "results": {
                "type": "object",
                "additionalProperties": False,
                "required": [item["cleaned_name"] for item in items],
                "properties": {
                    item["cleaned_name"]: {
                        "type": "string",
                        "enum": [
                            *[candidate["candidate_id"] for candidate in item["candidates"]],
                            *FIXED_CHOICES,
                        ],
                    }
                    for item in items
                },
            }
        },
    }


def prompt_items(items: list[dict[str, Any]], reverse: bool) -> list[dict[str, Any]]:
    result = []
    for item in items:
        candidates = list(item["candidates"])
        if reverse:
            candidates.reverse()
        result.append({
            "cleaned_name": item["cleaned_name"],
            "occurrence_count": item["occurrence_count"],
            "candidates": [
                {
                    "candidate_id": candidate["candidate_id"],
                    "base_identity": candidate["base_identity"],
                    "category_code": candidate["category_code"],
                    "species": candidate.get("species"),
                    "part": candidate.get("part"),
                    "descriptions": candidate["representative_descriptions"],
                }
                for candidate in candidates
            ],
        })
    return result


def call_model(
    endpoint: str,
    model: str,
    items: list[dict[str, Any]],
    reverse: bool,
    timeout: int,
) -> tuple[dict[str, str], dict[str, int]]:
    payload_items = prompt_items(items, reverse)
    prompt = (
        "从候选中判断中文菜谱原料的同一基础食材身份。只能返回candidate_id或固定状态。"
        "如果原词没有提供候选所需的品种、用途、物种或部位信息，必须返回ambiguous；"
        "组合原料返回composite，调味料或油返回excluded，烹饪辅料返回auxiliary。"
        "不得根据常见程度猜测未写出的具体形态。输入："
        + json.dumps(payload_items, ensure_ascii=False, separators=(",", ":"))
    )
    request_payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "/no_think 只输出符合JSON Schema的对象，不要解释。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0,
        "max_tokens": max(500, len(items) * 40),
        "chat_template_kwargs": {"enable_thinking": False},
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "stage3_controlled_identity_decisions",
                "strict": True,
                "schema": response_schema(items),
            },
        },
    }
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(request_payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = json.loads(response.read().decode("utf-8"))
    message = body["choices"][0]["message"]
    parsed = json.loads(str(message.get("content") or message.get("reasoning_content") or ""))
    results = parsed.get("results")
    expected = {str(item["cleaned_name"]) for item in items}
    if not isinstance(results, dict) or set(results) != expected:
        raise ValueError("阶段三模型结果未一一覆盖输入")
    usage = body.get("usage") or {}
    return {str(key): str(value) for key, value in results.items()}, {
        "prompt_tokens": int(usage.get("prompt_tokens") or 0),
        "completion_tokens": int(usage.get("completion_tokens") or 0),
        "total_tokens": int(usage.get("total_tokens") or 0),
    }


def consensus_results(
    items: list[dict[str, Any]],
    pass_a: dict[str, str],
    pass_b: dict[str, str],
) -> list[dict[str, Any]]:
    output = []
    for item in items:
        name = str(item["cleaned_name"])
        a, b = pass_a[name], pass_b[name]
        candidate_ids = {str(value["candidate_id"]) for value in item["candidates"]}
        if a != b:
            status, decision = "disagreement", None
        elif a in candidate_ids:
            status, decision = "selected_cluster", a
        else:
            status, decision = "isolated", a
        output.append({
            "cleaned_name": name,
            "occurrence_count": int(item["occurrence_count"]),
            "pass_a": a,
            "pass_b": b,
            "status": status,
            "decision": decision,
            "isolation_reason": decision if status == "isolated" else None,
        })
    return output


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-batches", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--model", default="mlx-qwen3.5-27b-claude-4.6-opus-reasoning-distilled-v2")
    parser.add_argument("--endpoint", default="http://127.0.0.1:1234/v1/chat/completions")
    parser.add_argument("--timeout", type=int, default=900)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.model_batches.is_file():
        print("阶段三模型批次不存在", file=sys.stderr)
        return 2
    if args.out_dir.exists() or args.timeout <= 0:
        print("拒绝覆盖阶段三模型结果目录，且timeout必须大于0", file=sys.stderr)
        return 2
    try:
        batches = [json.loads(line) for line in args.model_batches.read_text(encoding="utf-8").splitlines() if line]
        args.out_dir.mkdir(parents=True)
        all_results = []
        usage_total = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        for batch in batches:
            items = list(batch["items"])
            pass_a, usage_a = call_model(args.endpoint, args.model, items, False, args.timeout)
            pass_b, usage_b = call_model(args.endpoint, args.model, items, True, args.timeout)
            batch_id = str(batch["batch_id"])
            (args.out_dir / f"{batch_id}.pass_a.json").write_text(
                json.dumps(pass_a, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            (args.out_dir / f"{batch_id}.pass_b.json").write_text(
                json.dumps(pass_b, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            all_results.extend(consensus_results(items, pass_a, pass_b))
            for key in usage_total:
                usage_total[key] += usage_a[key] + usage_b[key]
        consensus = {
            "contract": "recipeIngredientStage3ModelConsensus/v1",
            "policy_id": POLICY_ID,
            "model": args.model,
            "items": all_results,
        }
        (args.out_dir / "consensus.json").write_text(
            json.dumps(consensus, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        manifest = {
            "contract": "recipeIngredientStage3ModelManifest/v1",
            "policy_id": POLICY_ID,
            "model": args.model,
            "batch_count": len(batches),
            "result_count": len(all_results),
            "selected_cluster_count": sum(item["status"] == "selected_cluster" for item in all_results),
            "isolated_count": sum(item["status"] == "isolated" for item in all_results),
            "disagreement_count": sum(item["status"] == "disagreement" for item in all_results),
            "external_api_token_cost": 0,
            "local_model_usage": usage_total,
        }
        (args.out_dir / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(json.dumps(manifest, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, KeyError, json.JSONDecodeError, urllib.error.URLError) as error:
        print(f"阶段三本地模型执行失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
