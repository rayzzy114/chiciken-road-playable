from bot_py.helpers import (
    build_order_summary,
    build_profile_message,
    calc_price,
    create_initial_session,
    get_discount,
    parse_pay_callback,
)


def test_create_initial_session() -> None:
    assert create_initial_session() == {"config": {}}


def test_get_discount_thresholds() -> None:
    assert get_discount(0) == 0
    assert get_discount(2) == 0
    assert get_discount(3) == 10
    assert get_discount(10) == 20


def test_calc_price() -> None:
    assert calc_price(100, 10) == 90
    assert calc_price(99, 10) == 89


def test_build_order_summary() -> None:
    assert build_order_summary({}) is None
    summary = build_order_summary({"themeId": "cyber_city"})
    assert summary is not None
    assert "<b>Стиль:</b> cyber_city" in summary
    assert "<b>Язык:</b> en" in summary
    assert "<b>Баланс:</b> 1000 $" in summary


def test_build_profile_message() -> None:
    message = build_profile_message(42, 3, 15, "mybot")
    assert "<b>ID:</b> 42" in message
    assert "<b>Заказы:</b> 3" in message
    assert "<b>Баланс:</b> $15" in message
    assert "<b>Реф-ссылка:</b> t.me/mybot?start=42" in message


def test_parse_pay_callback() -> None:
    assert parse_pay_callback("pay_single_ord_1") == {"type": "single", "orderId": "ord_1"}
    assert parse_pay_callback("pay_sub_abc_def") == {"type": "sub", "orderId": "abc_def"}
    assert parse_pay_callback("pay_other_1") is None
    assert parse_pay_callback("pay_single_") is None
    assert parse_pay_callback("invalid") is None

