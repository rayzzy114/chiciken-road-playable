export class UIManager {
    static createUI() {
        const wrapper = document.createElement('div');
        wrapper.id = 'game-wrapper';
        wrapper.innerHTML = `
            <canvas id="game-canvas"></canvas>
            
            <div id="game-objects-layer">
                <!-- Entities now handled in PixiJS -->
            </div>

            <div id="ui-layer">
                <div class="hud-top">
                    <div class="balance-box">
                        <span class="label">Balance</span>
                        <span class="value" id="balance-display">1000</span>
                    </div>
                    <div class="multiplier-box">
                        <span class="label">Multiplier</span>
                        <span class="value" id="current-multiplier">1.00x</span>
                    </div>
                </div>

                <div id="center-message" style="position:absolute; top:40%; left:50%; transform:translate(-50%, -50%); text-align:center; display:none;">
                     <img src="" id="win-img" style="max-width:200px;">
                </div>

                <div class="controls-bottom">
                    <div class="mode-select">
                        <button class="mode-btn active" data-mode="low">LOW</button>
                        <button class="mode-btn" data-mode="medium">MED</button>
                        <button class="mode-btn" data-mode="high">HIGH</button>
                        <button class="mode-btn" data-mode="extreme">EXT</button>
                    </div>

                    <div class="bet-controls">
                        <button class="bet-btn" id="btn-minus">-</button>
                        <span id="bet-amount">10</span>
                        <button class="bet-btn" id="btn-plus">+</button>
                    </div>

                    <div class="action-row">
                        <button id="action-btn">START</button>
                        <button id="withdraw-btn">WITHDRAW</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(wrapper);
    }
}
