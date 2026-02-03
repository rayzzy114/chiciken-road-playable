"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ASSETS = exports.GEOS = exports.CATEGORIES = exports.GAMES = void 0;
exports.GAMES = {
    RAILROAD: {
        ID: 'game_railroad',
        THEME: 'chicken_farm',
        ASSET_KEY: 'railroad_preview'
    },
    PLINKO: {
        ID: 'game_plinko_classic',
    },
    OLYMPUS: {
        ID: 'game_olympus',
    },
    DRAG: {
        ID: 'game_drag',
    },
    MATCH3: {
        ID: 'game_match3',
    }
};
exports.CATEGORIES = {
    CHICKEN: 'cat_chicken',
    PLINKO: 'cat_plinko',
    SLOTS: 'cat_slots',
    MATCHING: 'cat_matching'
};
exports.GEOS = [
    { id: 'en_usd', name: '🇺🇸 Global', lang: 'en', currency: '$', label: 'EN | USD' },
    { id: 'pt_brl', name: '🇧🇷 Brazil', lang: 'pt', currency: 'R$', label: 'PT | BRL' },
    { id: 'es_eur', name: '🇪🇸 Spain/Latam', lang: 'es', currency: '€', label: 'ES | EUR' },
];
exports.ASSETS = {
    WELCOME: 'welcome_img',
    PROFILE: 'profile_img'
};
