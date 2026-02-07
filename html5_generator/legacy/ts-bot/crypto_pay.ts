import { CONFIG } from "./config.js";

type CryptoPayApiError = {
    code?: number;
    name?: string;
};

type CryptoPayApiResponse<T> = {
    ok: boolean;
    result?: T;
    error?: CryptoPayApiError;
};

type JsonObject = Record<string, unknown>;

export type CryptoPayInvoice = {
    invoiceId: number;
    status: string;
    payUrl: string;
};

type CreateInvoiceParams = {
    amountUsd: number;
    description: string;
    payload: string;
    expiresInSeconds?: number;
};

const DEFAULT_API_BASE = "https://pay.crypt.bot/api";
const DEFAULT_FIAT = "USD";

function getApiToken(): string {
    return typeof CONFIG.CRYPTO_PAY_API_TOKEN === "string" ? CONFIG.CRYPTO_PAY_API_TOKEN.trim() : "";
}

function getApiBase(): string {
    const raw =
        typeof CONFIG.CRYPTO_PAY_API_BASE === "string" && CONFIG.CRYPTO_PAY_API_BASE.trim()
            ? CONFIG.CRYPTO_PAY_API_BASE.trim()
            : DEFAULT_API_BASE;
    return raw.replace(/\/+$/, "");
}

function getFiat(): string {
    return typeof CONFIG.CRYPTO_PAY_FIAT === "string" && CONFIG.CRYPTO_PAY_FIAT.trim()
        ? CONFIG.CRYPTO_PAY_FIAT.trim().toUpperCase()
        : DEFAULT_FIAT;
}

function getAcceptedAssets(): string {
    return typeof CONFIG.CRYPTO_PAY_ACCEPTED_ASSETS === "string" ? CONFIG.CRYPTO_PAY_ACCEPTED_ASSETS.trim() : "";
}

function asRecord(input: unknown): JsonObject | null {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    return input as JsonObject;
}

function parseInvoice(input: unknown): CryptoPayInvoice | null {
    const invoice = asRecord(input);
    if (!invoice) return null;

    const rawId = invoice.invoice_id ?? invoice.id;
    const invoiceId = Number(rawId);
    if (!Number.isFinite(invoiceId) || invoiceId <= 0) return null;

    const status = typeof invoice.status === "string" ? invoice.status : "unknown";
    const payUrl = [
        invoice.pay_url,
        invoice.bot_invoice_url,
        invoice.mini_app_invoice_url,
        invoice.web_app_invoice_url,
    ].find((v) => typeof v === "string" && /^https?:\/\//.test(v));

    if (typeof payUrl !== "string") return null;

    return {
        invoiceId,
        status,
        payUrl,
    };
}

async function callCryptoPay<T>(method: string, params: JsonObject): Promise<T> {
    const token = getApiToken();
    if (!token) throw new Error("CRYPTO_PAY_DISABLED");

    const response = await fetch(`${getApiBase()}/${method}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Crypto-Pay-API-Token": token,
        },
        body: JSON.stringify(params),
    });

    let payload: CryptoPayApiResponse<T>;
    try {
        payload = (await response.json()) as CryptoPayApiResponse<T>;
    } catch {
        throw new Error(`CRYPTO_PAY_BAD_RESPONSE:${method}`);
    }

    if (!response.ok || !payload.ok || payload.result === undefined) {
        const code = payload.error?.code ?? "unknown";
        const name = payload.error?.name ?? "unknown";
        throw new Error(`CRYPTO_PAY_API_ERROR:${method}:${code}:${name}`);
    }

    return payload.result;
}

export function isCryptoPayEnabled(): boolean {
    return getApiToken().length > 0;
}

export async function createCryptoPayInvoice(params: CreateInvoiceParams): Promise<CryptoPayInvoice> {
    if (!Number.isFinite(params.amountUsd) || params.amountUsd <= 0) {
        throw new Error("CRYPTO_PAY_INVALID_AMOUNT");
    }

    const body: JsonObject = {
        currency_type: "fiat",
        fiat: getFiat(),
        amount: params.amountUsd.toFixed(2),
        description: params.description,
        payload: params.payload,
    };

    const acceptedAssets = getAcceptedAssets();
    if (acceptedAssets) body.accepted_assets = acceptedAssets;

    if (Number.isFinite(params.expiresInSeconds ?? NaN) && (params.expiresInSeconds as number) > 0) {
        body.expires_in = Math.floor(params.expiresInSeconds as number);
    }

    const result = await callCryptoPay<unknown>("createInvoice", body);
    const invoice = parseInvoice(result);
    if (!invoice) throw new Error("CRYPTO_PAY_INVALID_INVOICE_RESPONSE");

    return invoice;
}

export async function getCryptoPayInvoice(invoiceId: number): Promise<CryptoPayInvoice | null> {
    if (!Number.isFinite(invoiceId) || invoiceId <= 0) return null;

    const result = await callCryptoPay<unknown>("getInvoices", {
        invoice_ids: String(Math.floor(invoiceId)),
    });

    const data = asRecord(result);
    if (!data) return null;
    const items = Array.isArray(data.items) ? data.items : [];
    if (items.length === 0) return null;

    const exact = items.find((item) => {
        const parsed = parseInvoice(item);
        return parsed?.invoiceId === Math.floor(invoiceId);
    });

    return parseInvoice(exact ?? items[0]);
}
