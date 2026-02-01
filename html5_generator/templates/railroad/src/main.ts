import { Game } from './Game';
import { UIManager } from './UIManager';
import './styles.css';

// TypeScript Entry Point
const init = () => {
    // @ts-ignore
    if (window.__GAME_INIT__) return;
    // @ts-ignore
    window.__GAME_INIT__ = true;
    
    UIManager.createUI();
    const game = new Game("game-canvas");
    game.init();
};

if (document.readyState === "complete") {
    init();
} else {
    window.addEventListener("DOMContentLoaded", init);
}
