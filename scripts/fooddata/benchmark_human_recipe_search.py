#!/usr/bin/env python3
"""对人饭搜索投影执行可重复的本地性能基准；不访问 CloudBase、不修改数据。"""
from __future__ import annotations

import argparse
import json
import statistics
import time
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--jsonl", type=Path, required=True)
    parser.add_argument("--queries", nargs="+", default=["鸡肉", "番茄", "不存在的词"])
    parser.add_argument("--iterations", type=int, default=20)
    args = parser.parse_args()
    rows = [json.loads(line) for line in args.jsonl.open() if line.strip()]
    samples = []
    counts = {}
    for query in args.queries:
        durations = []
        for _ in range(max(1, args.iterations)):
            started = time.perf_counter()
            needle = query.casefold()
            count = sum(1 for row in rows if needle in str(row.get("search_text", "")).casefold())
            durations.append((time.perf_counter() - started) * 1000)
        samples.extend(durations)
        counts[query] = count
    samples.sort()
    p95 = samples[min(len(samples) - 1, int(len(samples) * 0.95))]
    report = {
        "rows": len(rows), "queries": counts, "iterations": args.iterations,
        "min_ms": round(min(samples), 3), "median_ms": round(statistics.median(samples), 3),
        "p95_ms": round(p95, 3), "max_ms": round(max(samples), 3),
        "local_gate_ms": 100,
        "local_gate_pass": p95 <= 100,
        "cloud_gate_ms": 1500,
        "cloud_gate_requires_remote_probe": True,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["local_gate_pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
