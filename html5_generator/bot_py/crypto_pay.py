from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from .config import CONFIG

DEFAULT_API_BASE = "https://pay.crypt.bot/api"
DEFAULT_FIAT = "USD"


@dataclass(slots=True)
class CryptoPayInvoice:
    invoice_id: int
    status: str
    pay_url: str


@dataclass(slots=True)
class CreateInvoiceParams:
    amount_usd: int
    description: str
    payload: str
    expires_in_seconds: int = 3600


def _get_api_token() -> str:
    return CONFIG.crypto_pay_api_token.strip()


def _get_api_base() -> str:
    raw = CONFIG.crypto_pay_api_base.strip() if CONFIG.crypto_pay_api_base.strip() else DEFAULT_API_BASE
    return raw.rstrip("/")


def _get_fiat() -> str:
    raw = CONFIG.crypto_pay_fiat.strip()
    return raw.upper() if raw else DEFAULT_FIAT


def _get_accepted_assets() -> str:
    return CONFIG.crypto_pay_accepted_assets.strip()


def _as_record(data: Any) -> dict[str, Any] | None:
    if isinstance(data, dict):
        return data
    return None


def _parse_invoice(raw: Any) -> CryptoPayInvoice | None:
    invoice = _as_record(raw)
    if not invoice:
        return None

    raw_id = invoice.get("invoice_id", invoice.get("id"))
    try:
        invoice_id = int(raw_id)
    except (TypeError, ValueError):
        return None
    if invoice_id <= 0:
        return None

    status = str(invoice.get("status", "unknown"))
    pay_url = ""
    for field in ("pay_url", "bot_invoice_url", "mini_app_invoice_url", "web_app_invoice_url"):
        value = invoice.get(field)
        if isinstance(value, str) and value.startswith(("http://", "https://")):
            pay_url = value
            break
    if not pay_url:
        return None

    return CryptoPayInvoice(invoice_id=invoice_id, status=status, pay_url=pay_url)


async def _call_crypto_pay(method: str, params: dict[str, Any]) -> Any:
    token = _get_api_token()
    if not token:
        raise RuntimeError("CRYPTO_PAY_DISABLED")

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{_get_api_base()}/{method}",
            headers={
                "Content-Type": "application/json",
                "Crypto-Pay-API-Token": token,
            },
            json=params,
        )

    try:
        payload = response.json()
    except Exception as exc:
        raise RuntimeError(f"CRYPTO_PAY_BAD_RESPONSE:{method}") from exc

    if not isinstance(payload, dict):
        raise RuntimeError(f"CRYPTO_PAY_BAD_RESPONSE:{method}")

    if not response.is_success or not payload.get("ok") or payload.get("result") is None:
        error = payload.get("error")
        if isinstance(error, dict):
            code = error.get("code", "unknown")
            name = error.get("name", "unknown")
        else:
            code = "unknown"
            name = "unknown"
        raise RuntimeError(f"CRYPTO_PAY_API_ERROR:{method}:{code}:{name}")

    return payload["result"]


def is_crypto_pay_enabled() -> bool:
    return len(_get_api_token()) > 0


async def create_crypto_pay_invoice(params: CreateInvoiceParams) -> CryptoPayInvoice:
    if params.amount_usd <= 0:
        raise RuntimeError("CRYPTO_PAY_INVALID_AMOUNT")

    payload: dict[str, Any] = {
        "currency_type": "fiat",
        "fiat": _get_fiat(),
        "amount": f"{params.amount_usd:.2f}",
        "description": params.description,
        "payload": params.payload,
    }

    accepted_assets = _get_accepted_assets()
    if accepted_assets:
        payload["accepted_assets"] = accepted_assets

    if params.expires_in_seconds > 0:
        payload["expires_in"] = int(params.expires_in_seconds)

    result = await _call_crypto_pay("createInvoice", payload)
    invoice = _parse_invoice(result)
    if not invoice:
        raise RuntimeError("CRYPTO_PAY_INVALID_INVOICE_RESPONSE")
    return invoice


async def get_crypto_pay_invoice(invoice_id: int) -> CryptoPayInvoice | None:
    if invoice_id <= 0:
        return None

    result = await _call_crypto_pay("getInvoices", {"invoice_ids": str(int(invoice_id))})
    data = _as_record(result)
    if not data:
        return None
    items = data.get("items")
    if not isinstance(items, list) or not items:
        return None

    for item in items:
        parsed = _parse_invoice(item)
        if parsed and parsed.invoice_id == int(invoice_id):
            return parsed

    return _parse_invoice(items[0])

