#!/usr/bin/env python3
"""校验食材发布包，并通过 CloudBase CLI 幂等导入允许的集合。"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Iterator


ALLOWED_COLLECTIONS = (
    "data_releases",
    "food_nutrition_profiles",
    "ingredient_catalog",
    "canine_ingredient_policies",
    "nutrient_rankings",
    "human_recipes",
)
DEFAULT_MAX_COMMAND_BYTES = 700_000
VERSION_FIELDS = {
    "data_releases": "release_id",
    "food_nutrition_profiles": "release_id",
    "ingredient_catalog": "catalog_version",
    "canine_ingredient_policies": "policy_version",
    "nutrient_rankings": "ranking_version",
    "human_recipes": "recipe_version",
}
ROLLBACK_CANDIDATE_FIELDS = (
    "release_id",
    "profile_release_id",
    "catalog_version",
    "policy_version",
    "ranking_version",
    "recipe_version",
    "mapping_version",
)
TRANSIENT_CLI_ERRORS = (
    "请求超时",
    "ECONNRESET",
    "ETIMEDOUT",
    "socket hang up",
)
MAX_CLI_ATTEMPTS = 2


def is_transient_cli_error(value: object) -> bool:
    detail = str(value)
    return any(marker in detail for marker in TRANSIENT_CLI_ERRORS)


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


def validate_pending_collections(
    manifest: dict[str, Any], allow_pending: bool
) -> None:
    pending = manifest.get("pending_collections", [])
    if not isinstance(pending, list):
        raise ValueError("导入清单 pending_collections 必须是数组")
    if pending and not allow_pending:
        raise ValueError(
            "发布包仍有未完成集合，拒绝导入：" + ", ".join(map(str, pending))
        )


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


def validate_collection_documents(path: Path, collection: str) -> None:
    seen: set[str] = set()
    versions: set[str] = set()
    version_field = VERSION_FIELDS[collection]
    for document in iter_documents(path):
        document_id = str(document["_id"])
        if document_id in seen:
            raise ValueError(f"集合文件包含重复 _id：{collection}/{document_id}")
        seen.add(document_id)
        version = str(document.get(version_field, ""))
        if not version:
            raise ValueError(f"集合文档缺少 {version_field}：{collection}/{document_id}")
        versions.add(version)
        if collection == "data_releases":
            rollback_candidate = document.get("rollback_candidate")
            if not isinstance(rollback_candidate, dict):
                raise ValueError(
                    f"发布记录缺少完整 rollback_candidate：{document_id}"
                )
            missing = [
                field for field in ROLLBACK_CANDIDATE_FIELDS
                if not str(rollback_candidate.get(field, "")).strip()
            ]
            if rollback_candidate.get("status") != "active" or missing:
                raise ValueError(
                    f"发布记录 rollback_candidate 不是完整 active 组合：{document_id}"
                    + ("，缺少：" + ", ".join(missing) if missing else "")
                )
    if len(versions) != 1:
        raise ValueError(
            f"{collection} 必须且只能包含一个 {version_field}：{sorted(versions)}"
        )


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
    for attempt in range(1, MAX_CLI_ATTEMPTS + 1):
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
        detail = "\n".join(
            value.strip()
            for value in (result.stderr, result.stdout)
            if value and value.strip()
        )
        if result.returncode == 0:
            break
        transient = is_transient_cli_error(detail)
        if not transient or attempt == MAX_CLI_ATTEMPTS:
            raise RuntimeError(f"CloudBase CLI 执行失败：{detail}")
        delay_seconds = attempt * 2
        print(
            f"CloudBase CLI 网络错误，第 {attempt}/{MAX_CLI_ATTEMPTS} 次失败，"
            f"{delay_seconds} 秒后重试",
            file=sys.stderr,
            flush=True,
        )
        time.sleep(delay_seconds)

    json_start = result.stdout.find("{")
    if json_start < 0:
        raise RuntimeError(f"CloudBase CLI 未返回 JSON：{result.stdout.strip()}")
    payload = json.loads(result.stdout[json_start:])
    if payload.get("error"):
        raise RuntimeError(f"CloudBase 返回错误：{payload['error']}")
    return payload


def count_collection(
    tcb_bin: Path,
    env_id: str,
    collection: str,
    query: dict[str, Any] | None = None,
) -> int:
    mongo_command = json.dumps(
        {"count": collection, "query": query or {}}, separators=(",", ":")
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
    start_batch: int,
) -> None:
    processed = 0
    version_query: dict[str, Any] | None = None
    for batch_number, (documents, command) in enumerate(
        iter_batches(collection, path, max_command_bytes), start=1
    ):
        version_field = VERSION_FIELDS.get(collection)
        if version_field and version_query is None:
            versions = {str(document.get(version_field, "")) for document in documents}
            if len(versions) != 1 or not next(iter(versions)):
                raise ValueError(f"{collection} 批次必须且只能包含一个 {version_field}")
            version_query = {version_field: next(iter(versions))}
        if batch_number < start_batch:
            processed += len(documents)
            continue
        expected_after_batch = processed + len(documents)
        try:
            run_tcb(tcb_bin, env_id, command)
        except RuntimeError as error:
            if not is_transient_cli_error(error) or version_query is None:
                raise
            actual_after_timeout = count_collection(
                tcb_bin, env_id, collection, version_query
            )
            if actual_after_timeout < expected_after_batch:
                raise
            print(
                f"{collection}: 批次 {batch_number} 响应超时，"
                f"线上计数 {actual_after_timeout} 已确认提交",
                flush=True,
            )
        processed = expected_after_batch
        print(
            f"{collection}: 批次 {batch_number} 完成，已处理 {processed}/{expected_rows}",
            flush=True,
        )

    actual_rows = count_collection(tcb_bin, env_id, collection, version_query)
    if actual_rows != expected_rows:
        raise RuntimeError(
            f"集合计数校验失败：{collection}，预期 {expected_rows}，实际 {actual_rows}"
        )
    print(f"{collection}: 导入并校验完成，共 {actual_rows} 条", flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package-dir", type=Path, required=True)
    parser.add_argument("--env-id")
    parser.add_argument("--tcb-bin", type=Path)
    parser.add_argument(
        "--collection",
        action="append",
        choices=ALLOWED_COLLECTIONS,
        dest="collections",
        help="可重复指定；默认导入白名单中的全部集合",
    )
    parser.add_argument(
        "--max-command-bytes", type=int, default=DEFAULT_MAX_COMMAND_BYTES
    )
    parser.add_argument(
        "--start-batch",
        type=int,
        default=1,
        help="从指定批次继续幂等导入；仅在已按同一包和批次大小核对线上计数后使用",
    )
    parser.add_argument(
        "--preflight-only",
        action="store_true",
        help="只校验 manifest、SHA-256、行数、文档 ID 和批次大小，不写 CloudBase",
    )
    parser.add_argument(
        "--allow-pending",
        action="store_true",
        help="显式允许导入仍有 pending 集合的局部 staging 包",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.max_command_bytes <= 0 or args.max_command_bytes >= 900_000:
        print("--max-command-bytes 必须在 1 到 899999 之间", file=sys.stderr)
        return 1
    if args.start_batch <= 0:
        print("--start-batch 必须为正整数", file=sys.stderr)
        return 1
    if not args.preflight_only:
        if not args.env_id:
            print("非 preflight 模式必须提供 --env-id", file=sys.stderr)
            return 1
        if args.tcb_bin is None or not args.tcb_bin.is_file():
            print(f"CloudBase CLI 不存在：{args.tcb_bin}", file=sys.stderr)
            return 1

    try:
        manifest = load_manifest(args.package_dir)
        validate_pending_collections(manifest, args.allow_pending)
        collections = args.collections or list(ALLOWED_COLLECTIONS)
        for collection in collections:
            path, expected_rows = validate_collection_file(
                args.package_dir, collection, manifest
            )
            validate_collection_documents(path, collection)
            preflight_rows = 0
            preflight_batches = 0
            for documents, _command in iter_batches(
                collection, path, args.max_command_bytes
            ):
                preflight_rows += len(documents)
                preflight_batches += 1
            if preflight_rows != expected_rows:
                raise ValueError(f"集合预检批次数量不匹配：{collection}")
            if args.preflight_only:
                print(
                    f"{collection}: 预检完成，共 {expected_rows} 条，{preflight_batches} 个批次",
                    flush=True,
                )
                continue
            import_collection(
                args.tcb_bin,
                args.env_id,
                collection,
                path,
                expected_rows,
                args.max_command_bytes,
                args.start_batch,
            )
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as error:
        print(f"导入失败：{error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
