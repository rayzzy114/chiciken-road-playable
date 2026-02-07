from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

ROOT_DIR = Path.cwd()
DIST_RUNNER = ROOT_DIR / "dist" / "builder_runner.js"
SRC_RUNNER = ROOT_DIR / "src" / "builder_runner.ts"


def _runner_command() -> list[str]:
    if DIST_RUNNER.exists():
        return ["node", str(DIST_RUNNER)]
    return [
        "node",
        "--loader",
        "ts-node/esm",
        "--experimental-specifier-resolution=node",
        str(SRC_RUNNER),
    ]


async def _run(payload: dict[str, Any]) -> dict[str, Any]:
    cmd = _runner_command()
    process = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=str(ROOT_DIR),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    request = json.dumps(payload).encode("utf-8")
    stdout_data, stderr_data = await process.communicate(request)

    if process.returncode != 0:
        stderr_text = stderr_data.decode("utf-8", errors="ignore").strip()
        raise RuntimeError(f"builder_runner_failed:{stderr_text or process.returncode}")

    out_text = stdout_data.decode("utf-8", errors="ignore").strip()
    if not out_text:
        raise RuntimeError("builder_runner_empty_output")

    try:
        parsed = json.loads(out_text)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"builder_runner_invalid_json:{out_text}") from exc

    if not isinstance(parsed, dict):
        raise RuntimeError("builder_runner_bad_payload")

    return parsed


async def cleanup_temp() -> None:
    response = await _run({"action": "cleanup"})
    if not response.get("ok"):
        raise RuntimeError(str(response.get("error", "cleanup_failed")))


async def generate_playable(order_id: str, config: dict[str, Any]) -> str | None:
    response = await _run(
        {
            "action": "generate",
            "id": order_id,
            "config": config,
        }
    )
    if not response.get("ok"):
        return None
    path = response.get("path")
    if isinstance(path, str) and path:
        return path
    return None

