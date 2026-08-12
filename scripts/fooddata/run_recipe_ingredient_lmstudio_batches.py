#!/usr/bin/env python3
"""使用 LM Studio 本地模型零 API token 执行原料身份归一批次。"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


RUNNER_CONTRACT = "recipeIngredientLMStudioBatchRunner/v1"


def load_batches(path: Path) -> list[dict[str, Any]]:
    batches = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]
    if not batches:
        raise ValueError("模型批次为空")
    return batches


def schema_for(names: list[str]) -> dict[str, Any]:
    nullable_string = {"anyOf": [{"type": "string"}, {"type": "null"}]}
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["results"],
        "properties": {
            "results": {
                "type": "object",
                "additionalProperties": False,
                "required": names,
                "properties": {name: nullable_string for name in names},
            }
        },
    }


def call_local_model(
    endpoint: str,
    model: str,
    terms: list[dict[str, Any]],
    timeout: int,
) -> dict[str, str | None]:
    names = [str(item["cleaned_name"]) for item in terms]
    prompt = (
        "归一以下中文菜谱原料。值为普通基础食材名或null。"
        "去掉品牌、数量、用途、刀工、生熟、骨皮、脂肪比例；"
        "保留会改变食材身份或烹饪用途的种类、动物、部位和制品类型，"
        "例如低筋面粉仍是低筋面粉，奶粉仍是奶粉，五花肉仍是五花肉；"
        "同一食材别名统一，例如虾仁归为虾。"
        "牛奶、青椒、红椒、排骨、淡奶油等常见明确食材直接保留，不要因为存在脂肪、"
        "品种或部位差异而返回null。只有肉、鱼、青菜、馅料等真正上位词，以及菜名、"
        "复合加工食品、调味料、油和无法识别的项目为null。"
        "每个键必须原样保留且恰好出现一次。输入："
        + json.dumps(names, ensure_ascii=False, separators=(",", ":"))
    )
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "/no_think 只输出符合JSON Schema的对象，不要解释。",
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0,
        "max_tokens": max(1000, len(names) * 20),
        "chat_template_kwargs": {"enable_thinking": False},
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "ingredient_identities",
                "strict": True,
                "schema": schema_for(names),
            },
        },
    }
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise ValueError(f"LM Studio HTTP {error.code}: {detail[:500]}") from error
    message = body["choices"][0]["message"]
    content = str(message.get("content") or message.get("reasoning_content") or "")
    parsed = json.loads(content)
    results = parsed.get("results")
    if not isinstance(results, dict) or set(results) != set(names):
        raise ValueError(
            f"本地模型未一一覆盖输入：expected={len(names)}, actual={len(results or {})}"
        )
    normalized: dict[str, str | None] = {}
    for name in names:
        value = results[name]
        normalized[name] = str(value).strip() if value is not None else None
        if normalized[name] == "":
            normalized[name] = None
    return normalized


def standard_results(values: dict[str, str | None]) -> dict[str, Any]:
    return {
        "results": [
            {
                "cleaned_name": name,
                "base_name_zh": base_name,
                "status": "resolved" if base_name else "unresolved",
                "resolution_reason": "本地模型归一" if base_name else "身份不足",
            }
            for name, base_name in values.items()
        ]
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-batches", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument(
        "--model",
        default="mlx-qwen3.5-27b-claude-4.6-opus-reasoning-distilled-v2",
    )
    parser.add_argument(
        "--endpoint", default="http://127.0.0.1:1234/v1/chat/completions"
    )
    parser.add_argument("--chunk-size", type=int, default=50)
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument("--limit-chunks", type=int)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.model_batches.is_file():
        print("模型批次不存在", file=sys.stderr)
        return 2
    if args.chunk_size <= 0 or args.timeout <= 0:
        print("chunk-size 和 timeout 必须大于0", file=sys.stderr)
        return 2
    try:
        batches = load_batches(args.model_batches)
        args.out_dir.mkdir(parents=True, exist_ok=True)
        chunks_done = 0
        stopped_early = False
        for batch in batches:
            batch_id = str(batch["batch_id"])
            terms = list(batch["terms"])
            batch_values: dict[str, str | None] = {}
            for offset in range(0, len(terms), args.chunk_size):
                chunk_index = offset // args.chunk_size + 1
                chunk_path = args.out_dir / f"{batch_id}.part_{chunk_index:03d}.json"
                chunk_terms = terms[offset : offset + args.chunk_size]
                if chunk_path.exists():
                    values = json.loads(chunk_path.read_text(encoding="utf-8"))
                else:
                    if args.limit_chunks is not None and chunks_done >= args.limit_chunks:
                        stopped_early = True
                        break
                    values = call_local_model(
                        args.endpoint, args.model, chunk_terms, args.timeout
                    )
                    chunk_path.write_text(
                        json.dumps(values, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8",
                    )
                expected = {str(item["cleaned_name"]) for item in chunk_terms}
                if set(values) != expected:
                    raise ValueError(f"缓存分片不匹配：{chunk_path.name}")
                batch_values.update(values)
                chunks_done += 1
                print(
                    f"已完成 {batch_id} 分片 {chunk_index}，累计 {chunks_done}",
                    flush=True,
                )
            if stopped_early:
                break
            target = args.out_dir / f"{batch_id}.json"
            target.write_text(
                json.dumps(standard_results(batch_values), ensure_ascii=False, indent=2)
                + "\n",
                encoding="utf-8",
            )
        if not stopped_early:
            manifest = {
                "contract": RUNNER_CONTRACT,
                "model": args.model,
                "api_token_cost": 0,
                "batch_count": len(batches),
                "result_count": sum(len(batch["terms"]) for batch in batches),
                "chunk_count": chunks_done,
            }
            (args.out_dir / "manifest.json").write_text(
                json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            print(json.dumps(manifest, ensure_ascii=False, indent=2))
        return 0
    except (
        OSError,
        KeyError,
        json.JSONDecodeError,
        urllib.error.URLError,
        ValueError,
    ) as error:
        print(f"LM Studio 模型批次执行失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
