from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


def _get_env(key: str, default: str | None = None) -> str:
    value = os.getenv(key, default)
    if value is None or value == "":
        raise RuntimeError(f"Missing environment variable: {key}")
    return value


def _get_env_number(key: str, default: str | None = None) -> int:
    raw = _get_env(key, default)
    try:
        return int(raw)
    except ValueError as exc:
        raise RuntimeError(f"Invalid numeric environment variable: {key}") from exc


@dataclass(frozen=True)
class Prices:
    single: int = 349
    sub: int = 659


@dataclass(frozen=True)
class Wallets:
    usdt_trc20: str = "TCxtQLvqh9ppYPXuJMoaLNYyWFWZx6JZYW"
    btc: str = "bc1qe4gjhyndedl57hlw8qep5cctkxmxazxx02fx89"


@dataclass(frozen=True)
class Config:
    bot_token: str
    admin_user: str
    admin_pass: str
    port: int
    admin_telegram_id: int
    prices: Prices
    wallets: Wallets
    crypto_pay_api_token: str
    crypto_pay_api_base: str
    crypto_pay_fiat: str
    crypto_pay_accepted_assets: str
    log_level: str
    polling_timeout: int


def load_config() -> Config:
    return Config(
        bot_token=_get_env("BOT_TOKEN"),
        admin_user=_get_env("ADMIN_USER"),
        admin_pass=_get_env("ADMIN_PASS"),
        port=_get_env_number("PORT", "3000"),
        admin_telegram_id=_get_env_number("ADMIN_TELEGRAM_ID", "1146462744"),
        prices=Prices(),
        wallets=Wallets(),
        crypto_pay_api_token=os.getenv("CRYPTO_PAY_API_TOKEN", "").strip(),
        crypto_pay_api_base=os.getenv("CRYPTO_PAY_API_BASE", "https://pay.crypt.bot/api").strip(),
        crypto_pay_fiat=os.getenv("CRYPTO_PAY_FIAT", "USD").strip(),
        crypto_pay_accepted_assets=os.getenv(
            "CRYPTO_PAY_ACCEPTED_ASSETS",
            "USDT,TON,BTC,ETH,LTC,BNB,TRX,USDC",
        ).strip(),
        log_level=os.getenv("PY_LOG_LEVEL", "INFO").strip() or "INFO",
        polling_timeout=_get_env_number("PY_POLLING_TIMEOUT", "30"),
    )


CONFIG = load_config()

