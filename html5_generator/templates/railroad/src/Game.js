import * as PIXI from "pixi.js";
import { GifSprite } from "pixi.js/gif";
import gsap from "gsap";

import { GameConfig } from "./Config.js";
import { AssetManifest } from "./AssetManifest.js";

export class Game {
  constructor(canvasId) {
    this.canvasId = canvasId;
    this.app = null;
    this.state = "IDLE"; // IDLE, RUNNING, CRASHED, CASHOUT, BONUS
    this.mode = "low"; // Default mode
    this.bet = GameConfig.defaultBet;
    this.balance = GameConfig.startingBalance;
    this.currentMultiplier = 1.0;
    this.step = 0;
    this.maxSteps = 8;

    // References to DOM elements
    this.ui = {
      balance: document.getElementById("balance-display"),
      multiplier: document.getElementById("current-multiplier"),
      betAmount: document.getElementById("bet-amount"),
      actionBtn: document.getElementById("action-btn"),
      withdrawBtn: document.getElementById("withdraw-btn"),
      winImg: document.getElementById("win-img"),
      centerMsg: document.getElementById("center-message"),
    };
    this.uiLayer = document.getElementById("ui-layer");
    this.uiLayerDisplay = this.uiLayer
      ? getComputedStyle(this.uiLayer).display || "flex"
      : "flex";

    this.audio = {};
    this.bgmStarted = false;
    this.railroads = [];
    this.railroadActive = [];
    this.railroadPool = [];
    this.metalPlates = [];
    this.metalPlatePool = [];
    this.goldPlates = [];
    this.goldPlatePool = [];
    this.plateGroups = [];
    this.railwaySigns = [];
    this.railwaySignPool = [];
    this.barrierBases = [];
    this.barrierBasePool = [];
    this.barrierButtons = [];
    this.barrierButtonPool = [];
    this.barrierButtonOverlays = [];
    this.barrierButtonOverlayPool = [];
    this.barriers = [];
    this.barrierPool = [];
    this.trains = [];
    this.trainPool = [];
    this.trainSpawnTimer = 0;
    this.nextTrainLane = 0;
    this.trainFrameTextures = null;
    this.winFrameTextures = null;
    this.jumpFrameTextures = null;
    this.activeLaneIndex = null;
    this.crashTrain = null;
    this.crashImpactTriggered = false;
    this.isJumping = false;
    this.jumpLocked = false;
    this.cameraOffsetRatio = 0.2;
    this.chickenIdleOffset = -30;
    this.chickenIdleOffsetY = -130;
    this.deathSeed = 1;
    this.barrierSpawnSeed = 1;
    this.deathResetTimer = null;
    this.landingPanel = null;
    this.landingPanelSprite = null;
    this.landingPanelText = null;
    this.landingPanelLaneIndex = null;
    this.landingEgg = null;
    this.landingEggSprite = null;
    this.landingEggLight = null;
    this.landingEggLaneIndex = null;
    this.landingEggUsesEndPlatform = false;
    this.landingEggBaseScale = 1;
    this.landingEggBaseX = 0;
    this.landingEggBaseY = 0;
    this.landingEggFloatTime = 0;
    this.landingEggText = null;
    this.landingEggMultiplierValue = null;
    this.winOverlay = null;
    this.winOverlayBg = null;
    this.winOverlayBody = null;
    this.winOverlayScroll = null;
    this.winOverlayBigWinText = null;
    this.winOverlayMultiplierText = null;
    this.winOverlaySkipText = null;
    this.winOverlayCoinLayer = null;
    this.winOverlayScrollTargetY = null;
    this.winOverlayCtaButton = null;
    this.winOverlayCtaText = null;
    this.winOverlayCtaBaseScale = 1;
    this.winOverlayCtaPressed = false;
    this.coinPool = [];
    this.coinActive = [];
    this.coinSpawnTimeline = null;
    this.coinSeed = 1;
  }

  async init() {
    // Initialize PIXI Application
    this.app = new PIXI.Application();
    await this.app.init({
      canvas: document.getElementById(this.canvasId),
      width: GameConfig.width,
      height: GameConfig.height,
      backgroundColor: GameConfig.backgroundColor,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      resizeTo: document.getElementById("game-wrapper"),
    });

    // Load Assets
    await this.loadAssets();

    // Setup Scene
    this.createScene();

    // Setup UI Listeners
    this.setupUI();

    // Start Loop
    this.app.ticker.add((ticker) => this.update(ticker));

    // Handle Resize
    window.addEventListener("resize", () => this.handleResize());
    this.handleResize(); // Initial sizing

    // Initial UI Update
    this.updateUI();
  }

  async loadAssets() {
    // Register assets first
    AssetManifest.images.forEach((a) => {
      PIXI.Assets.add({ alias: a.alias, src: a.src });
    });

    Object.entries(AssetManifest.gifs).forEach(([key, src]) => {
      PIXI.Assets.add({ alias: key, src: src });
    });

    (AssetManifest.trainFrames || []).forEach((frame) => {
      PIXI.Assets.add({ alias: frame.alias, src: frame.src });
    });
    (AssetManifest.winFrames || []).forEach((frame) => {
      PIXI.Assets.add({ alias: frame.alias, src: frame.src });
    });
    (AssetManifest.jumpFrames || []).forEach((frame) => {
      PIXI.Assets.add({ alias: frame.alias, src: frame.src });
    });

    // Load everything
    const aliases = [
      ...AssetManifest.images.map((a) => a.alias),
      ...Object.keys(AssetManifest.gifs),
      ...(AssetManifest.trainFrames || []).map((f) => f.alias),
      ...(AssetManifest.winFrames || []).map((f) => f.alias),
      ...(AssetManifest.jumpFrames || []).map((f) => f.alias),
    ];

    await PIXI.Assets.load(aliases);

    // Load Audio
    for (const a of AssetManifest.audio) {
      this.audio[a.alias] = new Audio(a.src);
      this.audio[a.alias].volume = GameConfig.volume;
      this.audio[a.alias].preload = "auto";
    }
  }

  createScene() {
    // Create World Container
    this.world = new PIXI.Container();
    this.world.sortableChildren = true;
    this.app.stage.addChild(this.world);

    const groundTexture = PIXI.Assets.get("ground_tile") || PIXI.Texture.WHITE;
    this.ground = new PIXI.TilingSprite({
      texture: groundTexture,
      width: this.app.screen.width * 20,
      height: this.app.screen.height,
    });
    this.ground.zIndex = 0;
    this.world.addChild(this.ground);

    this.groundTop = new PIXI.TilingSprite({
      texture: groundTexture,
      width: this.app.screen.width * 20,
      height: this.app.screen.height,
    });
    this.groundTop.zIndex = 0;
    this.groundTop.y = -this.app.screen.height;
    this.world.addChild(this.groundTop);

    this.groundBottom = new PIXI.TilingSprite({
      texture: groundTexture,
      width: this.app.screen.width * 20,
      height: this.app.screen.height,
    });
    this.groundBottom.zIndex = 0;
    this.groundBottom.y = this.app.screen.height;
    this.world.addChild(this.groundBottom);

    // Starting Platform
    const startPlatformData = this.createPlatformContainer({
      mirrored: false,
      storeKioskRef: true,
    });
    this.platform = startPlatformData.container;
    this.platform.x = 400;
    this.platform.y = this.app.screen.height * GameConfig.verticalCenter;
    this.platform.zIndex = 1;
    this.world.addChild(this.platform);

    // Ending Platform (mirrored)
    const endPlatformData = this.createPlatformContainer({
      mirrored: true,
      storeKioskRef: false,
      decorType: "end",
    });
    this.endPlatform = endPlatformData.container;
    this.endPlatformLandingOffsetX = -endPlatformData.kioskOffsetX;
    this.endPlatform.y = this.platform.y;
    this.endPlatform.zIndex = 1;
    this.world.addChild(this.endPlatform);

    // Railroads
    this.rebuildRailroads();

    // Chicken Container
    this.chicken = new PIXI.Container();
    this.chicken.scale.set(GameConfig.assets.chickenScale);
    this.chicken.zIndex = 100;

    // Initial position on ground near kiosk
    this.chicken.x = this.platform.x + this.kiosk.x + this.chickenIdleOffset;
    this.chicken.y = this.platform.y + this.chickenIdleOffsetY;
    this.world.addChild(this.chicken);

    this.setChickenState("idle");

    this.createLandingPanel();
    this.createLandingEgg();
    this.createWinOverlay();
    this.showLandingEgg(0, false);
  }

  handleResize() {
    if (!this.app || !this.world || !this.ground) return;

    const groundHeight = this.app.screen.height;
    const groundWidth = this.app.screen.width * 20;
    this.ground.height = groundHeight;
    this.ground.width = groundWidth;
    this.ground.y = 0;
    if (this.groundTop) {
      this.groundTop.height = groundHeight;
      this.groundTop.width = groundWidth;
      this.groundTop.y = -groundHeight;
    }
    if (this.groundBottom) {
      this.groundBottom.height = groundHeight;
      this.groundBottom.width = groundWidth;
      this.groundBottom.y = groundHeight;
    }

    const centerY = this.app.screen.height * GameConfig.verticalCenter;
    this.platform.y = centerY;
    if (this.endPlatform) {
      this.endPlatform.y = centerY;
    }
    const isLandscape = this.app.screen.width > this.app.screen.height;
    const cameraConfig = GameConfig.camera ?? {};
    const zoom =
      (isLandscape ? cameraConfig.zoomLandscape : cameraConfig.zoomPortrait) ??
      cameraConfig.zoom ??
      1;
    this.world.scale.set(zoom);
    this.world.y = centerY - centerY * zoom;
    this.rebuildRailroads();

    if (this.step === 0 && this.state === "IDLE") {
      this.chicken.x = this.platform.x + this.kiosk.x + this.chickenIdleOffset;
      this.chicken.y = this.platform.y + this.chickenIdleOffsetY;
    } else if (this.state !== "RUNNING") {
      // If we are in other states, keep chicken aligned with railroads vertically
      this.chicken.y = centerY - 60;
    }
    this.updateLandingPanelPosition();
    this.updateLandingEggPosition();
    this.updateWinOverlayLayout();
  }

