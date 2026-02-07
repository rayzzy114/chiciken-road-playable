import { Application, Container, Rectangle } from 'pixi.js';
import { gsap } from 'gsap';
import { CONFIG } from '../config.js';
import { Assets } from './Assets.js';
import { EventBus } from './EventBus.js';
import { ResizeManager } from './ResizeManager.js';
import { GameState } from './State.js';
import { IdleSystem } from './IdleSystem.js';
import { SoundManager } from './SoundManager.js';
import { openClickThrough } from './openClickThrough.js';
import { BootScene } from '../scenes/BootScene.js';
import { PreloaderScene } from '../scenes/PreloaderScene.js';
import { GameplayScene } from '../scenes/GameplayScene.js';
import { EndcardScene } from '../scenes/EndcardScene.js';

export class App {
  constructor() {
    this.app = null;
    this.mainContainer = new Container();
    this.assets = new Assets();
    this.bus = new EventBus();
    this.resizeManager = null;
    this.state = new GameState(CONFIG, this.bus);
    this.idleSystem = new IdleSystem(this.bus);
    this.sound = new SoundManager(CONFIG);
    this.scenes = {};
    this.currentScene = null;
  }

  async init() {
    this.app = new Application();
    await this.app.init({
      resizeTo: window,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      backgroundColor: CONFIG.colors.background,
      antialias: true
    });

    document.body.appendChild(this.app.canvas);
    this.app.stage.addChild(this.mainContainer);
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = new Rectangle(0, 0, CONFIG.design.width, CONFIG.design.height);
    this.app.stage.on('pointerdown', () => this.bus.emit('pointer:any'));

    this.resizeManager = new ResizeManager(this.app, this.mainContainer, CONFIG.design);
    this.resizeManager.onResize((data) => this.bus.emit('resize', data));
    window.addEventListener('resize', () => this.resizeManager.resize());
    this.bus.on('scene:switch', (name) => this.switchScene(name));

    await this.loadFonts();
    await this.assets.load();

    this.scenes.boot = new BootScene(this.assets, this.bus);
    this.scenes.preloader = new PreloaderScene(this.assets, this.bus);
    this.scenes.gameplay = new GameplayScene(this.assets, this.bus, this.state, this.idleSystem, this.sound);
    this.scenes.endcard = new EndcardScene(this.assets, this.bus);

    this.switchScene('boot', false);
    this.resizeManager.resize();
    this.idleSystem.start(CONFIG.interaction.idleTimeout);
  }

  async loadFonts() {
    try {
      if (document.fonts) {
        await document.fonts.load(`16px "${CONFIG.ui.fontFamily}"`);
      }
    } catch (err) {
      console.warn('Font load failed:', err);
    }
  }

  switchScene(name, animate = true) {
    const next = this.scenes[name];
    if (!next) return;

    if (this.currentScene) {
      const prev = this.currentScene;
      const removePrev = () => {
        this.mainContainer.removeChild(prev);
        prev.onExit();
      };

      if (animate) {
        gsap.to(prev, {
          alpha: 0,
          duration: 0.25,
          ease: 'power2.out',
          onComplete: removePrev
        });
      } else {
        removePrev();
      }
    }

    this.currentScene = next;
    next.alpha = 0;
    this.mainContainer.addChild(next);
    next.onEnter();

    if (animate) {
      gsap.to(next, { alpha: 1, duration: 0.25, ease: 'power2.out' });
    } else {
      next.alpha = 1;
    }
  }
}
