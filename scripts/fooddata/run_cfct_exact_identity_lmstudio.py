#!/usr/bin/env python3
"""用 LM Studio 对 CFCT 精确身份候选执行双次判断和第三次裁决。"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


POLICY_ID = "cfctExactIdentityControlledModel/v1"
FIXED = ("variable_processed", "state_conversion", "insufficient_evidence")


def choices(item: dict[str, Any]) -> list[str]:
    return [*(v["choice_id"] for v in item["concept_candidates"]), *(v["choice_id"] for v in item["source_candidates"]), *FIXED]


def schema(items: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "object", "additionalProperties": False, "required": ["results"], "properties": {"results": {"type": "object", "additionalProperties": False, "required": [v["cleaned_name"] for v in items], "properties": {v["cleaned_name"]: {"type": "string", "enum": choices(v)} for v in items}}}}


def prompt_items(items: list[dict[str, Any]], mode: int) -> list[dict[str, Any]]:
    output = []
    for item in items:
        concepts = list(item["concept_candidates"]); sources = list(item["source_candidates"])
        if mode == 1: concepts.reverse(); sources.reverse()
        elif mode == 2: concepts = concepts[1:] + concepts[:1]; sources = sources[1:] + sources[:1]
        output.append({
            "cleaned_name": item["cleaned_name"], "source_terms": item["source_terms"],
            "existing_concepts": concepts, "cfct_sources": sources,
        })
    return output


def call(endpoint: str, model: str, items: list[dict[str, Any]], mode: int, timeout: int) -> tuple[dict[str, str], dict[str, int]]:
    prompt = (
        "判断中文菜谱原料对应的唯一食品身份。concept: 表示应并入既有标准概念；source: 表示该 CFCT 食品是独立且唯一身份，可建立新概念。"
        "配方随品牌变化的加工品返回 variable_processed；身份明确但生熟干湿状态与来源不一致返回 state_conversion；证据不足返回 insufficient_evidence。"
        "只能返回输入枚举，不得编造概念或来源。输入：" + json.dumps(prompt_items(items, mode), ensure_ascii=False, separators=(",", ":"))
    )
    payload = {"model": model, "messages": [{"role": "system", "content": "/no_think 只输出符合 JSON Schema 的对象，不解释。"}, {"role": "user", "content": prompt}], "temperature": 0, "max_tokens": max(800, len(items) * 60), "chat_template_kwargs": {"enable_thinking": False}, "response_format": {"type": "json_schema", "json_schema": {"name": "cfct_exact_identity", "strict": True, "schema": schema(items)}}}
    request = urllib.request.Request(endpoint, data=json.dumps(payload, ensure_ascii=False).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response: body = json.loads(response.read().decode())
    message = body["choices"][0]["message"]
    parsed = json.loads(str(message.get("content") or message.get("reasoning_content") or ""))["results"]
    expected = {v["cleaned_name"] for v in items}
    if set(parsed) != expected: raise ValueError("CFCT 模型结果没有逐项覆盖")
    for item in items:
        if parsed[item["cleaned_name"]] not in choices(item): raise ValueError("CFCT 模型返回了候选外决定")
    usage = body.get("usage") or {}
    return {str(k): str(v) for k, v in parsed.items()}, {k: int(usage.get(k) or 0) for k in ("prompt_tokens", "completion_tokens", "total_tokens")}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-batches", type=Path, required=True); parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--model", default="mlx-qwen3.5-27b-claude-4.6-opus-reasoning-distilled-v2")
    parser.add_argument("--endpoint", default="http://127.0.0.1:1234/v1/chat/completions"); parser.add_argument("--timeout", type=int, default=900)
    args = parser.parse_args()
    if args.out_dir.exists() or not args.model_batches.is_file(): print("模型批次不存在或结果目录已存在", file=sys.stderr); return 2
    try:
        batches = [json.loads(line) for line in args.model_batches.read_text(encoding="utf-8").splitlines() if line]
        args.out_dir.mkdir(parents=True); results = []; usage = {k: 0 for k in ("prompt_tokens", "completion_tokens", "total_tokens")}
        for batch in batches:
            items = batch["items"]; a, ua = call(args.endpoint, args.model, items, 0, args.timeout); b, ub = call(args.endpoint, args.model, items, 1, args.timeout)
            disagree = [item for item in items if a[item["cleaned_name"]] != b[item["cleaned_name"]]]
            c, uc = call(args.endpoint, args.model, disagree, 2, args.timeout) if disagree else ({}, {k: 0 for k in usage})
            for key in usage: usage[key] += ua[key] + ub[key] + uc[key]
            for item in items:
                name = item["cleaned_name"]; votes = [a[name], b[name], *( [c[name]] if name in c else [])]
                decision = next((value for value in set(votes) if votes.count(value) >= 2), "insufficient_evidence")
                results.append({"cleaned_name": name, "pass_a": a[name], "pass_b": b[name], "adjudication": c.get(name), "decision": decision, "status": "selected" if decision.startswith(("concept:", "source:")) else decision})
            (args.out_dir / f"{batch['batch_id']}.json").write_text(json.dumps({"pass_a": a, "pass_b": b, "adjudication": c}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        final = {"contract": "cfctExactIdentityModelDecisions/v1", "policy_id": POLICY_ID, "model": args.model, "items": results}
        (args.out_dir / "decisions.json").write_text(json.dumps(final, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        manifest = {"contract": "cfctExactIdentityModelManifest/v1", "policy_id": POLICY_ID, "model": args.model, "input_group_count": len(results), "terminal_group_count": len(results), "selected_count": sum(v["status"] == "selected" for v in results), "isolated_count": sum(v["status"] != "selected" for v in results), "external_api_token_cost": 0, "local_model_usage": usage}
        (args.out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(manifest, ensure_ascii=False, indent=2)); return 0
    except (OSError, ValueError, KeyError, json.JSONDecodeError, urllib.error.URLError) as error:
        print(f"CFCT 精确身份模型执行失败：{error}", file=sys.stderr); return 1


if __name__ == "__main__": raise SystemExit(main())
