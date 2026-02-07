from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import DateTime, Float, Integer, String, func, select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str | None] = mapped_column(String, nullable=True)
    first_name: Mapped[str | None] = mapped_column("firstName", String, nullable=True)
    wallet_balance: Mapped[float] = mapped_column("walletBalance", Float, default=0)
    subscription_end: Mapped[datetime] = mapped_column("subscriptionEnd", DateTime, default=lambda: datetime.now(UTC))
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, default=lambda: datetime.now(UTC))
    referrer_id: Mapped[int | None] = mapped_column("referrerId", nullable=True)


class Order(Base):
    __tablename__ = "orders"

    order_id: Mapped[str] = mapped_column("orderId", String, primary_key=True)
    user_id: Mapped[int] = mapped_column("userId")
    game_type: Mapped[str] = mapped_column("gameType", String)
    theme_id: Mapped[str] = mapped_column("themeId", String)
    config_json: Mapped[str] = mapped_column("configJson", String)
    status: Mapped[str] = mapped_column(String, default="pending")
    amount: Mapped[int] = mapped_column(Integer, default=0)
    discount_applied: Mapped[int] = mapped_column("discountApplied", Integer, default=0)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, default=lambda: datetime.now(UTC))


class Log(Base):
    __tablename__ = "logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column("userId")
    action: Mapped[str] = mapped_column(String)
    details: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime, default=lambda: datetime.now(UTC))


class AssetCache(Base):
    __tablename__ = "asset_cache"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    file_id: Mapped[str] = mapped_column("fileId", String)
    updated_at: Mapped[datetime] = mapped_column("updatedAt", DateTime, default=lambda: datetime.now(UTC))


class CategoryDiscount(Base):
    __tablename__ = "category_discounts"

    category: Mapped[str] = mapped_column(String, primary_key=True)
    percent: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column("updatedAt", DateTime, default=lambda: datetime.now(UTC))


def _db_url() -> str:
    db_file = Path.cwd() / "data" / "bot.db"
    return f"sqlite+aiosqlite:///{db_file.as_posix()}"


