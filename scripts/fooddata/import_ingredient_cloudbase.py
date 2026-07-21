#!/usr/bin/env python3
"""校验食材发布包，并通过 CloudBase CLI 幂等导入允许的集合。"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Iterator


ALLOWED_COLLECTIONS = ("data_releases", "food_nutrition_profiles")
DEFAULT_MAX_COMMAND_BYTES = 700_000


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_manifest(package_dir: Path) -> dict[str, Any]:
    path = package_dir / "cloudbase-ingredient-import-manifest.json"
    if not path.is_file():
        raise ValueError(f"找不到导入清单：{path}")
    return json.loads(path.read_text(encoding="utf-8"))


def validate_collection_file(
    package_dir: Path, collection: str, manifest: dict[str, Any]
) -> tuple[Path, int]:
    metadata = manifest.get("collections", {}).get(collection)
    if not metadata:
        raise ValueError(f"导入清单中缺少集合：{collection}")

    path = package_dir / metadata["file"]
    if not path.is_file():
        raise ValueError(f"找不到集合数据文件：{path}")
    if sha256_file(path) != metadata["sha256"]:
        raise ValueError(f"集合文件 SHA-256 不匹配：{collection}")

    with path.open("r", encoding="utf-8") as source:
        row_count = sum(1 for line in source if line.strip())
    expected_rows = int(metadata["rows"])
    if row_count != expected_rows:
        raise ValueError(
            f"集合行数不匹配：{collection}，预期 {expected_rows}，实际 {row_count}"
        )
    return path, expected_rows


def iter_documents(path: Path) -> Iterator[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as source:
        for line_number, line in enumerate(source, start=1):
            if not line.strip():
                continue
            document = json.loads(line)
            if not isinstance(document, dict) or not document.get("_id"):
                raise ValueError(f"{path.name}:{line_number} 缺少有效 _id")
            yield document


def build_command(collection: str, documents: list[dict[str, Any]]) -> str:
    updates = []
    for document in documents:
        document_id = document["_id"]
        fields = {key: value for key, value in document.items() if key != "_id"}
        updates.append(
            {
                "q": {"_id": document_id},
                "u": {"$set": fields},
                "upsert": True,
            }
        )
    mongo_command = json.dumps(
        {"update": collection, "updates": updates, "ordered": True},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return json.dumps(
        [
            {
                "TableName": collection,
                "CommandType": "UPDATE",
                "Command": mongo_command,
            }
        ],
        ensure_ascii=False,
        separators=(",", ":"),
    )


def iter_batches(
    collection: str, path: Path, max_command_bytes: int
) -> Iterator[tuple[list[dict[str, Any]], str]]:
    batch: list[dict[str, Any]] = []
    for document in iter_documents(path):
        candidate = batch + [document]
        command = build_command(collection, candidate)
        if len(command.encode("utf-8")) > max_command_bytes:
            if not batch:
                raise ValueError(f"单条文档超过命令大小限制：{document['_id']}")
            yield batch, build_command(collection, batch)
            batch = [document]
        else:
            batch = candidate
    if batch:
        yield batch, build_command(collection, batch)


def run_tcb(tcb_bin: Path, env_id: str, command: str) -> dict[str, Any]:
    result = subprocess.run(
        [
            str(tcb_bin),
            "-e",
            env_id,
            "db",
            "nosql",
            "execute",
            "--json",
            "--command",
            command,
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(f"CloudBase CLI 执行失败：{detail}")

    json_start = result.stdout.find("{")
    if json_start < 0:
        raise RuntimeError(f"CloudBase CLI 未返回 JSON：{result.stdout.strip()}")
    payload = json.loads(result.stdout[json_start:])
    if payload.get("error"):
        raise RuntimeError(f"CloudBase 返回错误：{payload['error']}")
    return payload


def count_collection(tcb_bin: Path, env_id: str, collection: str) -> int:
    mongo_command = json.dumps(
        {"count": collection, "query": {}}, separators=(",", ":")
    )
    command = json.dumps(
        [
            {
                "TableName": collection,
                "CommandType": "COMMAND",
                "Command": mongo_command,
            }
        ],
        separators=(",", ":"),
    )
    payload = run_tcb(tcb_bin, env_id, command)
    result = payload["data"]["results"][0][0]["n"]
    if isinstance(result, dict):
        result = result.get("$numberInt", result.get("$numberLong"))
    return int(result)


def import_collection(
    tcb_bin: Path,
    env_id: str,
    collection: str,
    path: Path,
    expected_rows: int,
    max_command_bytes: int,
) -> None:
    imported = 0
    for batch_number, (documents, command) in enumerate(
        iter_batches(collection, path, max_command_bytes), start=1
    ):
        run_tcb(tcb_bin, env_id, command)
        imported += len(documents)
        print(
            f"{collection}: 批次 {batch_number} 完成，已处理 {imported}/{expected_rows}",
            flush=True,
        )

    actual_rows = count_collection(tcb_bin, env_id, collection)
    if actual_rows != expected_rows:
        raise RuntimeError(
            f"集合计数校验失败：{collection}，预期 {expected_rows}，实际 {actual_rows}"
        )
    print(f"{collection}: 导入并校验完成，共 {actual_rows} 条", flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package-dir", type=Path, required=True)
    parser.add_argument("--env-id", required=True)
    parser.add_argument("--tcb-bin", type=Path, required=True)
    parser.add_argument(
        "--collection",
        action="append",
        choices=ALLOWED_COLLECTIONS,
        dest="collections",
        help="可重复指定；默认导入白名单中的两个集合",
    )
    parser.add_argument(
        "--max-command-bytes", type=int, default=DEFAULT_MAX_COMMAND_BYTES
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.tcb_bin.is_file():
        print(f"CloudBase CLI 不存在：{args.tcb_bin}", file=sys.stderr)
        return 1
    if args.max_command_bytes <= 0 or args.max_command_bytes >= 900_000:
        print("--max-command-bytes 必须在 1 到 899999 之间", file=sys.stderr)
        return 1

    try:
        manifest = load_manifest(args.package_dir)
        collections = args.collections or list(ALLOWED_COLLECTIONS)
        for collection in collections:
            path, expected_rows = validate_collection_file(
                args.package_dir, collection, manifest
            )
            import_collection(
                args.tcb_bin,
                args.env_id,
                collection,
                path,
                expected_rows,
                args.max_command_bytes,
            )
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as error:
        print(f"导入失败：{error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
