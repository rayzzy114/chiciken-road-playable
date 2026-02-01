export const GAMES = {
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
} as const;

export const CATEGORIES = {
    CHICKEN: 'cat_chicken',
    PLINKO: 'cat_plinko',
    SLOTS: 'cat_slots',
    MATCHING: 'cat_matching'
} as const;

export const GEOS = [
    { id: 'en_usd', name: '🇺🇸 Global', lang: 'en', currency: '$', label: 'EN | USD' },
    { id: 'pt_brl', name: '🇧🇷 Brazil', lang: 'pt', currency: 'R$', label: 'PT | BRL' },
    { id: 'es_eur', name: '🇪🇸 Spain/Latam', lang: 'es', currency: '€', label: 'ES | EUR' },
] as const;

export const ASSETS = {
    WELCOME: 'welcome_img',
    PROFILE: 'profile_img'
} as const;
