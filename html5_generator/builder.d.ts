export interface IOrderConfig {
    language: string;
    currency: string;
    startingBalance: number;
    themeId: string;
    isWatermarked: boolean;
}

export interface IOrder {
    id: string;
    config: IOrderConfig;
}

export function generatePlayable(order: IOrder): string | null;
