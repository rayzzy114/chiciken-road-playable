import { Game } from './Game.js';
import { UIManager } from './UIManager.js';
import './styles.css';

const initGame = () => {
  UIManager.createUI();
  const game = new Game("game-canvas");
  game.init();
};

const onReady = () => {
  if (window.mraid && typeof window.mraid.getState === "function") {
    if (window.mraid.getState() === "loading") {
      window.mraid.addEventListener("ready", initGame);
      return;
    }
  }
  initGame();
};

window.addEventListener("DOMContentLoaded", onReady);
