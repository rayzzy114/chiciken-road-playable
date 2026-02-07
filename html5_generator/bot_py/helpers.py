from __future__ import annotations

from pathlib import Path
from typing import Any

DEFAULT_STARTING_BALANCE = 1000
DEFAULT_CURRENCY = "$"
MAX_CURRENCY_LENGTH = 5


def create_initial_session() -> dict[str, Any]:
    return {"config": {}}


def sanitize_currency_input(input_value: str, max_len: int = MAX_CURRENCY_LENGTH) -> str:
    trimmed = input_value.strip()
    if not trimmed:
        return DEFAULT_CURRENCY
    return trimmed[:max_len]


def parse_balance_input(input_value: str, fallback: int = DEFAULT_STARTING_BALANCE) -> int:
    digits = "".join(ch for ch in input_value if ch.isdigit())
    if not digits:
        return fallback
    numeric = int(digits)
    if numeric <= 0:
        return fallback
    return numeric


def get_discount(count: int) -> int:
    if count >= 10:
        return 20
    if count >= 3:
        return 10
    return 0


def calc_price(base: int, disc: int) -> int:
    return int(base * (1 - disc / 100))


def build_order_summary(order_config: dict[str, Any]) -> str | None:
    theme_id = order_config.get("themeId")
    if not theme_id:
        return None
    language = order_config.get("language", "en")
    balance = order_config.get("startingBalance", DEFAULT_STARTING_BALANCE)
    currency = order_config.get("currency", DEFAULT_CURRENCY)
    return (
        "<b>Заказ готов:</b>\n"
        f"<b>Стиль:</b> {theme_id}\n"
        f"<b>Язык:</b> {language}\n"
        f"<b>Баланс:</b> {balance} {currency}"
    )


def build_profile_message(user_id: int, orders_paid: int, wallet_balance: float, bot_username: str) -> str:
    return (
        "<b>Профиль:</b>\n"
        f"<b>ID:</b> {user_id}\n"
        f"<b>Заказы:</b> {orders_paid}\n"
        f"<b>Баланс:</b> ${wallet_balance}\n"
        f"<b>Реф-ссылка:</b> t.me/{bot_username}?start={user_id}"
    )


def get_library_path(game_id: str, geo_id: str, is_watermarked: bool) -> str | None:
    root = Path.cwd()
    filename = f"{geo_id}_{'preview' if is_watermarked else 'final'}.html"
    full_path = root / "library" / game_id / filename
    if full_path.exists():
        return str(full_path)
    return None


def parse_pay_callback(data: str) -> dict[str, str] | None:
    parts = data.split("_")
    if len(parts) < 3:
        return None
    pay_type = parts[1]
    if pay_type not in {"single", "sub"}:
        return None
    order_id = "_".join(parts[2:])
    if not order_id:
        return None
    return {"type": pay_type, "orderId": order_id}

