import * as PIXI from "pixi.js";
import { GifSprite } from "pixi.js/gif";
import gsap from "gsap";

import { GameConfig, getCurrentTheme } from "./Config";

export class Game {
  private canvasId: string;
  private app: PIXI.Application | null = null;
  private world: PIXI.Container | null = null;
  private player: PIXI.Container | null = null;
  private tracks: PIXI.Sprite[] = [];
  
  // State
  private state: "IDLE" | "RUNNING" | "CRASHED" | "WIN" = "IDLE";
  private step: number = 0;
  private bet: number;
  private balance: number;
  private currentMultiplier: number = 1.0;

  // Audio
  private audio: Record<string, HTMLAudioElement> = {};

  constructor(canvasId: string) {
    this.canvasId = canvasId;
    this.bet = GameConfig.user.defaultBet;
    this.balance = GameConfig.user.startingBalance;
  }

  async init() {
    this.app = new PIXI.Application();
    const theme = getCurrentTheme();

    await this.app.init({
      canvas: document.getElementById(this.canvasId) as HTMLCanvasElement,
      width: 1080,
      height: 1920,
      backgroundColor: theme.colors.background,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      resizeTo: document.getElementById("game-wrapper") as HTMLElement,
    });

    await this.loadAssets();
    this.createScene();
    
    // SECURITY: Add Watermark Layer inside Canvas
    if (GameConfig.user.isWatermarked) {
        this.addSecurityLayer();
    }

    this.setupInputs();
    
    this.app.ticker.add((ticker) => this.update(ticker));
    window.addEventListener("resize", () => this.handleResize());
    this.handleResize();
    this.updateUI();
  }

  addSecurityLayer() {
      if (!this.app) return;
      
      const style = new PIXI.TextStyle({
          fontFamily: 'Arial',
          fontSize: 60,
          fontWeight: 'bold',
          fill: '#ff0000',
          align: 'center',
      });

      // Create a pattern of watermarks
      const container = new PIXI.Container();
      container.zIndex = 9999; // Top most
      container.eventMode = 'none'; // Click through

      for(let y = 0; y < 1920; y += 400) {
          for(let x = 0; x < 1080; x += 500) {
              const text = new PIXI.Text({ text: "PREVIEW\nDEMO", style });
              text.alpha = 0.15;
              text.position.set(x, y);
              text.rotation = -0.5;
              container.addChild(text);
          }
      }
      
      this.app.stage.addChild(container);
  }

  async loadAssets() {
    const theme = getCurrentTheme();
    const assets = theme.assets.images;
    
    // Add assets to loader
    Object.entries(assets).forEach(([alias, src]) => {
        PIXI.Assets.add({ alias, src });
    });

    // Load
    try {
        await PIXI.Assets.load(Object.keys(assets));
    } catch (e) {
        console.warn("Some assets failed to load, using fallbacks");
    }

    // Audio Preload
    Object.entries(theme.assets.audio).forEach(([alias, src]) => {
        this.audio[alias] = new Audio(src);
        this.audio[alias].volume = 0.5;
    });
  }

  createScene() {
    if (!this.app) return;
    this.world = new PIXI.Container();
    this.app.stage.addChild(this.world);

    // Ground
    const groundTex = PIXI.Assets.get("ground") || PIXI.Texture.WHITE;
    const ground = new PIXI.TilingSprite({
        texture: groundTex,
        width: this.app.screen.width * 4,
        height: this.app.screen.height
    });
    ground.x = -this.app.screen.width;
    this.world.addChild(ground);

    // Tracks
    this.createTracks();
    
    // Player
    this.createPlayer();
  }

  createTracks() {
      if (!this.world) return;
      const spacing = GameConfig.core.trackSpacing;
      const tex = PIXI.Assets.get("track") || PIXI.Texture.WHITE;

      for (let i = 0; i <= GameConfig.core.maxSteps; i++) {
          const track = new PIXI.Sprite(tex);
          track.anchor.set(0.5, 0.5);
          track.scale.set(0.8);
          track.x = 400 + (i * spacing);
          track.y = 0;
          this.world.addChild(track);
          this.tracks.push(track);
      }
  }