engine: AsyncEngine = create_async_engine(_db_url(), future=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


def _now() -> datetime:
    return datetime.now(tz=UTC)


def _clamp_discount(value: int) -> int:
    return max(0, min(90, int(value)))


class DBError(RuntimeError):
    pass


@dataclass(slots=True)
class UserStats:
    orders_paid: int
    referrals_count: int
    wallet_balance: float


class DB:
    @staticmethod
    async def upsert_user(user_id: int, username: str | None = None, first_name: str | None = None) -> None:
        async with SessionLocal() as session:
            user = await session.scalar(select(User).where(User.id == user_id))
            if user is None:
                session.add(User(id=user_id, username=username, first_name=first_name))
            else:
                user.username = username
                user.first_name = first_name
            await session.commit()

    @staticmethod
    async def set_referrer(user_id: int, referrer_id: int) -> bool:
        if user_id == referrer_id:
            return False
        async with SessionLocal() as session:
            user = await session.scalar(select(User).where(User.id == user_id))
            if user is None or user.referrer_id is not None:
                return False
            ref_exists = await session.scalar(select(User.id).where(User.id == referrer_id))
            if ref_exists is None:
                return False
            user.referrer_id = referrer_id
            await session.commit()
            return True

    @staticmethod
    async def get_user_stats(user_id: int) -> UserStats:
        async with SessionLocal() as session:
            user = await session.scalar(select(User).where(User.id == user_id))
            paid_orders = await session.scalar(
                select(func.count())
                .select_from(Order)
                .where(Order.user_id == user_id, Order.status.like("paid%"))
            )
            referrals = await session.scalar(
                select(func.count()).select_from(User).where(User.referrer_id == user_id)
            )

        return UserStats(
            orders_paid=int(paid_orders or 0),
            referrals_count=int(referrals or 0),
            wallet_balance=float(user.wallet_balance if user else 0),
        )

    @staticmethod
    async def add_referral_reward(user_id: int, amount: float) -> None:
        async with SessionLocal() as session:
            user = await session.scalar(select(User).where(User.id == user_id))
            if not user or user.referrer_id is None:
                return
            reward = amount * 0.22
            referrer = await session.scalar(select(User).where(User.id == user.referrer_id))
            if referrer is None:
                return
            referrer.wallet_balance += reward
            await session.commit()
        await DB.log_action(user.referrer_id, "referral_reward", f"Received ${reward} from user {user_id}")

    @staticmethod
    async def create_order(order_id: str, user_id: int, game: str, theme: str, config: dict[str, Any]) -> None:
        async with SessionLocal() as session:
            session.add(
                Order(
                    order_id=order_id,
                    user_id=user_id,
                    game_type=game,
                    theme_id=theme,
                    config_json=json.dumps(config, ensure_ascii=False),
                )
            )
            await session.commit()

    @staticmethod
    async def mark_paid(order_id: str, status: str, amount: int, discount: int) -> None:
        async with SessionLocal() as session:
            order = await session.scalar(select(Order).where(Order.order_id == order_id))
            if order is None:
                raise DBError("ORDER_NOT_FOUND")
            order.status = status
            order.amount = int(amount)
            order.discount_applied = int(discount)
            await session.commit()

    @staticmethod
    async def set_order_status(order_id: str, status: str) -> None:
        async with SessionLocal() as session:
            order = await session.scalar(select(Order).where(Order.order_id == order_id))
            if order is None:
                raise DBError("ORDER_NOT_FOUND")
            order.status = status
            await session.commit()

    @staticmethod
    async def update_order_config(order_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        async with SessionLocal() as session:
            order = await session.scalar(select(Order).where(Order.order_id == order_id))
            if order is None:
                raise DBError("ORDER_NOT_FOUND")

            current_config = json.loads(order.config_json)
            if not isinstance(current_config, dict):
                current_config = {}
            next_config = {**current_config, **patch}
            order.config_json = json.dumps(next_config, ensure_ascii=False)
            await session.commit()
            return next_config

    @staticmethod
    async def finalize_paid_order(
        order_id: str,
        user_id: int,
        status: str,
        amount: int,
        discount: int,
    ) -> dict[str, float]:
        async with SessionLocal() as session:
            async with session.begin():
                order = await session.scalar(select(Order).where(Order.order_id == order_id))
                if order is None:
                    raise DBError("ORDER_NOT_FOUND")
                if order.user_id != user_id:
                    raise DBError("ORDER_USER_MISMATCH")
                if order.status.startswith("paid"):
                    raise DBError("ORDER_ALREADY_PAID")

                user = await session.scalar(select(User).where(User.id == user_id))
                if user is None:
                    raise DBError("USER_NOT_FOUND")
                if user.wallet_balance < amount:
                    raise DBError("INSUFFICIENT_FUNDS")

                user.wallet_balance -= amount
                order.status = status
                order.amount = amount
                order.discount_applied = discount

                return {"newBalance": user.wallet_balance}

    @staticmethod
    async def finalize_external_paid_order(
        order_id: str,
        user_id: int,
        status: str,
        amount: int,
        discount: int,
    ) -> None:
        async with SessionLocal() as session:
            async with session.begin():
                order = await session.scalar(select(Order).where(Order.order_id == order_id))
                if order is None:
                    raise DBError("ORDER_NOT_FOUND")
                if order.user_id != user_id:
                    raise DBError("ORDER_USER_MISMATCH")
                if order.status.startswith("paid"):
                    raise DBError("ORDER_ALREADY_PAID")

                order.status = status
                order.amount = amount
                order.discount_applied = discount

    @staticmethod
    async def get_order(order_id: str) -> dict[str, Any] | None:
        async with SessionLocal() as session:
            order = await session.scalar(select(Order).where(Order.order_id == order_id))
            if order is None:
                return None
            config = json.loads(order.config_json)
            return {
                "orderId": order.order_id,
                "userId": order.user_id,
                "gameType": order.game_type,
                "themeId": order.theme_id,
                "config": config if isinstance(config, dict) else {},
                "status": order.status,
                "amount": order.amount,
                "discountApplied": order.discount_applied,
                "createdAt": order.created_at,
            }

    @staticmethod
    async def log_action(user_id: int, action: str, details: str = "") -> None:
        try:
            async with SessionLocal() as session:
                session.add(Log(user_id=user_id, action=action, details=details))
                await session.commit()
        except Exception:
            # Logging must not break bot flow.
            return

    @staticmethod
    async def get_last_log_by_action(user_id: int, action: str) -> dict[str, Any] | None:
        async with SessionLocal() as session:
            entry = await session.scalar(
                select(Log)
                .where(Log.user_id == user_id, Log.action == action)
                .order_by(Log.created_at.desc())
                .limit(1)
            )
            if entry is None:
                return None
            return {
                "id": entry.id,
                "userId": entry.user_id,
                "action": entry.action,
                "details": entry.details or "",
                "createdAt": entry.created_at,
            }

    @staticmethod
    async def get_asset(key: str) -> str | None:
        async with SessionLocal() as session:
            entry = await session.scalar(select(AssetCache).where(AssetCache.key == key))
            return entry.file_id if entry else None

    @staticmethod
    async def set_asset(key: str, file_id: str) -> None:
        async with SessionLocal() as session:
            entry = await session.scalar(select(AssetCache).where(AssetCache.key == key))
            if entry is None:
                session.add(AssetCache(key=key, file_id=file_id, updated_at=_now()))
            else:
                entry.file_id = file_id
                entry.updated_at = _now()
            await session.commit()

    @staticmethod
    async def get_category_discount(category: str) -> int:
        async with SessionLocal() as session:
            entry = await session.scalar(
                select(CategoryDiscount).where(CategoryDiscount.category == category)
            )
            if not entry:
                return 0
            return _clamp_discount(entry.percent)

    @staticmethod
    async def set_category_discount(category: str, percent: int) -> int:
        normalized = _clamp_discount(percent)
        async with SessionLocal() as session:
            entry = await session.scalar(
                select(CategoryDiscount).where(CategoryDiscount.category == category)
            )
            if entry is None:
                session.add(
                    CategoryDiscount(category=category, percent=normalized, updated_at=_now())
                )
            else:
                entry.percent = normalized
                entry.updated_at = _now()
            await session.commit()
        return normalized

    @staticmethod
    async def count_orders_by_status(user_id: int, status: str) -> int:
        async with SessionLocal() as session:
            count = await session.scalar(
                select(func.count())
                .select_from(Order)
                .where(Order.user_id == user_id, Order.status == status)
            )
            return int(count or 0)

    @staticmethod
    async def increment_user_balance(user_id: int, amount: float) -> None:
        async with SessionLocal() as session:
            async with session.begin():
                user = await session.scalar(select(User).where(User.id == user_id))
                if user is None:
                    raise DBError("USER_NOT_FOUND")
                user.wallet_balance += amount
