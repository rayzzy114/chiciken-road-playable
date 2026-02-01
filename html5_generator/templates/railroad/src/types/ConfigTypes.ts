// The structure of the customizable data
export interface IAssetManifest {
    images: Record<string, string>;
    audio: Record<string, string>;
}

export interface IThemeConfig {
    id: string;
    name: string;
    assets: IAssetManifest;
    colors: {
        background: number | string;
        uiPrimary: string;
        uiSecondary: string;
        text: string;
    };
}

export interface ILocales {
    [key: string]: {
        startBtn: string;
        jumpBtn: string;
        winTitle: string;
        winCta: string;
        balanceLabel: string;
        multiplierLabel: string;
        [key: string]: string;
    };
}

export interface IUserConfig {
    language: string; // Dynamic language code
    currency: string;      // e.g. "$", "R$", "€", "₸"
    startingBalance: number;
    defaultBet: number;
    minBet: number;
    maxBet: number;
    themeId: string;
    
    // SECURITY FLAGS
    isWatermarked: boolean; // If true, show giant "DEMO" text and limit gameplay
}

export interface IGameConfig {
    user: IUserConfig;
    core: {
        maxSteps: number;
        verticalCenter: number;
        cameraZoom: {
            portrait: number;
            landscape: number;
        };
        trackSpacing: number;
    };
}