  setupUI() {
    // Mode Selection
    const modeBtns = document.querySelectorAll(".mode-btn");
    modeBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        if (this.state === "RUNNING") return;
        modeBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.mode = btn.dataset.mode;
        this.playSound("button");
        if (this.state === "IDLE") {
          this.setLandingEggMultiplierValue(
            this.getLandingEggTargetMultiplier(this.landingEggUsesEndPlatform)
          );
        }
      });
    });

    // Bet Controls
    document.getElementById("btn-minus").addEventListener("click", () => {
      if (this.state === "RUNNING") return;
      this.bet = Math.max(GameConfig.minBet, this.bet - 10);
      this.updateUI();
      this.playSound("button");
    });
    document.getElementById("btn-plus").addEventListener("click", () => {
      if (this.state === "RUNNING") return;
      this.bet = Math.min(GameConfig.maxBet, this.bet + 10);
      this.updateUI();
      this.playSound("button");
    });

    // Main Action Button
    this.ui.actionBtn.addEventListener("click", () => {
      this.playSound("button");
      this.startGame();
    });

    // Withdraw Button
    this.ui.withdrawBtn.addEventListener("click", () => {
      this.playSound("button");
      if (this.state !== "RUNNING") return;
      if (this.isJumping || this.jumpLocked) return;
      this.cashOut();
    });
  }

  startGame() {
    if (this.state !== "IDLE" && this.state !== "RUNNING") return;
    if (this.state === "IDLE") {
      if (this.balance < this.bet) {
        alert("Insufficient funds!");
        return;
      }
      this.state = "RUNNING";
      this.balance -= this.bet;
      this.step = 0;
      this.currentMultiplier = 1.0;
      this.isJumping = false;
      this.jumpLocked = false;
      this.crashImpactTriggered = false;
      this.crashTrain = null;
      this.hideLandingPanel();
      this.hideLandingEgg();
      this.deathSeed = this.buildDeathSeed();
      this.barrierSpawnSeed = this.buildDeathSeed();
      this.resetGoldPlates();
      this.resetBarriers();
      this.updateUI();

      // Hide UI stuff
      this.ui.centerMsg.style.display = "none";
      this.hideWinOverlay();

      // Start Theme
      this.startBgmLoop();

      // Advance to first step immediately
      this.advanceStep();
    } else if (this.state === "RUNNING") {
      this.advanceStep();
    }
  }

  advanceStep() {
    if (this.state !== "RUNNING") return;
    if (this.isJumping || this.jumpLocked) return;
    if (this.step > this.maxSteps) return;

    const isFinalJump = this.step === this.maxSteps;
    let targetLaneIndex = null;
    let nextTargetX = 0;
    let nextTargetY = 0;

    if (isFinalJump) {
      const target = this.getLandingTargetPosition({ isFinal: true });
      if (!target) return;
      nextTargetX = target.x;
      nextTargetY = target.y;
      this.activeLaneIndex = null;
    } else {
      if (!this.railroads[this.step]) return;
      targetLaneIndex = this.step;
      this.revealGoldPlates(targetLaneIndex);
      const target = this.getLandingTargetPosition({
        laneIndex: targetLaneIndex,
        isFinal: false,
      });
      if (!target) return;
      nextTargetX = target.x;
      nextTargetY = target.y;
      this.activeLaneIndex = targetLaneIndex;
    }

    this.showLandingEgg(targetLaneIndex, isFinalJump);

    this.step++;

    // Smoothly center camera after first jump
    if (this.cameraOffsetRatio !== 0.5) {
      gsap.to(this, {
        cameraOffsetRatio: 0.5,
        duration: 1.5,
        ease: "power2.out",
      });
    }

    // Jump Animation
    this.setChickenState("jump");
    this.isJumping = true;
    this.jumpLocked = true;
    this.playLandingEggPop();

    const startX = this.chicken.x;
    const startY = this.chicken.y;
    const jumpHeight = GameConfig.animations?.jumpHeight ?? 180;
    const jumpDuration = GameConfig.animations?.jumpDuration ?? 0.6;
    const jumpProgress = { t: 0 };

    gsap.to(jumpProgress, {
      t: 1,
      duration: jumpDuration,
      ease: "none",
      onUpdate: () => {
        const t = jumpProgress.t;
        const arc = 4 * t * (1 - t);
        this.chicken.x = startX + (nextTargetX - startX) * t;
        this.chicken.y = startY + (nextTargetY - startY) * t - jumpHeight * arc;
      },
      onComplete: () => {
        this.chicken.x = nextTargetX;
        this.chicken.y = nextTargetY;
        this.setChickenState("idle");
        this.isJumping = false;
        if (!isFinalJump && this.shouldCrashOnLanding()) {
          this.handleCrash();
          return;
        }

        if (!isFinalJump) {
          this.raiseBarrierZForStep(targetLaneIndex);
          this.rotateBarrierForStep(targetLaneIndex);
          this.updateMultiplier();
          this.showLandingPanel(targetLaneIndex);
          this.jumpLocked = false;
          this.updateUI();
        } else {
          this.hideLandingPanel();
          this.jumpLocked = false;
          this.updateUI();
          setTimeout(() => this.cashOut(), 500);
        }
      },
    });
  }

  updateMultiplier() {
    const config = GameConfig.modes[this.mode];
    this.currentMultiplier = parseFloat(
      (this.currentMultiplier + config.multiplierIncrement).toFixed(2)
    );
  }

  buildDeathSeed() {
    let seed = 0;
    for (const ch of this.mode) {
      seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    }
    seed ^= (this.bet + this.balance + this.maxSteps) >>> 0;
    return seed || 1;
  }

  getDeterministicFloat() {
    this.deathSeed = (this.deathSeed * 1664525 + 1013904223) >>> 0;
    return this.deathSeed / 4294967296;
  }

  getBarrierSpawnFloat() {
    this.barrierSpawnSeed =
      (this.barrierSpawnSeed * 1664525 + 1013904223) >>> 0;
    return this.barrierSpawnSeed / 4294967296;
  }

  shouldCrashOnLanding() {
    const chance = GameConfig.modes[this.mode]?.trainChance ?? 0;
    return this.getDeterministicFloat() < chance;
  }

  handleCrash() {
    if (this.deathResetTimer) {
      clearTimeout(this.deathResetTimer);
      this.deathResetTimer = null;
    }

    this.state = "CRASHING";
    this.isJumping = false;
    this.jumpLocked = false;

    this.ui.centerMsg.style.display = "none";
    this.ui.winImg.src = "";
    this.ui.actionBtn.disabled = true;

    this.startCrashTrain();
  }

  startCrashTrain() {
    if (
      this.activeLaneIndex === null ||
      this.activeLaneIndex === undefined ||
      !this.railroads[this.activeLaneIndex]
    ) {
      this.finishCrashImpact();
      return;
    }

    const rail = this.railroads[this.activeLaneIndex];
    const train = this.getTrainSprite();
    train.laneIndex = this.activeLaneIndex;
    train.forceMove = true;
    train.isCrashTrain = true;
    train.x = rail.x;

    const travelBounds = this.getTrainTravelBounds(train);
    const crashStartOffset =
      GameConfig.trains.crashStartOffset ?? GameConfig.trains.startOffset;
    const centerY = this.railCenterY ?? this.platform.y - 60;
    const trainHeight = Math.max(1, train.height || 1);
    train.y = centerY - this.app.screen.height * crashStartOffset - trainHeight;
    train.endY = travelBounds.endY;
    train.crashHitY = this.chicken.y - Math.max(1, train.height * 0.25);

    this.crashTrain = train;
    this.crashImpactTriggered = false;

    this.world.addChild(train);
    this.trains.push(train);
  }

  finishCrashImpact() {
    if (this.state === "CRASHED") return;
    this.state = "CRASHED";
    const deathGif = this.setChickenState("death");
    if (this.deathResetTimer) {
      clearTimeout(this.deathResetTimer);
      this.deathResetTimer = null;
    }
    if (deathGif) {
      deathGif.loop = false;
    }
    const fallbackDelay = Math.max(
      300,
      GameConfig.animations?.deathResetDelayMs ?? 700
    );
    this.deathResetTimer = setTimeout(() => {
      if (this.state === "CRASHED") {
        this.resetGame();
      }
    }, fallbackDelay);
  }

  cashOut() {
    this.state = "WIN";
    this.jumpLocked = false;
    const winAmount = Math.floor(this.bet * this.currentMultiplier);
    this.balance += winAmount;

    this.playSound("cashout");
    this.playSound("big_win");

    this.setChickenState("win");
    this.ui.centerMsg.style.display = "none";
    this.ui.winImg.src = "";
    this.hideLandingPanel();
    this.hideLandingEgg();
    this.showWinOverlay();

    this.updateUI();
  }

  resetGame() {
    if (this.deathResetTimer) {
      clearTimeout(this.deathResetTimer);
      this.deathResetTimer = null;
    }
    this.state = "IDLE";
    this.step = 0;
    this.cameraOffsetRatio = 0.2;
    this.currentMultiplier = 1.0;
    this.isJumping = false;
    this.jumpLocked = false;
    this.crashImpactTriggered = false;
    this.crashTrain = null;
    this.ui.centerMsg.style.display = "none";
    this.resetGoldPlates();
    this.resetBarriers();
    this.resetBarrierZIndexes();
    this.hideLandingPanel();
    this.showLandingEgg(0, false);
    this.hideWinOverlay();

    // Reset chicken to ground
    this.activeLaneIndex = null;
    this.chicken.x = this.platform.x + this.kiosk.x + this.chickenIdleOffset;
    this.chicken.y = this.platform.y + this.chickenIdleOffsetY;
    this.setChickenState("idle");

    this.updateUI();
  }

  update(ticker) {
    // Camera follow logic
    if (!this.world || !this.chicken) return;

    // Target X for world is to keep chicken at 25% of screen width (for side scrolling feel)
    // Or at center as requested: "чтобы она была в центре"
    const scaleX = this.world.scale?.x ?? 1;
    const targetWorldX =
      this.app.screen.width * this.cameraOffsetRatio - this.chicken.x * scaleX;

    // Smoothly interpolate world position
    this.world.x += (targetWorldX - this.world.x) * 0.1;

    this.updateTrains(ticker);
    this.updateLandingEggLight(ticker);
    this.updateLandingEggFloat(ticker);
  }

  setChickenState(state) {
    if (this.currentChickenState === state && state !== "jump") return null;
    this.currentChickenState = state;

    // Clear previous children and destroy them
    while (this.chicken.children.length > 0) {
      const child = this.chicken.getChildAt(0);
      this.chicken.removeChild(child);
      child.destroy();
    }

    if (state === "jump") {
      const jumpFrames = this.getJumpFrameTextures();
      if (jumpFrames.length) {
        const anim = new PIXI.AnimatedSprite(jumpFrames);
        const jumpDuration = GameConfig.animations?.jumpDuration ?? 2.2;
        const baseSpeed = GameConfig.assets.jumpAnimSpeed ?? 1.5;
        const framesPerTick = jumpFrames.length / Math.max(1, jumpDuration * 120);
        anim.animationSpeed = framesPerTick * baseSpeed;
        anim.loop = false;
        anim.autoUpdate = true;
        anim.gotoAndPlay(0);
        anim.play();
        anim.anchor.set(0.5, 1);
        this.chicken.addChild(anim);
        return anim;
      }
    }

    if (state === "win") {
      const winFrames = this.getWinFrameTextures();
      if (winFrames.length) {
        const anim = new PIXI.AnimatedSprite(winFrames);
        anim.animationSpeed = GameConfig.assets.winAnimSpeed ?? 0.2;
        anim.loop = true;
        anim.play();
        anim.anchor.set(0.5, 1);
        this.chicken.addChild(anim);
        return anim;
      }
    }

    const source = PIXI.Assets.get(state) || PIXI.Assets.get("idle");
    if (!source) return null;

    const gif = new GifSprite({ source });
    if (state === "death") {
      const speedMultiplier = GameConfig.animations?.deathSpeedMultiplier ?? 8;
      gif.animationSpeed *= speedMultiplier;
      gif.loop = false;
      gif.onComplete = () => gif.stop();
    }
    gif.anchor.set(0.5, 1);
    this.chicken.addChild(gif);
    return gif;
  }

  updateUI() {
    this.ui.balance.textContent = this.balance;
    this.ui.betAmount.textContent = this.bet;
    this.ui.multiplier.textContent = this.currentMultiplier.toFixed(2) + "x";
    this.updateLandingPanelMultiplier();
    this.updateLandingEggMultiplier();
    this.updateWinOverlayText();

    // Button State
    if (this.state === "RUNNING") {
      this.ui.actionBtn.textContent = "JUMP";
      this.ui.actionBtn.classList.add("cashout");
      this.ui.actionBtn.disabled = this.isJumping || this.jumpLocked;
      this.ui.withdrawBtn.disabled = this.isJumping || this.jumpLocked;
    } else if (this.state === "WIN") {
      this.ui.actionBtn.textContent = "WIN";
      this.ui.actionBtn.classList.remove("cashout");
      this.ui.actionBtn.disabled = true;
      this.ui.withdrawBtn.disabled = true;
    } else {
      this.ui.actionBtn.textContent = "START";
      this.ui.actionBtn.classList.remove("cashout");
      this.ui.actionBtn.disabled = this.balance < this.bet;
      this.ui.withdrawBtn.disabled = true;
    }
  }

  playSound(alias) {
    if (this.audio[alias]) {
      this.audio[alias].currentTime = 0;
      this.audio[alias]
        .play()
        .catch((e) => console.log("Audio play failed", e));
    }
  }

  startBgmLoop() {
    if (this.bgmStarted) return;
    this.bgmStarted = true;
    const theme = this.audio["main_theme"];
    if (!theme) return;
    theme.loop = true;
    theme.volume = GameConfig.volume;
    theme.play().catch(() => {});
  }

  showFloatingText(text) {
    const floater = document.createElement("div");
    floater.className = "floater";
    floater.textContent = text;

    // Use action button as center for floating text
    const rect = this.ui.actionBtn.getBoundingClientRect();
    floater.style.left = rect.left + rect.width / 2 + "px";
    floater.style.top = rect.top - 50 + "px";

    document.body.appendChild(floater);
    setTimeout(() => floater.remove(), 1000);
  }

  rebuildRailroads() {
    if (!this.world || !this.app) return;
    const railroadTexture = PIXI.Assets.get("railroad") || PIXI.Texture.WHITE;
    const railwaySignTexture =
      PIXI.Assets.get("railway_sign") || PIXI.Texture.WHITE;
    const barrierBasisTexture =
      PIXI.Assets.get("barrier_basis") || PIXI.Texture.WHITE;
    const barrierButtonTexture =
      PIXI.Assets.get("barrier_button") || PIXI.Texture.WHITE;
    const barrierButtonOverlayTexture =
      PIXI.Assets.get("barrier_button_2") || PIXI.Texture.WHITE;
    const barrierTexture = PIXI.Assets.get("barrier") || PIXI.Texture.WHITE;
    const metalPlateTexture =
      PIXI.Assets.get("metal_plate") || PIXI.Texture.WHITE;
    const leftMetalPlateTexture =
      PIXI.Assets.get("left_metal_plate") || PIXI.Texture.WHITE;
    const rightMetalPlateTexture =
      PIXI.Assets.get("right_metal_plate") || PIXI.Texture.WHITE;
    const goldPlateTexture =
      PIXI.Assets.get("gold_plate") || PIXI.Texture.WHITE;
    const leftGoldPlateTexture =
      PIXI.Assets.get("left_gold_plate") || PIXI.Texture.WHITE;
    const rightGoldPlateTexture =
      PIXI.Assets.get("right_gold_plate") || PIXI.Texture.WHITE;
    const spacing = 240;
    const railOffsetX = 120;
    const centerY = this.platform.y - 60;
    this.railCenterY = centerY;
    const scale = 0.8;
    const plateScale = 0.87;
    const goldPlateScale = GameConfig.assets.goldPlateScale ?? 1.2;
    const goldPlateCenterScale =
      GameConfig.assets.goldPlateCenterScale ?? goldPlateScale;
    const goldPlateCenterOffsetY =
      GameConfig.assets.goldPlateCenterOffsetY ?? 120;
    const goldPlateSideOffsetX = GameConfig.assets.goldPlateSideOffsetX ?? 0;
    const goldPlateSideOffsetY = GameConfig.assets.goldPlateSideOffsetY ?? 0;
    const goldPlateSideVerticalScale =
      GameConfig.assets.goldPlateSideVerticalScale ?? 1;
    const railwaySignScale = GameConfig.assets.railwaySignScale ?? 0.55;
    const railwaySignOffsetX = GameConfig.assets.railwaySignOffsetX ?? 70;
    const railwaySignOffsetY = GameConfig.assets.railwaySignOffsetY ?? 170;
    const barrierBasisScale = GameConfig.assets.barrierBasisScale ?? 0.55;
    const barrierBasisOffsetX = GameConfig.assets.barrierBasisOffsetX ?? 30;
    const barrierBasisOffsetY = GameConfig.assets.barrierBasisOffsetY ?? 0;
    const barrierButtonScale =
      GameConfig.assets.barrierButtonScale ?? barrierBasisScale;
    const barrierButtonOffsetX = GameConfig.assets.barrierButtonOffsetX ?? 0;
    const barrierButtonOffsetY = GameConfig.assets.barrierButtonOffsetY ?? 40;
    const barrierScale = GameConfig.assets.barrierScale ?? barrierBasisScale;
    const barrierOffsetX = GameConfig.assets.barrierOffsetX ?? 0;
    const barrierOffsetY = GameConfig.assets.barrierOffsetY ?? 0;
    const sideGap = 11;
    const tileHeight = Math.max(1, railroadTexture.height * scale);
    const extraRows = 4;
    const repeatCount =
      Math.ceil((this.app.screen.height / 2 + tileHeight) / tileHeight) +
      extraRows;

    this.railroadActive.forEach((rr) => {
      rr.renderable = false;
      rr.visible = false;
      rr.removeFromParent();
      this.railroadPool.push(rr);
    });
    this.railroadActive = [];
    this.railroads = [];

    this.metalPlates.forEach((plate) => {
      plate.renderable = false;
      plate.visible = false;
      plate.removeFromParent();
      this.metalPlatePool.push(plate);
    });
    this.metalPlates = [];

    this.goldPlates.forEach((plate) => {
      plate.renderable = false;
      plate.visible = false;
      plate.removeFromParent();
      this.goldPlatePool.push(plate);
    });
    this.goldPlates = [];
    this.plateGroups = [];

    this.railwaySigns.forEach((sign) => {
      sign.renderable = false;
      sign.visible = false;
      sign.removeFromParent();
      this.railwaySignPool.push(sign);
    });
    this.railwaySigns = [];

    this.barrierBases.forEach((base) => {
      base.renderable = false;
      base.visible = false;
      base.removeFromParent();
      this.barrierBasePool.push(base);
    });
    this.barrierBases = [];
    this.barrierButtons.forEach((button) => {
      button.renderable = false;
      button.visible = false;
      button.removeFromParent();
      this.barrierButtonPool.push(button);
    });
    this.barrierButtons = [];
    this.barrierButtonOverlays.forEach((button) => {
      button.renderable = false;
      button.visible = false;
      button.removeFromParent();
      this.barrierButtonOverlayPool.push(button);
    });
    this.barrierButtonOverlays = [];
    this.barriers.forEach((barrier) => {
      barrier.renderable = false;
      barrier.visible = false;
      barrier.removeFromParent();
      this.barrierPool.push(barrier);
    });
    this.barriers = [];

    let lastRailX = null;
    for (let i = 0; i < this.maxSteps; i++) {
      const baseX = this.platform.x + spacing + railOffsetX + i * spacing;
      lastRailX = baseX;
      const baseRail = this.getRailroadSprite(railroadTexture, scale);
      baseRail.x = baseX;
      baseRail.y = centerY;
      this.world.addChild(baseRail);
      this.railroads.push(baseRail);
      this.railroadActive.push(baseRail);

      const plate = this.getMetalPlateSprite(metalPlateTexture, plateScale);
      plate.x = baseX;
      plate.y = centerY - 10;
      this.world.addChild(plate);
      this.metalPlates.push(plate);

      const targetPlateHeight = Math.max(
        1,
        metalPlateTexture.height * plateScale
      );
      const goldCenterScale = Math.max(
        0.01,
        (targetPlateHeight / Math.max(1, goldPlateTexture.height)) *
          goldPlateCenterScale
      );
      const goldLeftScale = Math.max(
        0.01,
        (targetPlateHeight / Math.max(1, leftGoldPlateTexture.height)) *
          goldPlateScale
      );
      const goldRightScale = Math.max(
        0.01,
        (targetPlateHeight / Math.max(1, rightGoldPlateTexture.height)) *
          goldPlateScale
      );
      const leftPlateScale = Math.max(
        0.01,
        targetPlateHeight / Math.max(1, leftMetalPlateTexture.height)
      );
      const rightPlateScale = Math.max(
        0.01,
        targetPlateHeight / Math.max(1, rightMetalPlateTexture.height)
      );
      const plateWidth = Math.max(1, metalPlateTexture.width * plateScale);
      const leftPlateWidth = Math.max(
        1,
        leftMetalPlateTexture.width * leftPlateScale
      );
      const rightPlateWidth = Math.max(
        1,
        rightMetalPlateTexture.width * rightPlateScale
      );

      const leftPlate = this.getMetalPlateSprite(
        leftMetalPlateTexture,
        leftPlateScale
      );
      leftPlate.x = baseX - plateWidth / 2 - sideGap - leftPlateWidth / 2;
      leftPlate.y = plate.y;
      this.world.addChild(leftPlate);
      this.metalPlates.push(leftPlate);

      const rightPlate = this.getMetalPlateSprite(
        rightMetalPlateTexture,
        rightPlateScale
      );
      rightPlate.x = baseX + plateWidth / 2 + sideGap + rightPlateWidth / 2;
      rightPlate.y = plate.y;
      this.world.addChild(rightPlate);
      this.metalPlates.push(rightPlate);

      const railwaySign = this.getRailwaySignSprite(
        railwaySignTexture,
        railwaySignScale
      );
      railwaySign.x = rightPlate.x + rightPlateWidth / 2 + railwaySignOffsetX;
      railwaySign.y = centerY + tileHeight / 2 - railwaySignOffsetY;
      this.world.addChild(railwaySign);
      this.railwaySigns.push(railwaySign);

      const barrierBasis = this.getBarrierBasisSprite(
        barrierBasisTexture,
        barrierBasisScale
      );
      const railwaySignWidth = Math.max(
        1,
        railwaySignTexture.width * railwaySignScale
      );
      const barrierBasisWidth = Math.max(
        1,
        barrierBasisTexture.width * barrierBasisScale
      );
      barrierBasis.x =
        railwaySign.x -
        railwaySignWidth / 2 -
        barrierBasisWidth / 2 -
        barrierBasisOffsetX;
      barrierBasis.y = railwaySign.y + barrierBasisOffsetY;
      this.world.addChild(barrierBasis);
      this.barrierBases.push(barrierBasis);

      const barrierBasisHeight = Math.max(
        1,
        barrierBasisTexture.height * barrierBasisScale
      );
      const barrierButton = this.getBarrierButtonSprite(
        barrierButtonTexture,
        barrierButtonScale
      );
      barrierButton.x = barrierBasis.x + barrierButtonOffsetX;
      barrierButton.y =
        barrierBasis.y - barrierBasisHeight + barrierButtonOffsetY;
      this.world.addChild(barrierButton);
      this.barrierButtons.push(barrierButton);

      const barrierButtonOverlay = this.getBarrierButtonOverlaySprite(
        barrierButtonOverlayTexture,
        barrierButtonScale
      );
      barrierButtonOverlay.x = barrierButton.x;
      barrierButtonOverlay.y = barrierButton.y;
      this.world.addChild(barrierButtonOverlay);
      this.barrierButtonOverlays.push(barrierButtonOverlay);

      const barrier = this.getBarrierSprite(barrierTexture, barrierScale);
      barrier.x = barrierBasis.x + barrierOffsetX;
      barrier.y = barrierBasis.y + barrierBasisHeight + barrierOffsetY;
      this.world.addChild(barrier);
      this.barriers.push(barrier);

      const goldPlateGroup = { gold: [], revealed: false };
      const goldCenter = this.getGoldPlateSprite(
        goldPlateTexture,
        goldCenterScale
      );
      goldCenter.rotation = Math.PI / 1;
      goldCenter.x = plate.x;
      goldCenter.y = plate.y - goldPlateCenterOffsetY;
      this.world.addChild(goldCenter);
      this.goldPlates.push(goldCenter);
      goldPlateGroup.gold.push(goldCenter);

      const goldLeft = this.getGoldPlateSprite(
        leftGoldPlateTexture,
        goldLeftScale
      );
      goldLeft.rotation = Math.PI / -2;
      goldLeft.scale.set(
        goldLeftScale * goldPlateSideVerticalScale,
        goldLeftScale
      );
      goldLeft.x = leftPlate.x + goldPlateSideOffsetX;
      goldLeft.y = leftPlate.y - goldPlateSideOffsetY;
      this.world.addChild(goldLeft);
      this.goldPlates.push(goldLeft);
      goldPlateGroup.gold.push(goldLeft);

      const goldRight = this.getGoldPlateSprite(
        rightGoldPlateTexture,
        goldRightScale
      );
      goldRight.rotation = Math.PI / -2;
      goldRight.scale.set(
        goldRightScale * goldPlateSideVerticalScale,
        goldRightScale
      );
      goldRight.x = rightPlate.x + goldPlateSideOffsetX;
      goldRight.y = rightPlate.y - goldPlateSideOffsetY;
      this.world.addChild(goldRight);
      this.goldPlates.push(goldRight);
      goldPlateGroup.gold.push(goldRight);

      this.plateGroups.push(goldPlateGroup);

      for (let j = 1; j <= repeatCount; j++) {
        const below = this.getRailroadSprite(railroadTexture, scale);
        below.x = baseX;
        below.y = centerY + j * tileHeight;
        this.world.addChild(below);
        this.railroadActive.push(below);

        const above = this.getRailroadSprite(railroadTexture, scale);
        above.x = baseX;
        above.y = centerY - j * tileHeight;
        this.world.addChild(above);
        this.railroadActive.push(above);
      }
    }

    if (this.endPlatform && lastRailX !== null) {
      this.endPlatform.x = lastRailX + spacing + railOffsetX;
    }

    this.updateTrainLanePositions();
    this.updateLandingPanelPosition();
    this.updateLandingEggPosition();
  }

  getLandingTargetPosition({ laneIndex, isFinal }) {
    if (isFinal) {
      if (!this.endPlatform) return null;
      return {
        x:
          this.endPlatform.x +
          (this.endPlatformLandingOffsetX ?? 0) +
          this.chickenIdleOffset,
        y: this.endPlatform.y + this.chickenIdleOffsetY,
      };
    }
    if (laneIndex === null || laneIndex === undefined) return null;
    const rail = this.railroads[laneIndex];
    if (!rail) return null;
    return {
      x: rail.x - 15,
      y: rail.y - 50,
    };
  }

  createLandingPanel() {
    const texture = PIXI.Assets.get("panel") || PIXI.Texture.WHITE;
    const panelScale = GameConfig.assets.panelScale ?? 0.5;

    const container = new PIXI.Container();
    container.sortableChildren = true;
    container.zIndex = 90;
    container.renderable = false;
    container.visible = false;
    container.alpha = 1;

    const sprite = new PIXI.Sprite(texture);
    sprite.anchor.set(0.5, 1);
    sprite.scale.set(panelScale);
    container.addChild(sprite);
    container.pivot.set(-sprite.width * 0.5, 0);

    const fontSize = Math.max(16, sprite.height * (GameConfig.assets.panelFontSizeRatio ?? 0.22));
    const textStyle = new PIXI.TextStyle({
      fontFamily: "Arial",
      fontSize,
      fill: 0xffffff,
      fontWeight: "700",
      align: "center",
      stroke: {
        color: 0x0f2f2b,
        width: Math.max(2, fontSize * 0.12),
      },
    });
    const text = new PIXI.Text({
      text: `${this.currentMultiplier.toFixed(2)}x`,
      style: textStyle,
    });
    text.anchor.set(0.5, 0.5);
    const heightRatio = GameConfig.assets.panelTextHeightRatio ?? 0.7;
    const textOffsetY = GameConfig.assets.panelTextOffsetY ?? 0;
    text.y = -sprite.height * heightRatio + textOffsetY;
    container.addChild(text);

    this.landingPanel = container;
    this.landingPanelSprite = sprite;
    this.landingPanelText = text;
    this.world.addChild(container);
  }

  createLandingEgg() {
    const container = new PIXI.Container();
    container.zIndex = 89;
    container.renderable = false;
    container.visible = false;
    container.alpha = 1;

    const lightTexture = PIXI.Assets.get("egg_lights") || PIXI.Texture.WHITE;
    const light = new PIXI.Sprite(lightTexture);
    light.anchor.set(0.5, 0.5);
    const lightScale = GameConfig.assets.landingEggLightScale ?? 1.1;
    light.scale.set(lightScale);

    const eggTexture = PIXI.Assets.get("egg") || PIXI.Texture.WHITE;
    const egg = new PIXI.Sprite(eggTexture);
    egg.anchor.set(0.5, 1);

    const lightOffsetY =
      GameConfig.assets.landingEggLightOffsetY ??
      -Math.max(1, eggTexture.height) * 0.55;
    light.y = lightOffsetY;

    const eggHeight = Math.max(1, eggTexture.height);
    const eggTextSize =
      GameConfig.assets.landingEggTextSizeRatio ??
      0.18;
    const textStyle = new PIXI.TextStyle({
      fontFamily: "Arial",
      fontSize: Math.max(14, eggHeight * eggTextSize),
      fill: 0xffffff,
      fontWeight: "700",
      align: "center",
      stroke: {
        color: 0x3a2a12,
        width: Math.max(2, eggHeight * 0.02),
      },
    });
    const text = new PIXI.Text({
      text: `${this.currentMultiplier.toFixed(2)}x`,
      style: textStyle,
    });
    text.anchor.set(0.5, 0.5);
    const textHeightRatio = GameConfig.assets.landingEggTextHeightRatio ?? 0.58;
    const textOffsetY = GameConfig.assets.landingEggTextOffsetY ?? 0;
    text.y = -eggHeight * textHeightRatio + textOffsetY;

    container.addChild(light);
    container.addChild(egg);
    container.addChild(text);

    this.landingEggBaseScale = GameConfig.assets.landingEggScale ?? 0.5;
    container.scale.set(this.landingEggBaseScale);
    this.landingEgg = container;
    this.landingEggSprite = egg;
    this.landingEggLight = light;
    this.landingEggText = text;
    this.world.addChild(container);
  }

  createWinOverlay() {
    if (!this.app) return;
    const container = new PIXI.Container();
    container.zIndex = 1000;
    container.renderable = false;
    container.visible = false;
    container.alpha = 1;

    const bg = new PIXI.Graphics();
    container.addChild(bg);

    const bodyTexture = PIXI.Assets.get("scroll_body") || PIXI.Texture.WHITE;
    const scrollTexture = PIXI.Assets.get("scroll") || PIXI.Texture.WHITE;

    const body = new PIXI.Sprite(bodyTexture);
    body.zIndex = 2;
    body.anchor.set(0.5, 0.5);
    container.addChild(body);

    const coinLayer = new PIXI.Container();
    coinLayer.zIndex = 1;
    container.addChild(coinLayer);

    const scroll = new PIXI.Sprite(scrollTexture);
    scroll.zIndex = 3;
    scroll.anchor.set(0.5, 0.5);
    container.addChild(scroll);

    const bigWinText = new PIXI.Text({
      text: "BIG WIN",
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 22,
        fill: 0xffffff,
        fontWeight: "700",
        align: "center",
        stroke: {
          color: 0x0f2f2b,
          width: 2,
        },
        dropShadow: true,
        dropShadowColor: 0x7f7f7f,
        dropShadowBlur: 2,
        dropShadowDistance: 3,
        dropShadowAngle: Math.PI / 4,
      }),
    });
    bigWinText.zIndex = 4;
    bigWinText.anchor.set(0.5, 0.5);
    container.addChild(bigWinText);

    const multiplierText = new PIXI.Text({
      text: `${this.currentMultiplier.toFixed(2)}x`,
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 62,
        fill: 0xffffff,
        fontWeight: "700",
        align: "center",
        stroke: {
          color: 0x0f2f2b,
          width: 2,
        },
        dropShadow: true,
        dropShadowColor: 0x7f7f7f,
        dropShadowBlur: 2,
        dropShadowDistance: 3,
        dropShadowAngle: Math.PI / 4,
      }),
    });
    multiplierText.zIndex = 4;
    multiplierText.anchor.set(0.5, 0.5);
    container.addChild(multiplierText);

    const ctaTexture = PIXI.Assets.get("button_chick") || PIXI.Texture.WHITE;
    const ctaButton = new PIXI.Sprite(ctaTexture);
    ctaButton.zIndex = 4;
    ctaButton.anchor.set(0.5, 0.5);
    ctaButton.eventMode = "static";
    ctaButton.cursor = "pointer";
    container.addChild(ctaButton);

    const ctaText = new PIXI.Text({
      text: GameConfig.winOverlay?.ctaText ?? "PLAY NOW!",
      style: new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 28,
        fill: 0xffffff,
        fontWeight: "800",
        align: "center",
        stroke: {
          color: 0x0f2f2b,
          width: 2,
        },
        dropShadow: true,
        dropShadowColor: 0x000000,
        dropShadowBlur: 4,
        dropShadowDistance: 2,
        dropShadowAngle: Math.PI / 4,
      }),
    });
    ctaText.zIndex = 5;
    ctaText.anchor.set(0.5, 0.5);
    ctaText.eventMode = "none";
    container.addChild(ctaText);

    const animateCtaScale = (targetScale, duration) => {
      const baseScale =
        this.winOverlayCtaBaseScale || ctaButton.scale.x || 1;
      const textScale = targetScale / baseScale;
      gsap.killTweensOf(ctaButton.scale);
      gsap.killTweensOf(ctaText.scale);
      gsap.to(ctaButton.scale, {
        x: targetScale,
        y: targetScale,
        duration,
        ease: "power2.out",
      });
      gsap.to(ctaText.scale, {
        x: textScale,
        y: textScale,
        duration,
        ease: "power2.out",
      });
    };

    const handleCtaRelease = () => {
      this.winOverlayCtaPressed = false;
      animateCtaScale(this.winOverlayCtaBaseScale, 0.12);
    };

    ctaButton.on("pointerdown", (event) => {
      event?.stopPropagation?.();
      this.winOverlayCtaPressed = true;
      const baseScale = this.winOverlayCtaBaseScale || ctaButton.scale.x || 1;
      animateCtaScale(baseScale * 0.94, 0.08);
    });

    ctaButton.on("pointerup", (event) => {
      event?.stopPropagation?.();
      if (this.winOverlayCtaPressed) {
        this.openCtaUrl();
      }
      handleCtaRelease();
    });

    ctaButton.on("pointerupoutside", handleCtaRelease);
    ctaButton.on("pointerout", handleCtaRelease);

    this.winOverlay = container;
    this.winOverlayBg = bg;
    this.winOverlayBody = body;
    this.winOverlayScroll = scroll;
    this.winOverlayCoinLayer = coinLayer;
    this.winOverlayBigWinText = bigWinText;
    this.winOverlayMultiplierText = multiplierText;
    this.winOverlayCtaButton = ctaButton;
    this.winOverlayCtaText = ctaText;
    this.app.stage.addChild(container);
    this.winOverlay.eventMode = "static";
    this.updateWinOverlayLayout();
  }

  updateWinOverlayLayout() {
    if (
      !this.app ||
      !this.winOverlay ||
      !this.winOverlayBg ||
      !this.winOverlayBody ||
      !this.winOverlayScroll ||
      !this.winOverlayBigWinText ||
      !this.winOverlayMultiplierText ||
      !this.winOverlayCtaButton ||
      !this.winOverlayCtaText
    ) {
      return;
    }

    const width = this.app.screen.width;
    const height = this.app.screen.height;

    this.winOverlayBg.clear();
    // this.winOverlayBg.beginFill(0xffd24d, 0.45);
    // this.winOverlayBg.drawRect(0, 0, width, height);
    // this.winOverlayBg.endFill();

    const centerX = width * 0.5;
    const centerY = height * 0.5;

    const bodyTextureWidth = Math.max(1, this.winOverlayBody.texture.width);
    const bodyTargetWidth = Math.min(width * 0.9, 820);
    const bodyScale = bodyTargetWidth / bodyTextureWidth;
    this.winOverlayBody.scale.set(bodyScale);
    this.winOverlayBody.x = centerX;
    this.winOverlayBody.y = centerY;

    const bodyHeight = Math.max(1, this.winOverlayBody.height);
    const scrollTextureWidth = Math.max(1, this.winOverlayScroll.texture.width);
    const scrollTargetWidth = Math.min(width * 0.85, 720);
    const scrollScale = scrollTargetWidth / scrollTextureWidth;
    this.winOverlayScroll.scale.set(scrollScale);
    this.winOverlayScroll.x = centerX;
    const winOverlayConfig = GameConfig.winOverlay ?? {};
    const scrollOffsetRatio = winOverlayConfig.scrollOffsetYRatio ?? 0.45;
    this.winOverlayScroll.y = centerY - bodyHeight * scrollOffsetRatio;
    this.winOverlayScrollTargetY = this.winOverlayScroll.y;

    const bigWinFontSize = Math.max(20, bodyHeight * 0.16);
    const multiplierFontSize = Math.max(20, bodyHeight * 0.18);

    this.winOverlayBigWinText.style.fontSize = bigWinFontSize;
    this.winOverlayBigWinText.style.stroke.width = Math.max(
      2,
      bigWinFontSize * 0.08
    );
    this.winOverlayBigWinText.x = centerX;
    this.winOverlayBigWinText.y = centerY - bodyHeight * 0.15;

    this.winOverlayMultiplierText.style.fontSize = multiplierFontSize;
    this.winOverlayMultiplierText.style.stroke.width = Math.max(
      2,
      multiplierFontSize * 0.08
    );
    this.winOverlayMultiplierText.x = centerX;
    this.winOverlayMultiplierText.y = centerY + bodyHeight * 0.08;

    const ctaTextureWidth = Math.max(1, this.winOverlayCtaButton.texture.width);
    const ctaTargetWidth = Math.min(
      bodyTargetWidth * (winOverlayConfig.ctaButtonWidthRatio ?? 0.7),
      width * 0.8
    );
    const ctaScale = ctaTargetWidth / ctaTextureWidth;
    this.winOverlayCtaButton.scale.set(ctaScale);
    this.winOverlayCtaBaseScale = ctaScale;
    if (this.winOverlayCtaPressed) {
      this.winOverlayCtaButton.scale.set(ctaScale * 0.94);
    }
    this.winOverlayCtaText.scale.set(this.winOverlayCtaPressed ? 0.94 : 1);
    this.winOverlayCtaButton.x = centerX;
    this.winOverlayCtaButton.y =
      centerY + bodyHeight * (winOverlayConfig.ctaButtonOffsetYRatio ?? 0.6);

    const ctaTextSizeRatio = winOverlayConfig.ctaTextSizeRatio ?? 0.32;
    this.winOverlayCtaText.style.fontSize = Math.max(
      14,
      this.winOverlayCtaButton.height * ctaTextSizeRatio
    );
    this.winOverlayCtaText.style.stroke.width = Math.max(
      2,
      this.winOverlayCtaText.style.fontSize * 0.08
    );
    this.winOverlayCtaText.x = centerX;
    this.winOverlayCtaText.y =
      this.winOverlayCtaButton.y +
      this.winOverlayCtaButton.height * (winOverlayConfig.ctaTextOffsetYRatio ?? 0);
  }

  updateWinOverlayText() {
    if (!this.winOverlayMultiplierText) return;
    this.winOverlayMultiplierText.text = `${this.currentMultiplier.toFixed(2)}x`;
  }

  openCtaUrl() {
    const configUrl = GameConfig.winOverlay?.ctaUrl;
    const fallbackUrl =
      typeof window !== "undefined" ? window.clickTag || "" : "";
    const url = configUrl || fallbackUrl;
    if (window?.ExitApi?.exit) {
      if (url && typeof window !== "undefined" && !window.clickTag) {
        window.clickTag = url;
      }
      window.ExitApi.exit();
      return;
    }
    if (window?.FbPlayableAd?.onCTAClick) {
      window.FbPlayableAd.onCTAClick();
      return;
    }
    if (window?.mraid?.open) {
      if (url) {
        window.mraid.open(url);
      }
      return;
    }
    if (url) {
      window.open(url, "_blank");
    }
  }

  setUiLayerVisible(isVisible) {
    if (!this.uiLayer) return;
    this.uiLayer.style.display = isVisible ? this.uiLayerDisplay : "none";
  }

  showWinOverlay() {
    if (!this.winOverlay) return;
    this.updateWinOverlayLayout();
    this.updateWinOverlayText();
    this.setUiLayerVisible(false);
    this.winOverlay.renderable = true;
    this.winOverlay.visible = true;
    this.winOverlay.alpha = 0;
    gsap.killTweensOf(this.winOverlay);
    gsap.to(this.winOverlay, {
      alpha: 1,
      duration: 0.4,
      ease: "power2.out",
    });

    if (this.winOverlayScroll) {
      const scrollTargetY =
        this.winOverlayScrollTargetY ?? this.winOverlayScroll.y;
      gsap.killTweensOf(this.winOverlayScroll);
      this.winOverlayScroll.y = scrollTargetY;
    }

    this.startWinCoinRain();
  }

  hideWinOverlay() {
    if (!this.winOverlay) return;
    gsap.killTweensOf(this.winOverlay);
    if (this.winOverlayScroll) {
      gsap.killTweensOf(this.winOverlayScroll);
    }
    this.stopWinCoinRain();
    this.winOverlay.renderable = false;
    this.winOverlay.visible = false;
    this.winOverlay.alpha = 1;
    this.setUiLayerVisible(true);
  }

  getNextCoinRandom() {
    this.coinSeed = (this.coinSeed * 1664525 + 1013904223) >>> 0;
    return this.coinSeed / 4294967295;
  }

  getCoinSprite(textureAlias) {
    const texture = PIXI.Assets.get(textureAlias) || PIXI.Texture.WHITE;
    const sprite = this.coinPool.pop() || new PIXI.Sprite(texture);
    sprite.texture = texture;
    sprite.anchor.set(0.5, 0.5);
    sprite.renderable = true;
    sprite.visible = true;
    sprite.alpha = 1;
    sprite.rotation = 0;
    return sprite;
  }

  releaseCoinSprite(sprite) {
    gsap.killTweensOf(sprite);
    sprite.renderable = false;
    sprite.visible = false;
    sprite.alpha = 1;
    sprite.removeFromParent();
    const index = this.coinActive.indexOf(sprite);
    if (index >= 0) {
      this.coinActive.splice(index, 1);
    }
    this.coinPool.push(sprite);
  }

  spawnWinCoin({
    centerX,
    startY,
    endY,
    spread,
    durationMin,
    durationMax,
    minScale,
    maxScale,
    fadeStartRatio,
  }) {
    if (!this.winOverlayCoinLayer) return;
    const typeRoll = this.getNextCoinRandom();
    const textureAlias = typeRoll < 0.5 ? "coin_top" : "coin_small";
    const sprite = this.getCoinSprite(textureAlias);

    const x = centerX + (this.getNextCoinRandom() - 0.5) * spread;
    const drift = (this.getNextCoinRandom() - 0.5) * spread * 0.2;
    const scale =
      minScale + (maxScale - minScale) * this.getNextCoinRandom();
    const duration =
      durationMin + (durationMax - durationMin) * this.getNextCoinRandom();

    sprite.x = x;
    sprite.y = startY;
    sprite.scale.set(scale);
    sprite.rotation = (this.getNextCoinRandom() - 0.5) * Math.PI * 1.2;

    this.winOverlayCoinLayer.addChild(sprite);
    this.coinActive.push(sprite);

    gsap.to(sprite, {
      x: x + drift,
      y: endY,
      duration,
      ease: "power1.in",
      onComplete: () => this.releaseCoinSprite(sprite),
    });
    gsap.to(sprite, {
      alpha: 0,
      duration: duration * (1 - fadeStartRatio),
      delay: duration * fadeStartRatio,
      ease: "power1.in",
    });
  }

  startWinCoinRain() {
    if (!this.app || !this.winOverlayCoinLayer) return;
    this.stopWinCoinRain();

    const config = GameConfig.winCoins ?? {};
    const count = config.count ?? 16;
    const spawnInterval = config.spawnInterval ?? 0.05;
    const durationMin = config.fallDurationMin ?? 0.9;
    const durationMax = Math.max(durationMin, config.fallDurationMax ?? 1.2);
    const startYOffsetRatio = config.startYOffsetRatio ?? 0.15;
    const endYOffsetRatio = config.endYOffsetRatio ?? 0.1;
    const xSpreadRatio = config.xSpreadRatio ?? 0.8;
    const minScale = config.minScale ?? 0.5;
    const maxScale = Math.max(minScale, config.maxScale ?? 0.7);
    const fadeStartRatio = config.fadeStartRatio ?? 0.75;

    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const centerX = width * 0.5;
    const spread = width * xSpreadRatio;
    const startY = -height * startYOffsetRatio;
    const endY = height * (1 + endYOffsetRatio);

    this.coinSeed = (this.coinSeed + 1) >>> 0;
    this.coinSpawnTimeline = gsap.timeline({
      repeat: -1,
      onRepeat: () => {
        this.coinSeed = (this.coinSeed + 1) >>> 0;
      },
    });
    for (let i = 0; i < count; i += 1) {
      this.coinSpawnTimeline.call(
        () =>
          this.spawnWinCoin({
            centerX,
            startY,
            endY,
            spread,
            durationMin,
            durationMax,
            minScale,
            maxScale,
            fadeStartRatio,
          }),
        null,
        i * spawnInterval
      );
    }
  }

  stopWinCoinRain() {
    if (this.coinSpawnTimeline) {
      this.coinSpawnTimeline.kill();
      this.coinSpawnTimeline = null;
    }
    if (this.coinActive.length) {
      const activeCoins = [...this.coinActive];
      activeCoins.forEach((coin) => this.releaseCoinSprite(coin));
    }
  }

  updateLandingPanelMultiplier() {
    if (!this.landingPanelText) return;
    this.landingPanelText.text = `${this.currentMultiplier.toFixed(2)}x`;
  }

  updateLandingEggMultiplier() {
    if (!this.landingEggText) return;
    const target = this.getLandingEggTargetMultiplier(
      this.landingEggUsesEndPlatform
    );
    this.setLandingEggMultiplierValue(target);
  }

  getLandingEggTargetMultiplier(isFinal) {
    if (isFinal) return this.currentMultiplier;
    const config = GameConfig.modes[this.mode];
    const increment = config?.multiplierIncrement ?? 0;
    return parseFloat((this.currentMultiplier + increment).toFixed(2));
  }

  setLandingEggMultiplierValue(value) {
    if (!this.landingEggText) return;
    const safeValue = Number.isFinite(value) ? value : this.currentMultiplier;
    this.landingEggMultiplierValue = safeValue;
    this.landingEggText.text = `${safeValue.toFixed(2)}x`;
  }

  updateLandingPanelPosition() {
    if (
      !this.landingPanel ||
      this.landingPanelLaneIndex === null ||
      this.landingPanelLaneIndex === undefined
    ) {
      return;
    }
    const rail = this.railroads[this.landingPanelLaneIndex];
    if (!rail) return;
    const offsetX = GameConfig.assets.panelOffsetX ?? 0;
    const offsetY = GameConfig.assets.panelOffsetY ?? 80;
    const panelHalfWidth = this.landingPanelSprite
      ? this.landingPanelSprite.width * 0.5
      : 0;
    this.landingPanel.x = rail.x + offsetX - panelHalfWidth;
    this.landingPanel.y = rail.y + offsetY;
  }

  updateLandingEggPosition() {
    if (!this.landingEgg) return;
    if (
      !this.landingEggUsesEndPlatform &&
      (this.landingEggLaneIndex === null ||
        this.landingEggLaneIndex === undefined)
    ) {
      return;
    }
    const target = this.getLandingTargetPosition({
      laneIndex: this.landingEggLaneIndex,
      isFinal: this.landingEggUsesEndPlatform,
    });
    if (!target) return;
    const offsetX = GameConfig.assets.landingEggOffsetX ?? 0;
    const offsetY = GameConfig.assets.landingEggOffsetY ?? 0;
    this.landingEggBaseX = target.x + offsetX;
    this.landingEggBaseY = target.y + offsetY;
    this.landingEgg.x = this.landingEggBaseX;
    this.landingEgg.y = this.landingEggBaseY;
  }

  showLandingPanel(laneIndex) {
    if (!this.landingPanel) return;
    this.landingPanelLaneIndex = laneIndex;
    this.updateLandingPanelPosition();
    this.updateLandingPanelMultiplier();
    this.landingPanel.renderable = true;
    this.landingPanel.visible = true;
    const startRotation = GameConfig.animations?.panelRevealRotation ?? -0.6;
    const duration = GameConfig.animations?.panelRevealDuration ?? 0.35;
    gsap.killTweensOf(this.landingPanel);
    this.landingPanel.rotation = startRotation;
    this.landingPanel.alpha = 0;
    if (duration <= 0) {
      this.landingPanel.rotation = 0;
      this.landingPanel.alpha = 1;
    } else {
      gsap.to(this.landingPanel, {
        rotation: 0,
        alpha: 1,
        duration,
        ease: "power2.out",
      });
    }
    if (this.world?.sortChildren) {
      this.world.sortChildren();
    }
  }

  showLandingEgg(laneIndex, isFinal) {
    if (!this.landingEgg) return;
    this.landingEggLaneIndex = isFinal ? null : laneIndex;
    this.landingEggUsesEndPlatform = Boolean(isFinal);
    this.landingEggFloatTime = 0;
    this.setLandingEggMultiplierValue(
      this.getLandingEggTargetMultiplier(isFinal)
    );
    this.updateLandingEggPosition();
    gsap.killTweensOf(this.landingEgg);
    gsap.killTweensOf(this.landingEgg.scale);
    this.landingEgg.renderable = true;
    this.landingEgg.visible = true;
    this.landingEgg.alpha = 1;
    this.landingEgg.scale.set(this.landingEggBaseScale);
    if (this.landingEggLight) {
      this.landingEggLight.rotation = 0;
    }
    if (this.world?.sortChildren) {
      this.world.sortChildren();
    }
  }

  hideLandingEgg() {
    if (!this.landingEgg) return;
    gsap.killTweensOf(this.landingEgg);
    gsap.killTweensOf(this.landingEgg.scale);
    this.landingEggLaneIndex = null;
    this.landingEggUsesEndPlatform = false;
    this.landingEgg.renderable = false;
    this.landingEgg.visible = false;
    this.landingEgg.alpha = 1;
    this.landingEgg.scale.set(this.landingEggBaseScale);
    if (this.landingEggLight) {
      this.landingEggLight.rotation = 0;
    }
  }

  updateLandingEggLight(ticker) {
    if (!this.landingEggLight || !this.landingEgg?.visible) return;
    const deltaMS = ticker?.deltaMS ?? 16.6667;
    const spinSpeed =
      GameConfig.animations?.landingEggLightSpinSpeed ?? Math.PI * 0.6;
    this.landingEggLight.rotation += (spinSpeed * deltaMS) / 1000;
  }

  updateLandingEggFloat(ticker) {
    if (!this.landingEgg || !this.landingEgg.visible) return;
    const deltaMS = ticker?.deltaMS ?? 16.6667;
    const amplitude = GameConfig.animations?.landingEggFloatAmplitude ?? 12;
    const speed = GameConfig.animations?.landingEggFloatSpeed ?? Math.PI * 1.2;
    this.landingEggFloatTime += (deltaMS / 1000) * speed;
    const offset = Math.sin(this.landingEggFloatTime) * amplitude;
    this.landingEgg.x = this.landingEggBaseX;
    this.landingEgg.y = this.landingEggBaseY + offset;
  }

  playLandingEggPop() {
    if (!this.landingEgg || !this.landingEgg.visible) return;
    this.playSound("move");
    const duration = GameConfig.animations?.landingEggPopDuration ?? 0.22;
    gsap.killTweensOf(this.landingEgg);
    gsap.killTweensOf(this.landingEgg.scale);
    if (duration <= 0) {
      this.hideLandingEgg();
      return;
    }
    gsap.to(this.landingEgg, {
      alpha: 0,
      duration,
      ease: "power2.in",
      onComplete: () => {
        this.hideLandingEgg();
        if (this.state !== "RUNNING") return;
        if (this.step > this.maxSteps) return;
        const isFinalNext = this.step >= this.maxSteps;
        this.showLandingEgg(this.step, isFinalNext);
      },
    });
    gsap.to(this.landingEgg.scale, {
      x: 0,
      y: 0,
      duration,
      ease: "power2.in",
    });
  }

  hideLandingPanel() {
    if (!this.landingPanel) return;
    this.landingPanelLaneIndex = null;
    const duration = GameConfig.animations?.panelRevealDuration ?? 0.35;
    gsap.killTweensOf(this.landingPanel);
    this.landingPanel.renderable = true;
    this.landingPanel.visible = true;
    this.landingPanel.rotation = 0;
    this.landingPanel.alpha = 1;
    if (duration <= 0) {
      this.landingPanel.renderable = false;
      this.landingPanel.visible = false;
    } else {
      gsap.to(this.landingPanel, {
        alpha: 0,
        duration,
        ease: "power2.out",
        onComplete: () => {
          this.landingPanel.renderable = false;
          this.landingPanel.visible = false;
        },
      });
    }
  }

  createPlatformContainer(
    { mirrored = false, storeKioskRef = false, decorType = "start" } = {}
  ) {
    const platform = new PIXI.Container();
    const platTexture = PIXI.Assets.get("platform_corner");
    const platformScaleX = 0.55;
    const platformScaleY = 0.8;
    let platformColumnWidth = 0;
    if (platTexture) {
      platformColumnWidth = platTexture.width * platformScaleX;
      for (let i = -2; i <= 2; i++) {
        const p = new PIXI.Sprite(platTexture);
        p.anchor.set(0.3, 1);
        p.scale.set(platformScaleX, platformScaleY);
        p.y = i * (platTexture.height * platformScaleY);
        platform.addChild(p);
      }
    }

    const platformTexture = PIXI.Assets.get("platform");
    if (platformTexture) {
      const extraPlatform = new PIXI.Sprite(platformTexture);
      extraPlatform.anchor.set(1, 1);
      extraPlatform.scale.set(platformScaleX, platformScaleY);
      extraPlatform.x = -platformColumnWidth * 0.3;
      extraPlatform.y = 0;
      platform.addChild(extraPlatform);

      const platformStepY = platformTexture.height * platformScaleY;
      const platformStepX = platformTexture.width * platformScaleX;
      const topPlatform = new PIXI.Sprite(platformTexture);
      topPlatform.anchor.set(1, 1);
      topPlatform.scale.set(platformScaleX, platformScaleY);
      topPlatform.x = extraPlatform.x;
      topPlatform.y = extraPlatform.y - platformStepY;
      platform.addChild(topPlatform);

      const bottomPlatform = new PIXI.Sprite(platformTexture);
      bottomPlatform.anchor.set(1, 1);
      bottomPlatform.scale.set(platformScaleX, platformScaleY);
      bottomPlatform.x = extraPlatform.x;
      bottomPlatform.y = extraPlatform.y + platformStepY;
      platform.addChild(bottomPlatform);

      const extraBottom = new PIXI.Sprite(platformTexture);
      extraBottom.anchor.set(1, 1);
      extraBottom.scale.set(platformScaleX, platformScaleY);
      extraBottom.x = extraPlatform.x;
      extraBottom.y = extraPlatform.y + platformStepY * 2;
      platform.addChild(extraBottom);

      if (decorType === "end") {
        const rightPlatform = new PIXI.Sprite(platformTexture);
        rightPlatform.anchor.set(1, 1);
        rightPlatform.scale.set(platformScaleX, platformScaleY);
        const rightOffset = platformStepX * 0.9;
        rightPlatform.x = extraPlatform.x + (mirrored ? -rightOffset : rightOffset);
        rightPlatform.y = extraPlatform.y;
        platform.addChild(rightPlatform);

        const rightPlatformBottom = new PIXI.Sprite(platformTexture);
        rightPlatformBottom.anchor.set(1, 1);
        rightPlatformBottom.scale.set(platformScaleX, platformScaleY);
        rightPlatformBottom.x =
          extraPlatform.x + (mirrored ? -rightOffset : rightOffset);
        rightPlatformBottom.y = extraPlatform.y + platformStepY;
        platform.addChild(rightPlatformBottom);

        const rightPlatformBottom2 = new PIXI.Sprite(platformTexture);
        rightPlatformBottom2.anchor.set(1, 1);
        rightPlatformBottom2.scale.set(platformScaleX, platformScaleY);
        rightPlatformBottom2.x =
          extraPlatform.x + (mirrored ? -rightOffset : rightOffset);
        rightPlatformBottom2.y = extraPlatform.y + platformStepY * 2;
        platform.addChild(rightPlatformBottom2);
      }
    }

    // Decorations
    let primaryDecor = null;
    let landingOffsetX = null;
    if (decorType === "end") {
      const bankTexture = PIXI.Assets.get("bank");
      const bank = new PIXI.Sprite(bankTexture || PIXI.Texture.WHITE);
      bank.anchor.set(0.5, 1);
      const bankLandingOffsetX = -70;
      bank.x = -220;
      bank.y = -230;
      bank.scale.set(1.10);
      bank.scale.x *= -1;
      platform.addChild(bank);
      primaryDecor = bank;
      landingOffsetX = bankLandingOffsetX;
    } else {
      const kioskTexture = PIXI.Assets.get("kiosk");
      const kiosk = new PIXI.Sprite(kioskTexture || PIXI.Texture.WHITE);
      kiosk.anchor.set(0.5, 1);
      kiosk.x = 30;
      kiosk.y = -50;
      kiosk.scale.set(0.55);
      platform.addChild(kiosk);

      const benchTexture = PIXI.Assets.get("bench");
      const bench = new PIXI.Sprite(benchTexture || PIXI.Texture.WHITE);
      bench.anchor.set(0.5, 1);
      bench.x = 10;
      bench.y = 200;
      bench.scale.set(0.5);
      platform.addChild(bench);

      const lampTexture = PIXI.Assets.get("street_lamp");
      const lamp = new PIXI.Sprite(lampTexture || PIXI.Texture.WHITE);
      lamp.anchor.set(0.5, 1);
      lamp.x = 50;
      lamp.y = -400;
      lamp.scale.set(0.5);
      platform.addChild(lamp);

      primaryDecor = kiosk;
    }

    if (mirrored) {
      platform.scale.x = -1;
    }

    if (storeKioskRef && primaryDecor) {
      this.kiosk = primaryDecor;
    }

    if (landingOffsetX === null) {
      landingOffsetX = primaryDecor?.x ?? 0;
    }
    return { container: platform, kioskOffsetX: landingOffsetX };
  }

  getRailroadSprite(texture, scale) {
    const sprite = this.railroadPool.pop() || new PIXI.Sprite(texture);
    sprite.texture = texture;
    sprite.anchor.set(0.5, 0.5);
    sprite.scale.set(scale);
    sprite.zIndex = 2;
    sprite.renderable = true;
    sprite.visible = true;
    return sprite;
  }

  getMetalPlateSprite(texture, scale) {
    const sprite = this.metalPlatePool.pop() || new PIXI.Sprite(texture);
    sprite.texture = texture;
    sprite.anchor.set(0.5, 1);
    sprite.scale.set(scale);
    sprite.zIndex = 3;
    sprite.renderable = true;
    sprite.visible = true;
    sprite.alpha = 1;
    return sprite;
  }

  getGoldPlateSprite(texture, scale) {
    const sprite = this.goldPlatePool.pop() || new PIXI.Sprite(texture);
    sprite.texture = texture;
    sprite.anchor.set(0.5, 1);
    sprite.scale.set(scale);
    sprite.zIndex = 4;
    sprite.renderable = true;
    sprite.visible = true;
    sprite.alpha = 0;
    return sprite;
  }

  getRailwaySignSprite(texture, scale) {
    const sprite = this.railwaySignPool.pop() || new PIXI.Sprite(texture);
    sprite.texture = texture;
    sprite.anchor.set(0.5, 1);
    sprite.scale.set(scale);
    sprite.zIndex = 3;
    sprite.renderable = true;
    sprite.visible = true;
    return sprite;
  }

  getBarrierBasisSprite(texture, scale) {
    const sprite = this.barrierBasePool.pop() || new PIXI.Sprite(texture);
    sprite.texture = texture;
    sprite.anchor.set(0.5, 1);
    sprite.scale.set(scale);
    sprite.zIndex = 4;
    sprite.renderable = true;
    sprite.visible = true;
    return sprite;
  }

  getBarrierButtonSprite(texture, scale) {
    const sprite = this.barrierButtonPool.pop() || new PIXI.Sprite(texture);
    sprite.texture = texture;
    sprite.anchor.set(0.5, 1);
    sprite.scale.set(scale);
    sprite.zIndex = 5;
    sprite.renderable = true;
    sprite.visible = true;
    return sprite;
  }

  getBarrierButtonOverlaySprite(texture, scale) {
    const sprite =
      this.barrierButtonOverlayPool.pop() || new PIXI.Sprite(texture);
    sprite.texture = texture;
    sprite.anchor.set(0.5, 1);
    sprite.scale.set(scale);
    sprite.zIndex = 6;
    sprite.renderable = true;
    sprite.visible = true;
    sprite.alpha = 0;
    return sprite;
  }

  getBarrierSprite(texture, scale) {
    const sprite = this.barrierPool.pop() || new PIXI.Sprite(texture);
    sprite.texture = texture;
    sprite.anchor.set(1, 0.5);
    sprite.scale.set(scale);
    const baseRotation = GameConfig.assets.barrierBaseRotation ?? 0;
    sprite.rotation = baseRotation;
    sprite.zIndex = 3;
    sprite.renderable = true;
    sprite.visible = true;
    sprite.isClosed = false;
    sprite.stopY = null;
    return sprite;
  }

  resetGoldPlates() {
    this.plateGroups.forEach((group) => {
      group.revealed = false;
      group.gold.forEach((plate) => {
        plate.alpha = 0;
        plate.renderable = true;
        plate.visible = true;
      });
    });
  }

  resetBarriers() {
    const baseRotation = GameConfig.assets.barrierBaseRotation ?? 0;
    this.barriers.forEach((barrier) => {
      gsap.killTweensOf(barrier);
      barrier.rotation = baseRotation;
      barrier.isClosed = false;
      barrier.stopY = null;
    });
    this.barrierButtonOverlays.forEach((overlay) => {
      gsap.killTweensOf(overlay);
      overlay.alpha = 0;
      overlay.renderable = true;
      overlay.visible = true;
    });
  }

  resetBarrierZIndexes() {
    this.barrierBases.forEach((base) => {
      base.zIndex = 4;
    });
    this.barriers.forEach((barrier) => {
      barrier.zIndex = 3;
    });
    this.barrierButtons.forEach((button) => {
      button.zIndex = 5;
    });
    this.barrierButtonOverlays.forEach((overlay) => {
      overlay.zIndex = 6;
    });
    if (this.world?.sortChildren) {
      this.world.sortChildren();
    }
  }

  raiseBarrierZForStep(stepIndex) {
    const barrier = this.barriers[stepIndex];
    const barrierBase = this.barrierBases[stepIndex];
    const barrierButton = this.barrierButtons[stepIndex];
    const barrierButtonOverlay = this.barrierButtonOverlays[stepIndex];
    if (barrierBase) {
      barrierBase.zIndex = 251;
    }
    if (barrier) {
      barrier.zIndex = 250;
    }
    if (barrierButton) {
      barrierButton.zIndex = 252;
    }
    if (barrierButtonOverlay) {
      barrierButtonOverlay.zIndex = 253;
    }
    if (this.world?.sortChildren) {
      this.world.sortChildren();
    }
  }

  rotateBarrierForStep(stepIndex) {
    const barrier = this.barriers[stepIndex];
    const barrierButtonOverlay = this.barrierButtonOverlays[stepIndex];
    if (!barrier) return;
    barrier.anchor.set(1, 0.5);
    const baseRotation = GameConfig.assets.barrierBaseRotation ?? 0;
    const rotateDelta = GameConfig.assets.barrierRotateDelta ?? Math.PI / 2;
    const targetRotation = baseRotation + rotateDelta;
    const rotateDuration = GameConfig.animations?.barrierRotateDuration ?? 0.25;
    gsap.killTweensOf(barrier);
    barrier.isClosed = false;
    barrier.stopY = null;
    gsap.to(barrier, {
      rotation: targetRotation,
      duration: rotateDuration,
      ease: "power2.out",
      onComplete: () => {
        barrier.isClosed = true;
        barrier.stopY = this.getBarrierStopY(barrier);
      },
    });
    if (barrierButtonOverlay) {
      gsap.killTweensOf(barrierButtonOverlay);
      barrierButtonOverlay.alpha = 0;
      gsap.to(barrierButtonOverlay, {
        alpha: 1,
        duration: rotateDuration,
        ease: "power1.out",
      });
    }
    this.maybeSpawnBarrierTrain(stepIndex);
  }

  revealGoldPlates(stepIndex) {
    const group = this.plateGroups[stepIndex];
    if (!group || group.revealed) return;
    group.revealed = true;
    group.gold.forEach((plate, index) => {
      plate.alpha = 0;
      plate.renderable = true;
      plate.visible = true;
      gsap.to(plate, {
        alpha: 1,
        duration: 0.4,
        ease: "power1.out",
        delay: index * 0.06,
      });
    });
  }

  updateTrains(ticker) {
    if (!this.app || !this.world || !this.railroads.length) return;

    const deltaMS = ticker?.deltaMS ?? 16.6667;
    if (this.state === "RUNNING" && !this.isJumping) {
      this.trainSpawnTimer += deltaMS;

      if (this.trainSpawnTimer >= GameConfig.trains.spawnInterval) {
        this.trainSpawnTimer -= GameConfig.trains.spawnInterval;
        this.spawnTrain();
      }
    }

    const jumpBoost = this.isJumping
      ? GameConfig.trains.jumpSpeedMultiplier ?? 1
      : 1;
    const crashBoost = GameConfig.trains.crashSpeedMultiplier ?? 1;
    for (let i = this.trains.length - 1; i >= 0; i--) {
      const train = this.trains[i];
      const speed =
        GameConfig.trains.speed *
        (deltaMS / 1000) *
        jumpBoost *
        (train.isCrashTrain ? crashBoost : 1);
      const barrier = this.barriers[train.laneIndex];
      if (
        !this.isJumping &&
        train.laneIndex === this.activeLaneIndex &&
        !train.forceMove
      ) {
        continue;
      }
      if (
        train.stoppedAtBarrier &&
        barrier?.isClosed &&
        barrier.stopY !== null
      ) {
        train.y = barrier.stopY;
        continue;
      }
      if (!barrier?.isClosed || barrier.stopY === null) {
        train.stoppedAtBarrier = false;
      }
      const nextY = train.y + speed;
      if (
        !train.isCrashTrain &&
        barrier?.isClosed &&
        barrier.stopY !== null &&
        train.y < barrier.stopY &&
        nextY >= barrier.stopY
      ) {
        train.y = barrier.stopY;
        train.stoppedAtBarrier = true;
        continue;
      }
      train.y = nextY;
      if (
        train.isCrashTrain &&
        !this.crashImpactTriggered &&
        train.y >= train.crashHitY
      ) {
        this.crashImpactTriggered = true;
        this.playSound("pn");
        this.finishCrashImpact();
      }
      if (train.y > train.endY) {
        train.renderable = false;
        train.visible = false;
        train.removeFromParent();
        this.trains.splice(i, 1);
        this.trainPool.push(train);
        if (train === this.crashTrain) {
          this.crashTrain = null;
        }
      }
    }
  }

  spawnTrain() {
    if (!this.railroads.length) return;

    const laneIndex = this.getNextAvailableTrainLane();
    if (laneIndex === null) return;

    this.spawnTrainInLane(laneIndex, { forceMove: false });
  }

  spawnTrainInLane(laneIndex, { forceMove = false } = {}) {
    if (!this.railroads.length) return;
    if (laneIndex === null || laneIndex === undefined) return;

    if (this.hasActiveTrainInLane(laneIndex)) return;

    const rail = this.railroads[laneIndex];
    if (!rail) return;

    const train = this.getTrainSprite();
    train.laneIndex = laneIndex;
    train.forceMove = forceMove;
    train.x = rail.x;

    const travelBounds = this.getTrainTravelBounds(train);
    train.y = travelBounds.startY;
    train.endY = travelBounds.endY;

    this.world.addChild(train);
    this.trains.push(train);
  }

  hasActiveTrainInLane(laneIndex) {
    return this.trains.some(
      (train) =>
        train.laneIndex === laneIndex &&
        train.renderable &&
        train.visible &&
        !train.isCrashTrain
    );
  }

  getNextAvailableTrainLane() {
    if (!this.railroads.length) return null;
    const totalLanes = this.railroads.length;
    for (let attempt = 0; attempt < totalLanes; attempt++) {
      const laneIndex = this.nextTrainLane % totalLanes;
      this.nextTrainLane += 1;
      if (laneIndex !== this.activeLaneIndex) {
        return laneIndex;
      }
    }
    return null;
  }

  createFallbackTrain() {
    const sprite = new PIXI.Sprite(PIXI.Texture.WHITE);
    sprite.__isFallbackTrain = true;
    return sprite;
  }

  getTrainFrameTextures() {
    if (this.trainFrameTextures) return this.trainFrameTextures;
    const frames = AssetManifest.trainFrames || [];
    this.trainFrameTextures = frames
      .map((frame) => PIXI.Assets.get(frame.alias))
      .filter(Boolean);
    return this.trainFrameTextures;
  }

  getWinFrameTextures() {
    if (this.winFrameTextures) return this.winFrameTextures;
    const frames = AssetManifest.winFrames || [];
    this.winFrameTextures = frames
      .map((frame) => PIXI.Assets.get(frame.alias))
      .filter(Boolean);
    return this.winFrameTextures;
  }

  getJumpFrameTextures() {
    if (this.jumpFrameTextures) return this.jumpFrameTextures;
    const frames = AssetManifest.jumpFrames || [];
    this.jumpFrameTextures = frames
      .map(
        (frame) =>
          PIXI.Assets.get(frame.alias) || PIXI.Texture.from(frame.src)
      )
      .filter(Boolean);
    return this.jumpFrameTextures;
  }

  getTrainSprite() {
    const pooled = this.trainPool.pop();
    const frameTextures = this.getTrainFrameTextures();
    const useFrameAnimation = frameTextures.length > 0;
    const cacheHasTrain =
      typeof PIXI.Assets?.cache?.has === "function"
        ? PIXI.Assets.cache.has("train")
        : false;
    let sprite = pooled;

    if (useFrameAnimation) {
      if (!(sprite instanceof PIXI.AnimatedSprite)) {
        sprite = new PIXI.AnimatedSprite(frameTextures);
      } else {
        sprite.textures = frameTextures;
      }
      sprite.animationSpeed = GameConfig.assets.trainAnimSpeed ?? 0.2;
      sprite.loop = true;
      sprite.play();
    } else {
      if (!(sprite instanceof GifSprite)) {
        const source = cacheHasTrain ? PIXI.Assets.get("train") : null;
        sprite = source ? new GifSprite({ source }) : this.createFallbackTrain();
      }
    }

    sprite.anchor.set(0.5, 1);
    if (sprite.__isFallbackTrain) {
      const baseWidth = GameConfig.assets.trainWidth ?? 520;
      const baseHeight = GameConfig.assets.trainHeight ?? 220;
      const scale = GameConfig.assets.trainScale ?? 1;
      sprite.scale.set(1);
      sprite.width = baseWidth * scale;
      sprite.height = baseHeight * scale;
      sprite.tint = GameConfig.assets.trainTint ?? 0x4d4d4d;
    } else {
      sprite.scale.set(GameConfig.assets.trainScale ?? 1);
    }
    sprite.zIndex = 200;
    sprite.renderable = true;
    sprite.visible = true;
    sprite.forceMove = false;
    sprite.isCrashTrain = false;
    sprite.crashHitY = null;
    sprite.stoppedAtBarrier = false;
    return sprite;
  }

  getBarrierStopY(barrier) {
    if (!barrier) return null;
    const barrierHeight = Math.max(1, barrier.height || 1);
    const stopOffset = Math.max(10, barrierHeight * 0.25);
    return barrier.y - stopOffset;
  }

  maybeSpawnBarrierTrain(stepIndex) {
    const baseChance = GameConfig.modes[this.mode]?.trainChance ?? 0;
    const multiplier = GameConfig.trains.barrierSpawnChanceMultiplier ?? 1;
    const chance = Math.min(1, baseChance * multiplier);
    if (chance <= 0) return;
    if (this.getBarrierSpawnFloat() >= chance) return;
    this.spawnTrainInLane(stepIndex, { forceMove: true });
  }

  getTrainTravelBounds(train) {
    const centerY = this.railCenterY ?? this.platform.y - 60;
    const trainHeight = Math.max(1, train.height || 1);
    const startY =
      centerY -
      this.app.screen.height * GameConfig.trains.startOffset -
      trainHeight;
    const endY =
      centerY +
      this.app.screen.height * GameConfig.trains.endOffset +
      trainHeight;
    return { startY, endY };
  }

  updateTrainLanePositions() {
    if (!this.trains.length || !this.railroads.length) return;
    this.trains.forEach((train) => {
      const rail = this.railroads[train.laneIndex % this.railroads.length];
      if (rail) train.x = rail.x;
      const travelBounds = this.getTrainTravelBounds(train);
      train.endY = travelBounds.endY;
    });
  }
}
