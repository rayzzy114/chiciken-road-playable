from __future__ import annotations

from typing import Final

GAMES: Final = {
    "RAILROAD": {
        "ID": "game_railroad",
        "GAME_KEY": "railroad",
        "THEME": "chicken_farm",
        "ASSET_KEY": "railroad_preview",
        "TITLE": "Chicken Railroad",
    },
    "PLINKO": {
        "ID": "game_plinko_classic",
        "GAME_KEY": "plinko",
        "THEME": "plinko_classic",
        "TITLE": "Classic Plinko",
    },
    "OLYMPUS": {
        "ID": "game_olympus",
        "GAME_KEY": "olympus",
        "THEME": "gate_of_olympus",
        "TITLE": "Gates of Olympus",
    },
    "DRAG": {
        "ID": "game_drag",
        "GAME_KEY": "matching",
        "THEME": "money_drag",
        "TITLE": "Money Matching",
    },
    "MATCH3": {
        "ID": "game_match3",
        "GAME_KEY": "match3",
        "THEME": "3_v_ryad",
        "TITLE": "3 v ryad",
    },
}

CATEGORIES: Final = {
    "CHICKEN": "cat_chicken",
    "PLINKO": "cat_plinko",
    "SLOTS": "cat_slots",
    "MATCHING": "cat_matching",
}

GEOS: Final = [
    {"id": "en_usd", "name": "🇺🇸 Global", "lang": "en", "currency": "$", "label": "EN | USD"},
    {"id": "pt_brl", "name": "🇧🇷 Brazil", "lang": "pt", "currency": "R$", "label": "PT | BRL"},
    {"id": "es_eur", "name": "🇪🇸 Spain/Latam", "lang": "es", "currency": "€", "label": "ES | EUR"},
]

ASSETS: Final = {
    "WELCOME": "welcome_img",
    "PROFILE": "profile_img",
}

