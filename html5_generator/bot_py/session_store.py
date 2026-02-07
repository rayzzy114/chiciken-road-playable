from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

from .helpers import create_initial_session


class FileSessionStore:
    def __init__(self, sessions_dir: Path) -> None:
        self._sessions_dir = sessions_dir
        self._sessions_dir.mkdir(parents=True, exist_ok=True)
        self._locks: defaultdict[int, asyncio.Lock] = defaultdict(asyncio.Lock)

    def _path_for(self, user_id: int) -> Path:
        return self._sessions_dir / f"{user_id}.json"

    async def get(self, user_id: int) -> dict[str, Any]:
        path = self._path_for(user_id)
        if not path.exists():
            return create_initial_session()

        async with self._locks[user_id]:
            try:
                data = await asyncio.to_thread(path.read_text, encoding="utf-8")
                parsed = json.loads(data)
            except Exception:
                return create_initial_session()

        if not isinstance(parsed, dict):
            return create_initial_session()
        if "config" not in parsed or not isinstance(parsed.get("config"), dict):
            parsed["config"] = {}
        return parsed

    async def save(self, user_id: int, session_data: dict[str, Any]) -> None:
        path = self._path_for(user_id)
        temp_path = path.with_suffix(".tmp")
        payload = json.dumps(session_data, ensure_ascii=False, separators=(",", ":"))

        async with self._locks[user_id]:
            await asyncio.to_thread(temp_path.write_text, payload, encoding="utf-8")
            await asyncio.to_thread(temp_path.replace, path)