  createPlayer() {
      if (!this.world) return;
      this.player = new PIXI.Container();
      this.player.scale.set(0.5);
      
      const source = PIXI.Assets.get("player_idle");
      let visual: PIXI.Container;
      
      if (source instanceof PIXI.Texture) {
          visual = new PIXI.Sprite(source);
      } else if (source) {
          visual = new GifSprite({ source }); 
      } else {
          visual = new PIXI.Sprite(PIXI.Texture.WHITE); // Fallback
      }
      
      // @ts-ignore
      if(visual.anchor) visual.anchor.set(0.5, 1);
      
      this.player.addChild(visual);
      this.world.addChild(this.player);
  }

  setupInputs() {
      document.getElementById("action-btn")?.addEventListener("click", () => {
          if (this.state === "IDLE") this.startGame();
          else if (this.state === "RUNNING") this.jump();
      });
  }

  startGame() {
      if (this.balance < this.bet) return alert("Low balance");
      this.balance -= this.bet;
      this.state = "RUNNING";
      this.step = 0;
      this.currentMultiplier = 1.0;
      this.playSound("click");
      this.updateUI();
      this.jump(); 
  }

  jump() {
      if (!this.player || this.step >= GameConfig.core.maxSteps) return;
      
      this.step++;
      const nextX = this.tracks[this.step].x;
      const startX = this.player.x;
      const startY = this.player.y;
      
      this.playSound("jump");
      
      const progress = { t: 0 };
      gsap.to(progress, {
          t: 1,
          duration: 0.6,
          ease: "none",
          onUpdate: () => {
              if (!this.player) return;
              const t = progress.t;
              const arc = 4 * t * (1 - t);
              this.player.x = startX + (nextX - startX) * t;
              this.player.y = startY - (150 * arc);
          },
          onComplete: () => {
              this.currentMultiplier += 0.5;
              this.updateUI();
              
              // SECURITY: Preview Mode Limitation
              if (GameConfig.user.isWatermarked && this.step >= 3) {
                  this.state = "IDLE";
                  alert("PREVIEW ENDED. PURCHASE TO CONTINUE.");
                  this.resetGame();
              }
          }
      });
  }
  
  resetGame() {
      this.step = 0;
      this.currentMultiplier = 1.0;
      this.player!.x = this.tracks[0].x;
      this.updateUI();
  }

  update(_ticker: PIXI.Ticker) {
      if (!this.world || !this.player || !this.app) return;
      const targetX = (this.app.screen.width * 0.3) - (this.player.x * this.world.scale.x);
      this.world.x += (targetX - this.world.x) * 0.1;
  }

  handleResize() {
      if (!this.app || !this.world) return;
      const isLandscape = this.app.screen.width > this.app.screen.height;
      const zoom = isLandscape ? GameConfig.core.cameraZoom.landscape : GameConfig.core.cameraZoom.portrait;
      
      this.world.scale.set(zoom);
      this.world.y = this.app.screen.height * GameConfig.core.verticalCenter;
      
      this.tracks.forEach(t => t.y = 0);
      if (this.player && this.tracks[this.step]) {
           if (this.state !== "RUNNING") this.player.y = 0; 
      }
  }

  updateUI() {
      const balanceEl = document.getElementById("balance-display");
      const multEl = document.getElementById("current-multiplier");
      
      const cur = GameConfig.user.currency;
      if(balanceEl) balanceEl.innerText = `${this.balance} ${cur}`;
      if(multEl) multEl.innerText = this.currentMultiplier.toFixed(2) + "x";
  }

  playSound(alias: string) {
      if(this.audio[alias]) {
          this.audio[alias].currentTime = 0;
          this.audio[alias].play().catch(() => {});
      }
  }
}