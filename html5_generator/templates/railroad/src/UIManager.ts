import { GameConfig, getCurrentTheme, getCurrentLocale } from './Config';

export class UIManager {
    static createUI() {
        const theme = getCurrentTheme();
        const locale = getCurrentLocale();
        const wrapper = document.createElement('div');
        
        // Dynamic CSS Variables based on Theme
        const style = `
            --primary: ${theme.colors.uiPrimary};
            --secondary: ${theme.colors.uiSecondary};
            --text: ${theme.colors.text};
        `;
        
        wrapper.id = 'game-wrapper';
        wrapper.style.cssText = style;
        
        // Format money with currency
        const formatMoney = (amount: number) => {
            return `${amount} ${GameConfig.user.currency}`;
        };
        
        wrapper.innerHTML = `
            <canvas id="game-canvas"></canvas>
            
            ${GameConfig.user.isWatermarked ? '<div id="watermark-overlay">PREVIEW MODE • PURCHASE TO UNLOCK</div>' : ''}

            <div id="ui-layer">
                <div class="hud">
                    <div class="stat-box">
                        <div class="label">${locale.balanceLabel}</div>
                        <div class="value" id="balance-display">${formatMoney(GameConfig.user.startingBalance)}</div>
                    </div>
                    <div class="stat-box">
                        <div class="label">${locale.multiplierLabel}</div>
                        <div class="value" id="current-multiplier">1.0x</div>
                    </div>
                </div>
                
                <div class="controls">
                     <div class="bet-input">
                        <span>${GameConfig.user.currency}</span>
                        <span id="bet-display">${GameConfig.user.defaultBet}</span>
                     </div>
                    <button id="action-btn" class="main-btn">
                        ${locale.startBtn}
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(wrapper);

        // Add CSS for Watermark
        const styleSheet = document.createElement("style");
        styleSheet.innerText = `
            #watermark-overlay {
                position: absolute;
                top: 50%; left: 50%;
                transform: translate(-50%, -50%) rotate(-45deg);
                font-size: 40px;
                color: rgba(255, 0, 0, 0.3);
                font-weight: 900;
                pointer-events: none;
                z-index: 9999;
                white-space: nowrap;
                text-transform: uppercase;
                border: 5px solid rgba(255, 0, 0, 0.3);
                padding: 20px;
            }
            /* ... (add other styles from previous css here) ... */
        `;
        document.head.appendChild(styleSheet);
    }
}