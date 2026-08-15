#!/usr/bin/env python3
"""用 LM Studio 为上位词或省略词执行双次受控判断，并对分歧项第三次裁决。"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


POLICY_ID = "genericAmbiguousControlledModel/v1"
FIXED = (
    "needs_controlled_default",
    "composite",
    "alternative",
    "state_conversion",
    "auxiliary",
    "excluded",
    "insufficient_evidence",
)
USAGE_KEYS = ("prompt_tokens", "completion_tokens", "total_tokens")


def choices(item: dict[str, Any]) -> list[str]:
    return [*(value["choice_id"] for value in item["concept_candidates"]), *FIXED]


def schema(items: list[dict[str, Any]]) -> dict[str, Any]:
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
                    item["cleaned_name"]: {"type": "string", "enum": choices(item)}
                    for item in items
                },
            }
        },
    }


def prompt_items(items: list[dict[str, Any]], mode: int) -> list[dict[str, Any]]:
    output = []
    for item in items:
        candidates = list(item["concept_candidates"])
        if mode == 1:
            candidates.reverse()
        elif mode == 2 and candidates:
            candidates = candidates[1:] + candidates[:1]
        output.append({
            "name": item["cleaned_name"],
            "raw_examples": [
                value.get("example_raw_name") or value["normalized_name"]
                for value in item["source_terms"][:3]
            ],
            "candidates": [
                {
                    "id": value["choice_id"],
                    "name": value["canonical_name_zh"],
                    "category": value["category_code"],
                }
                for value in candidates
            ],
        })
    return output


def call(
    endpoint: str, model: str, items: list[dict[str, Any]], mode: int, timeout: int
) -> tuple[dict[str, str], dict[str, int]]:
    prompt = (
        "逐项判断中文菜谱原料的唯一食品身份。只有候选与原料身份相同（允许菜谱约定俗成的动物种类或部位省略）时才选 concept。"
        "括号用途或规格不改变身份；多种食材并列返回 composite；二选一返回 alternative；生熟干湿或可食部不一致返回 state_conversion；"
        "水、酵母等烹饪辅料返回 auxiliary；调味料和油返回 excluded；明确属于上位词且项目需要约定默认值返回 needs_controlled_default；"
        "没有足够证据或候选不对返回 insufficient_evidence。不得按营养相似度替代，不得编造候选。输入："
        + json.dumps(prompt_items(items, mode), ensure_ascii=False, separators=(",", ":"))
    )
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "/no_think 只输出符合 JSON Schema 的对象，不解释。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0,
        "max_tokens": max(800, len(items) * 45),
        "chat_template_kwargs": {"enable_thinking": False},
        "response_format": {
            "type": "json_schema",
            "json_schema": {"name": "generic_ambiguous_identity", "strict": True, "schema": schema(items)},
        },
    }
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = json.loads(response.read().decode())
    message = body["choices"][0]["message"]
    parsed = json.loads(str(message.get("content") or message.get("reasoning_content") or ""))["results"]
    expected = {item["cleaned_name"] for item in items}
    if set(parsed) != expected:
        raise ValueError("上位词模型结果没有逐项覆盖")
    for item in items:
        if parsed[item["cleaned_name"]] not in choices(item):
            raise ValueError("上位词模型返回了候选外决定")
    usage = body.get("usage") or {}
    return (
        {str(key): str(value) for key, value in parsed.items()},
        {key: int(usage.get(key) or 0) for key in USAGE_KEYS},
    )


def validate_batch_result(batch: dict[str, Any], document: dict[str, Any]) -> None:
    expected = {item["cleaned_name"] for item in batch["items"]}
    for key in ("pass_a", "pass_b"):
        if set(document.get(key, {})) != expected:
            raise ValueError(f"已有批次结果不完整：{batch['batch_id']}/{key}")
    if not set(document.get("adjudication", {})).issubset(expected):
        raise ValueError(f"已有批次裁决越界：{batch['batch_id']}")
    for item in batch["items"]:
        allowed = set(choices(item))
        name = item["cleaned_name"]
        if document["pass_a"][name] not in allowed or document["pass_b"][name] not in allowed:
            raise ValueError(f"已有批次决定越界：{batch['batch_id']}/{name}")
        if name in document["adjudication"] and document["adjudication"][name] not in allowed:
            raise ValueError(f"已有批次裁决决定越界：{batch['batch_id']}/{name}")


def result_items(batch: dict[str, Any], document: dict[str, Any]) -> list[dict[str, Any]]:
    output = []
    for item in batch["items"]:
        name = item["cleaned_name"]
        a = document["pass_a"][name]
        b = document["pass_b"][name]
        c = document["adjudication"].get(name)
        votes = [a, b, *([c] if c else [])]
        decision = next((value for value in votes if votes.count(value) >= 2), "insufficient_evidence")
        output.append({
            "cleaned_name": name,
            "pass_a": a,
            "pass_b": b,
            "adjudication": c,
            "decision": decision,
            "status": "selected" if decision.startswith("concept:") else decision,
        })
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-batches", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--model", default="mlx-qwen3.5-27b-claude-4.6-opus-reasoning-distilled-v2")
    parser.add_argument("--endpoint", default="http://127.0.0.1:1234/v1/chat/completions")
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument("--max-batches", type=int, help="仅运行指定数量的新批次，便于抽样验证")
    args = parser.parse_args()
    if not args.model_batches.is_file() or args.timeout <= 0:
        print("模型批次不存在或超时参数无效", file=sys.stderr)
        return 2
    try:
        batches = [json.loads(line) for line in args.model_batches.read_text(encoding="utf-8").splitlines() if line]
        args.out_dir.mkdir(parents=True, exist_ok=True)
        completed = 0
        newly_run = 0
        results: list[dict[str, Any]] = []
        usage = {key: 0 for key in USAGE_KEYS}
        for batch in batches:
            path = args.out_dir / f"{batch['batch_id']}.json"
            if path.exists():
                document = json.loads(path.read_text(encoding="utf-8"))
                validate_batch_result(batch, document)
            else:
                if args.max_batches is not None and newly_run >= args.max_batches:
                    continue
                items = batch["items"]
                first, usage_a = call(args.endpoint, args.model, items, 0, args.timeout)
                second, usage_b = call(args.endpoint, args.model, items, 1, args.timeout)
                disagree = [item for item in items if first[item["cleaned_name"]] != second[item["cleaned_name"]]]
                third, usage_c = call(args.endpoint, args.model, disagree, 2, args.timeout) if disagree else ({}, {key: 0 for key in USAGE_KEYS})
                document = {
                    "contract": "genericAmbiguousIdentityBatchResult/v1",
                    "batch_id": batch["batch_id"],
                    "pass_a": first,
                    "pass_b": second,
                    "adjudication": third,
                    "usage": {key: usage_a[key] + usage_b[key] + usage_c[key] for key in USAGE_KEYS},
                }
                validate_batch_result(batch, document)
                path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                newly_run += 1
            completed += 1
            results.extend(result_items(batch, document))
            for key in USAGE_KEYS:
                usage[key] += int(document.get("usage", {}).get(key, 0))
            print(f"已完成 {completed}/{len(batches)} 批（本次新增 {newly_run} 批）", flush=True)
        all_complete = completed == len(batches)
        if all_complete:
            final = {
                "contract": "genericAmbiguousIdentityModelDecisions/v1",
                "policy_id": POLICY_ID,
                "model": args.model,
                "items": results,
            }
            (args.out_dir / "decisions.json").write_text(json.dumps(final, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        manifest = {
            "contract": "genericAmbiguousIdentityModelManifest/v1",
            "policy_id": POLICY_ID,
            "model": args.model,
            "batch_count": len(batches),
            "completed_batch_count": completed,
            "newly_run_batch_count": newly_run,
            "input_group_count": sum(len(batch["items"]) for batch in batches),
            "terminal_group_count": len(results),
            "all_complete": all_complete,
            "selected_count": sum(item["status"] == "selected" for item in results),
            "isolated_or_structured_count": sum(item["status"] != "selected" for item in results),
            "external_api_token_cost": 0,
            "local_model_usage": usage,
        }
        (args.out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(manifest, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, KeyError, json.JSONDecodeError, urllib.error.URLError) as error:
        print(f"上位词本地模型执行失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
