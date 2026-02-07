import { Application, Assets, Sprite, Container, Graphics, Text, TextStyle, Texture, BlurFilter, ColorMatrixFilter, Filter, DisplacementFilter, NoiseFilter, RenderTexture } from 'pixi.js';
import 'pixi.js/advanced-blend-modes';
import { gsap } from 'gsap';

const USER_CONFIG = (globalThis.__USER_CONFIG__ && typeof globalThis.__USER_CONFIG__ === "object")
    ? globalThis.__USER_CONFIG__
    : {};
const CURRENCY = typeof USER_CONFIG.currency === "string" && USER_CONFIG.currency.trim()
    ? USER_CONFIG.currency
    : "$";
const STARTING_BALANCE = typeof USER_CONFIG.startingBalance === "number" && Number.isFinite(USER_CONFIG.startingBalance)
    ? Math.max(0, USER_CONFIG.startingBalance)
    : 0;
const TARGET_BALANCE_CONFIG = typeof USER_CONFIG.targetBalance === "number" && Number.isFinite(USER_CONFIG.targetBalance)
    ? Math.max(1, USER_CONFIG.targetBalance)
    : 20.0;

function formatMoney(value, digits = 2) {
    return `${CURRENCY}${value.toFixed(digits)}`;
}

// === ИМПОРТЫ АССЕТОВ ===
// Images
import bgUrl from './assets/background.jpg';
import iconUrl from './assets/playrush_icon.png';
import handUrl from './assets/hand.png';
import blockBlueUrl from './assets/sprite_0000.png';
import blockRedUrl from './assets/sprite_0001.png';
import blockGreenUrl from './assets/sprite_0002.png';
import blockYellowUrl from './assets/sprite_0003.png';
import targetBlueUrl from './assets/sprite_0000(1).png';
import targetYellowUrl from './assets/sprite_0001(1).png';
import targetRedUrl from './assets/sprite_0002(1).png';
import btnPlayUrl from './assets/sprite_0000(2).png';
import btnCashOutGrayUrl from './assets/sprite_0001(2).png';
import btnCashOutActiveUrl from './assets/sprite_0002(2).png';
import bubbleUrl from './assets/sprite_0003(1).png';
import progressFillUrl from './assets/sprite_0004.png';
import progressBgUrl from './assets/sprite_0005.png';

// Audio
import popSoundUrl from './assets/pop.mp3';
import coinSoundUrl from './assets/cash.mp3';
import winSoundUrl from './assets/win.mp3';
import bgMusicUrl from './assets/bg_music.mp3';

// === КОНСТАНТЫ ДИЗАЙНА ===
const DESIGN_W = 1080;
const DESIGN_H = 1920;

// === ВЕРСИЯ ИГРЫ ===
const GAME_VERSION = 2; // 1 = обычная, 2 = 2x деньги и быстрый прогресс
const MONEY_MULTIPLIER = GAME_VERSION === 2 ? 2.0 : 1.0; // Удваиваем деньги в версии 2

// === MRAID CTA REDIRECT ===
// AppLovin requires MRAID v2.0 for click-through redirects
const CLICK_URL = typeof USER_CONFIG.clickUrl === "string" && USER_CONFIG.clickUrl.trim()
    ? USER_CONFIG.clickUrl
    : "https://play.google.com/store/apps/details?id=io.playcharge.playrush&hl=en";

/**
 * Opens click-through URL using MRAID API (AppLovin requirement)
 * Falls back to window.open for browser testing
 */
function openClickThrough() {
    try {
        if (window.mraid) {
            const doOpen = () => {
                if (window.mraid.open) {
                    window.mraid.open(CLICK_URL);
                } else {
                    // Fallback if mraid.open is not available
                    console.warn('mraid.open not available');
                    window.open(CLICK_URL, '_blank');
                }
            };
            
            // Wait for MRAID ready state if loading
            if (window.mraid.getState && window.mraid.getState() === 'loading') {
                window.mraid.addEventListener('ready', doOpen);
            } else {
                doOpen();
            }
        } else {
            // Fallback for browser testing (no MRAID environment)
            window.open(CLICK_URL, '_blank');
        }
    } catch (e) {
        console.error('Error opening click-through:', e);
        // Fallback on error
        try {
            window.open(CLICK_URL, '_blank');
        } catch (e2) {
            console.error('Fallback also failed:', e2);
        }
    }
}

// === АССЕТЫ ===
const ASSET_LIST = {
    bg: bgUrl,
    icon: iconUrl,
    hand: handUrl,
    // Блоки
    blockBlue: blockBlueUrl,
    blockRed: blockRedUrl,
    blockGreen: blockGreenUrl,
    blockYellow: blockYellowUrl,
    // Цели
    targetBlue: targetBlueUrl,
    targetYellow: targetYellowUrl,
    targetRed: targetRedUrl,
    // UI
    btnPlay: btnPlayUrl,
    btnCashOutGray: btnCashOutGrayUrl,
    btnCashOutActive: btnCashOutActiveUrl,
    bubble: bubbleUrl,
    progressFill: progressFillUrl,
    progressBg: progressBgUrl
};

const SOUND_PATHS = {
    pop: popSoundUrl,
    coin: coinSoundUrl,
    win: winSoundUrl,
    bgMusic: bgMusicUrl
};

// === AUDIO MANAGER (WebAudio API) ===
class AudioManager {
    constructor() {
        this.context = new (window.AudioContext || window.webkitAudioContext)();
        this.sounds = {};
        this.musicSource = null;
        this.musicGain = null;
        this.isUnlocked = false;
        this.musicVolume = 0.5;
        
        // Unlock on first interaction
        const unlockAudio = () => {
            if (!this.isUnlocked && this.context.state === 'suspended') {
                this.context.resume();
            }
            this.isUnlocked = true;
            document.removeEventListener('pointerdown', unlockAudio);
            document.removeEventListener('touchstart', unlockAudio);
        };
        document.addEventListener('pointerdown', unlockAudio);
        document.addEventListener('touchstart', unlockAudio);
    }

    async loadSound(url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
            return audioBuffer;
        } catch (e) {
            console.warn('Failed to load sound:', url, e);
            return null;
        }
    }

    async init() {
        // Load all sounds
        for (const [name, path] of Object.entries(SOUND_PATHS)) {
            this.sounds[name] = await this.loadSound(path);
        }
    }

    playSFX(name, pitchVariation = false) {
        if (!this.isUnlocked && this.context.state === 'suspended') {
            this.context.resume();
            this.isUnlocked = true;
        }

        const buffer = this.sounds[name];
        if (!buffer) return;

        const source = this.context.createBufferSource();
        const gainNode = this.context.createGain();
        
        source.buffer = buffer;
        
        // Make cash.mp3 quieter
        const volume = (name === 'coin') ? 0.15 : 1.0;
        gainNode.gain.value = volume;
        
        if (pitchVariation) {
            const pitch = 0.9 + Math.random() * 0.2; // 0.9 to 1.1
            source.playbackRate.value = pitch;
        }
        
        source.connect(gainNode);
        gainNode.connect(this.context.destination);
        source.start(0);
    }

    playMusic(name, loop = true, volume = 0.5) {
        if (!this.isUnlocked && this.context.state === 'suspended') {
            this.context.resume();
            this.isUnlocked = true;
        }

        const buffer = this.sounds[name];
        if (!buffer) return;

        // Stop existing music
        if (this.musicSource) {
            this.musicSource.stop();
        }

        this.musicSource = this.context.createBufferSource();
        this.musicGain = this.context.createGain();
        
        this.musicSource.buffer = buffer;
        this.musicSource.loop = loop;
        this.musicGain.gain.value = volume;
        this.musicVolume = volume;
        
        this.musicSource.connect(this.musicGain);
        this.musicGain.connect(this.context.destination);
        this.musicSource.start(0);
    }

    setMusicVolume(volume, duration = 0) {
        if (!this.musicGain) return;
        
        if (duration > 0) {
            const startVolume = this.musicVolume;
            const animObj = { value: startVolume };
            gsap.to(animObj, {
                value: volume,
                duration: duration,
                ease: 'power2.inOut',
                onUpdate: () => {
                    if (this.musicGain) {
                        this.musicGain.gain.value = animObj.value;
                    }
                },
                onComplete: () => {
                    this.musicVolume = volume;
                }
            });
        } else {
            this.musicGain.gain.value = volume;
            this.musicVolume = volume;
        }
    }
}

// === PARTICLE SYSTEM (Object Pooling) ===
class ParticleSystem {
    constructor(container, poolSize = 100) {
        this.container = container;
        this.pool = [];
        this.active = [];
        this.poolSize = poolSize;
        
        // Pre-allocate particles
        for (let i = 0; i < poolSize; i++) {
            const particle = new Graphics();
            particle.visible = false;
            particle.active = false;
            this.pool.push(particle);
            this.container.addChild(particle);
        }
    }
    
    spawnConfetti(x, y, count = 50) {
        const colors = [0xFF0000, 0x00FF00, 0x0000FF, 0xFFFF00, 0xFF00FF, 0x00FFFF, 0xFFA500, 0xFFD700];
        
        for (let i = 0; i < count; i++) {
            let particle = this.pool.find(p => !p.active);
            if (!particle) {
                particle = new Graphics();
                this.container.addChild(particle);
            }
            
            const color = colors[Math.floor(Math.random() * colors.length)];
            const size = 8 + Math.random() * 12;
            const shape = Math.random() > 0.5 ? 'circle' : 'rect';
            
            particle.clear();
            if (shape === 'circle') {
                particle.circle(0, 0, size / 2).fill({ color, alpha: 1 });
            } else {
                particle.roundRect(-size/2, -size/2, size, size, size * 0.2).fill({ color, alpha: 1 });
            }
            
            particle.position.set(x, y);
            particle.visible = true;
            particle.active = true;
            particle.alpha = 1;
            particle.rotation = Math.random() * Math.PI * 2;
            
            const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.5;
            const speed = 150 + Math.random() * 100;
            particle.vx = Math.cos(angle) * speed;
            particle.vy = Math.sin(angle) * speed - 50;
            particle.gravity = 300;
            particle.rotationSpeed = (Math.random() - 0.5) * 10;
            particle.life = 1.5 + Math.random() * 1.0;
            particle.maxLife = particle.life;
            
            this.active.push(particle);
        }
    }
    
    spawnFountain(x, y, count = 60) {
        const colors = [0xFFD700, 0xFFFF00, 0xFFA500, 0xFF6B00, 0xFFD700, 0xFFF700];
        
        for (let i = 0; i < count; i++) {
            let particle = this.pool.find(p => !p.active);
            if (!particle) {
                particle = new Graphics();
                this.container.addChild(particle);
            }
            
            const color = colors[Math.floor(Math.random() * colors.length)];
            const size = 6 + Math.random() * 8;
            const shape = Math.random() > 0.6 ? 'circle' : 'star';
            
            particle.clear();
            if (shape === 'circle') {
                particle.circle(0, 0, size / 2).fill({ color, alpha: 1 });
            } else {
                // Simple star shape
                const spikes = 5;
                const outerRadius = size / 2;
                const innerRadius = outerRadius * 0.4;
                for (let j = 0; j < spikes * 2; j++) {
                    const radius = j % 2 === 0 ? outerRadius : innerRadius;
                    const angle = (Math.PI * j) / spikes;
                    const px = Math.cos(angle) * radius;
                    const py = Math.sin(angle) * radius;
                    if (j === 0) {
                        particle.moveTo(px, py);
                    } else {
                        particle.lineTo(px, py);
                    }
                }
                particle.closePath().fill({ color, alpha: 1 });
            }
            
            particle.position.set(x, y);
            particle.visible = true;
            particle.active = true;
            particle.alpha = 1;
            particle.rotation = Math.random() * Math.PI * 2;
            
            // Fountain: shoot UP with slight spread
            const spread = (Math.random() - 0.5) * 0.4; // -0.2 to 0.2 radians
            const speed = 200 + Math.random() * 150;
            particle.vx = Math.sin(spread) * speed * 0.3; // Small horizontal spread
            particle.vy = -Math.abs(Math.cos(spread) * speed); // Always upward (negative Y)
            particle.gravity = 350;
            particle.rotationSpeed = (Math.random() - 0.5) * 12;
            particle.life = 1.2 + Math.random() * 0.8;
            particle.maxLife = particle.life;
            
            this.active.push(particle);
        }
    }

    spawn(x, y, color, count = 8) {
        const tints = { 'red': 0xFF0000, 'green': 0x00FF00, 'blue': 0x0000FF, 'yellow': 0xFFFF00 };
        const tint = tints[color] || 0xFFFFFF;
        
        for (let i = 0; i < count && i < this.poolSize; i++) {
            let particle = this.pool.find(p => !p.active);
            if (!particle) {
                // If pool exhausted, create temporary particle
                particle = new Graphics();
                this.container.addChild(particle);
            }
            
            particle.clear();
            particle.circle(0, 0, 6 + Math.random() * 4).fill({ color: tint, alpha: 1 });
            particle.position.set(x, y);
            particle.visible = true;
            particle.active = true;
            particle.alpha = 1;
            
            // Physics properties
            const angle = Math.random() * Math.PI * 2;
            const speed = 60 + Math.random() * 40;
            particle.vx = Math.cos(angle) * speed;
            particle.vy = Math.sin(angle) * speed;
            particle.gravity = 200;
            particle.life = 0.4 + Math.random() * 0.2;
            particle.maxLife = particle.life;
            
            this.active.push(particle);
        }
    }

    update(deltaTime) {
        const dt = deltaTime / 60; // Normalize to 60fps
        
        for (let i = this.active.length - 1; i >= 0; i--) {
            const p = this.active[i];
            
            // Update physics
            p.vy += p.gravity * dt;
            
            // Apply drag if exists
            if (p.drag !== undefined) {
                p.vx *= p.drag;
                p.vy *= p.drag;
            }
            
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            
            // Update rotation if exists
            if (p.rotationSpeed !== undefined) {
                p.rotation += p.rotationSpeed * dt;
            }
            
            // Update life
            p.life -= dt;
            p.alpha = p.life / p.maxLife;
            
            // Recycle when dead
            if (p.life <= 0) {
                p.active = false;
                p.visible = false;
                this.active.splice(i, 1);
            }
        }
    }

    recycle(particle) {
        particle.active = false;
        particle.visible = false;
        const index = this.active.indexOf(particle);
        if (index > -1) {
            this.active.splice(index, 1);
        }
    }

    spawnCoinRain(width, topY, count, duration) {
        const colors = [0xFFD700, 0xFFA500, 0xFFE55C, 0xFFB800, 0xFFF700, 0xFFCC00];
        
        for (let i = 0; i < count; i++) {
            let particle = this.pool.find(p => !p.active);
            if (!particle) {
                // Pool exhausted - skip this particle instead of creating new one
                continue;
            }
            
            const color = colors[Math.floor(Math.random() * colors.length)];
            const size = 8 + Math.random() * 6;
            const shape = Math.random() > 0.3 ? 'circle' : 'roundRect';
            
            particle.clear();
            if (shape === 'circle') {
                particle.circle(0, 0, size / 2).fill({ color, alpha: 1 });
            } else {
                particle.roundRect(-size/2, -size/2, size, size, size * 0.3).fill({ color, alpha: 1 });
            }
            
            particle.position.set(
                -width/2 + Math.random() * width,
                topY
            );
            particle.visible = true;
            particle.active = true;
            particle.alpha = 1;
            particle.rotation = Math.random() * Math.PI * 2;
            
            // Physics: fall down with slight sway
            const speed = 150 + Math.random() * 100; // 150-250 px/s
            const swayAmount = 20 + Math.random() * 30; // horizontal sway
            particle.vx = (Math.random() - 0.5) * swayAmount;
            particle.vy = speed;
            particle.gravity = 300;
            particle.rotationSpeed = (Math.random() - 0.5) * 8;
            particle.drag = 0.98; // slight air resistance
            particle.life = duration || (1.5 + Math.random() * 1.0);
            particle.maxLife = particle.life;
            
            this.active.push(particle);
        }
    }
}

// === MEGA WIN FX MANAGER ===
class MegaWinFXManager {
    constructor(app, mainContainer, boardContainer, overlayLayer, fxLayer) {
        this.app = app;
        this.mainContainer = mainContainer;
        this.boardContainer = boardContainer;
        this.overlayLayer = overlayLayer;
        this.fxLayer = fxLayer;
        
        // Pre-create filters (reuse, don't allocate on each mega win)
        this.noiseFilter = new NoiseFilter({ noise: 0 });
        this.blurFilter = new BlurFilter({ strength: 0 });
        this.colorMatrixFilter = new ColorMatrixFilter();
        
        // Create displacement texture procedurally
        this.displacementSprite = this.createDisplacementSprite();
        this.displacementFilter = new DisplacementFilter({ sprite: this.displacementSprite, scale: 0 });
        
        // Add displacement sprite to scene (hidden, only used for filter)
        this.displacementSprite.visible = false;
        this.fxLayer.addChild(this.displacementSprite);
        
        // Animation state
        this.isAnimatingDisplacement = false;
        this.displacementTween = null;
        
        // Shock rings pool
        this.shockRings = [];
    }
    
    createDisplacementSprite() {
        // Generate 128x128 noise texture procedurally
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        // Fill with noise
        const imageData = ctx.createImageData(size, size);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            // Perlin-like noise would be better, but simple random works
            const value = Math.random() * 255;
            data[i] = value;     // R
            data[i + 1] = value; // G
            data[i + 2] = value; // B
            data[i + 3] = 255;   // A
        }
        ctx.putImageData(imageData, 0, 0);
        
        const texture = Texture.from(canvas);
        const sprite = new Sprite(texture);
        // Scale to cover screen (will be animated) - use design dimensions
        sprite.width = DESIGN_W * 2; // Large enough to cover screen
        sprite.height = DESIGN_H * 2;
        sprite.anchor.set(0.5);
        sprite.position.set(0, 0);
        
        return sprite;
    }
    
    enableImpactFilters(intensity, centerX, centerY) {
        // Configure filters
        this.colorMatrixFilter.saturate(intensity);
        this.colorMatrixFilter.brightness(1 + intensity * 0.2);
        this.colorMatrixFilter.contrast(1 + intensity * 0.3);
        this.blurFilter.strength = intensity * 3;
        this.noiseFilter.noise = intensity * 0.12;
        this.displacementFilter.scale.set(intensity * 15);
        
        // Apply filters to boardContainer (or mainContainer)
        this.boardContainer.filters = [
            this.colorMatrixFilter,
            this.displacementFilter,
            this.blurFilter,
            this.noiseFilter
        ];
        
        // Animate displacement sprite for "screen warp" effect
        this.displacementSprite.visible = true;
        this.displacementSprite.position.set(centerX, centerY);
        this.isAnimatingDisplacement = true;
        
        // Animate displacement position/scale
        const animObj = { 
            x: 0, 
            y: 0, 
            scale: 1.0 
        };
        
        this.displacementTween = gsap.to(animObj, {
            x: (Math.random() - 0.5) * 20,
            y: (Math.random() - 0.5) * 20,
            scale: 1.0 + Math.random() * 0.3,
            duration: 0.25,
            ease: 'power2.inOut',
            yoyo: true,
            repeat: 3,
            onUpdate: () => {
                this.displacementSprite.position.set(
                    centerX + animObj.x,
                    centerY + animObj.y
                );
                this.displacementSprite.scale.set(animObj.scale);
            },
            onComplete: () => {
                this.isAnimatingDisplacement = false;
            }
        });
    }
    
    disableImpactFilters() {
        // Remove filters
        this.boardContainer.filters = null;
        this.displacementSprite.visible = false;
        
        // Kill displacement animation
        if (this.displacementTween) {
            this.displacementTween.kill();
            this.displacementTween = null;
        }
        this.isAnimatingDisplacement = false;
        
        // Reset filter values
        this.blurFilter.strength = 0;
        this.noiseFilter.noise = 0;
        this.displacementFilter.scale.set(0);
        this.colorMatrixFilter.reset();
    }
    
    playShockRing(x, y) {
        const ring = new Graphics();
        ring.circle(0, 0, 30).stroke({ color: 0xFFFFFF, width: 4, alpha: 1 });
        ring.position.set(x, y);
        ring.alpha = 1;
        ring.scale.set(0.5);
        this.fxLayer.addChild(ring);
        
        // Animate ring expansion
        gsap.to(ring.scale, {
            x: 3,
            y: 3,
            duration: 0.4,
            ease: 'power2.out'
        });
        gsap.to(ring, {
            alpha: 0,
            duration: 0.4,
            ease: 'power2.in',
            onComplete: () => {
                if (ring.parent) {
                    this.fxLayer.removeChild(ring);
                }
            }
        });
    }
    
    playCoinRain(particleSystem, width, topY, count, duration) {
        if (particleSystem) {
            particleSystem.spawnCoinRain(width, topY, count, duration);
        }
    }
}

// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
const app = new Application();
let mainContainer;
let bgLayer, boardContainer, fxLayer, uiLayer, overlayLayer;
let bgSprite;
let gridContainer, endCardContainer;
let progressBarFill, progressBarGlow, cashOutBtn, balanceText, tutorialHand;
let grid = []; 
let currentBalance = STARTING_BALANCE;
const TARGET_BALANCE = TARGET_BALANCE_CONFIG;
let isInputLocked = false;
let isGameOver = false;
let idleTimer = null;
let dropBlocksTimer = null;
let balanceUpdateSpeed = 1.0; // Multiplier for balance update speed during mega win

// Systems
let audioManager;
let particleSystem;
let megaWinFXManager;

// Цвета и текстуры
const COLORS = ['red', 'green', 'blue', 'yellow'];
let TEXTURE_MAP = {}; 

// === INIT ===
(async () => {
    await app.init({
        resizeTo: window,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        backgroundColor: 0x000000,
        antialias: true
    });
    document.body.appendChild(app.canvas);

    // Initialize AudioManager
    audioManager = new AudioManager();
    await audioManager.init();

    // 1. Ждем загрузку картинок
    await Assets.load(Object.values(ASSET_LIST));

    // 2. Шрифт загружается локально (встроен в HTML) - без внешних запросов для AppLovin
    // Font is loaded via CSS @font-face or system fallback
    
    TEXTURE_MAP = {
        'red': ASSET_LIST.blockRed, 
        'green': ASSET_LIST.blockGreen, 
        'blue': ASSET_LIST.blockBlue, 
        'yellow': ASSET_LIST.blockYellow
    };

    buildScene();

    window.addEventListener('resize', resize);
    resize();

    resetIdleTimer();
    
    // Start background music
    if (audioManager) {
        audioManager.playMusic('bgMusic', true, 0.5);
    }
})();

// === СБОРКА СЦЕНЫ ===
function buildScene() {
    // Background Layer
    bgLayer = new Container();
    bgSprite = Sprite.from(ASSET_LIST.bg);
    bgSprite.anchor.set(0.5);
    bgLayer.addChild(bgSprite);
    app.stage.addChild(bgLayer);

    // Main Container
    mainContainer = new Container();
    mainContainer.visible = true;
    app.stage.addChild(mainContainer);

    // Board Container (for screen shake)
    boardContainer = new Container();
    const gridY = -100;
    
    const boardBg = new Graphics();
    boardBg.roundRect(-300, -300, 600, 600, 40);
    boardBg.fill({ color: 0xffffff, alpha: 0.25 });
    boardBg.y = gridY;
    boardContainer.addChild(boardBg);

    gridContainer = new Container();
    gridContainer.y = gridY;
    boardContainer.addChild(gridContainer);
    
    mainContainer.addChild(boardContainer);

    // FX Layer (particles, bloom effects - additive blending)
    fxLayer = new Container();
    fxLayer.y = gridY;
    fxLayer.blendMode = 'add';
    mainContainer.addChild(fxLayer);
    
    // Initialize particle system
    particleSystem = new ParticleSystem(fxLayer, 100);
    app.ticker.add((ticker) => {
        particleSystem.update(ticker.deltaTime);
    });

    // UI Layer
    uiLayer = new Container();
    mainContainer.addChild(uiLayer);
    buildUI();

    // Overlay Layer (flashes, transitions)
    overlayLayer = new Container();
    overlayLayer.visible = true;
    overlayLayer.alpha = 1;
    overlayLayer.zIndex = 10000; // Ensure it's on top
    mainContainer.addChild(overlayLayer);

    // Initialize Mega Win FX Manager
    megaWinFXManager = new MegaWinFXManager(app, mainContainer, boardContainer, overlayLayer, fxLayer);

    // Tutorial Hand (in UI layer for proper z-ordering)
    tutorialHand = Sprite.from(ASSET_LIST.hand);
    tutorialHand.anchor.set(0.2, 0);
    tutorialHand.visible = false;
    tutorialHand.scale.set(0.6);
    tutorialHand.zIndex = 1000;
    uiLayer.addChild(tutorialHand);

    createGrid();

    // End Card
    buildEndCard();
}

function buildUI() {
    // Заголовок
    const titleStyle = new TextStyle({
        fontFamily: 'Titan One', fontSize: 80, fill: '#ffff00',
        stroke: { color: '#006400', width: 8 }, dropShadow: true, dropShadowDistance: 5, align: 'center'
    });
    const title = new Text({ text: 'Play games &\nearn cash', style: titleStyle });
    title.anchor.set(0.5);
    title.y = -550; 
    uiLayer.addChild(title);

    // Цели
    const targetsY = 250;
    const multipliers = ['x2', 'x3', 'x5'];
    const targets = [ASSET_LIST.targetRed, ASSET_LIST.targetBlue, ASSET_LIST.targetYellow];
    
    targets.forEach((tex, i) => {
        const t = Sprite.from(tex);
        t.anchor.set(0.5);
        t.x = (i - 1) * 180;
        t.y = targetsY;
        uiLayer.addChild(t);
        
        const mText = new Text({
            text: multipliers[i],
            style: new TextStyle({
                fontFamily: 'Titan One', fontSize: 40, fill: '#ffffff',
                stroke: { color: '#000000', width: 6 }
            })
        });
        mText.anchor.set(0.5);
        uiLayer.addChild(mText);
        mText.position.set(t.x, t.y);
    });

    // Баланс
    const balanceStyle = new TextStyle({
        fontFamily: 'Titan One', fontSize: 70, fill: '#ffffff',
        stroke: { color: '#b38f00', width: 6 }
    });
    balanceText = new Text({ text: formatMoney(currentBalance, 2), style: balanceStyle });
    balanceText.anchor.set(0.5);
    balanceText.y = targetsY + 150;
    uiLayer.addChild(balanceText);

    // Прогресс бар - красивый кастомный
    const barY = targetsY + 320;
    const barGroup = new Container();
    barGroup.y = barY;
    uiLayer.addChild(barGroup);

    // Размеры прогресс-бара
    const barWidth = 600;
    const barHeight = 50;
    const barPadding = 6; // Отступ для обводки

    // Фон прогресс-бара (темный)
    const barBg = new Graphics();
    barBg.roundRect(-barWidth/2, -barHeight/2, barWidth, barHeight, barHeight/2);
    barBg.fill({ color: 0x1a1a1a, alpha: 0.8 });
    // Обводка
    barBg.roundRect(-barWidth/2, -barHeight/2, barWidth, barHeight, barHeight/2);
    barBg.stroke({ color: 0x4a4a4a, width: 3 });
    barGroup.addChild(barBg);

    // Контейнер для заполнения
    const fillContainer = new Container();
    fillContainer.position.set(-barWidth/2 + barPadding, -barHeight/2 + barPadding);
    barGroup.addChild(fillContainer);

    // Glow behind progress bar
    progressBarGlow = new Graphics();
    progressBarGlow.alpha = 0;
    fillContainer.addChild(progressBarGlow);

    // Заполнение прогресс-бара (золотой градиент)
    progressBarFill = new Graphics();
    const maxW = barWidth - barPadding * 2;
    const fixedHeight = barHeight - barPadding * 2;
    progressBarFill.maxW = maxW;
    progressBarFill.fixedHeight = fixedHeight;
    
    // Создаем золотой градиент через несколько слоев
    updateProgressBar(0);
    fillContainer.addChild(progressBarFill);

    cashOutBtn = Sprite.from(ASSET_LIST.btnCashOutGray);
    cashOutBtn.anchor.set(0.5);
    cashOutBtn.y = barY + 240;
    uiLayer.addChild(cashOutBtn);
}

function createGrid() {
    const rows = 6;
    const cols = 6;
    const size = 82; 
    
    const startX = -(cols * size) / 2 + size / 2;
    const startY = -(rows * size) / 2 + size / 2;

    for (let r = 0; r < rows; r++) {
        grid[r] = [];
        for (let c = 0; c < cols; c++) {
            spawnBlock(r, c, startX, startY, size, true);
        }
    }
}

function spawnBlock(r, c, startX, startY, size, isInit) {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const b = Sprite.from(TEXTURE_MAP[color]);
    b.anchor.set(0.5);
    b.width = size - 6; 
    b.height = size - 6;
    
    b.x = startX + c * size;
    b.y = startY + r * size;
    
    b.logic = { r, c, color };
    b.eventMode = 'static';
    b.cursor = 'pointer';
    
    b.on('pointerdown', () => {
        onBlockClick(b.logic.r, b.logic.c);
    });

    gridContainer.addChild(b);
    grid[r][c] = b;

    if (isInit) {
        const targetScale = b.scale.x; 
        b.scale.set(0);
        gsap.to(b.scale, { x: targetScale, y: targetScale, duration: 0.3, delay: r*0.05 + c*0.05, ease: 'back.out' });
    } else {
        b.y = startY - 800;
        gsap.to(b, { y: startY + r * size, duration: 0.5, ease: 'bounce.out' });
    }
}

function onBlockClick(r, c) {
    if (isGameOver || isInputLocked) return;
    
    const block = grid[r][c];
    if (!block) return;

    // Unlock audio on first interaction
    if (audioManager && !audioManager.isUnlocked) {
        audioManager.context.resume();
        audioManager.isUnlocked = true;
        audioManager.playMusic('bgMusic', true, 0.5);
    }

    resetIdleTimer();

    // Ищем матчи, начиная с кликнутого блока
    const visited = new Set();
    getMatches(r, c, block.logic.color, visited);
    let matches = Array.from(visited);
    
    // Если матч не найден (меньше 2 блоков), проверяем соседние блоки того же цвета
    if (matches.length < 2) {
        const neighbors = [
            {r: r+1, c: c},
            {r: r-1, c: c},
            {r: r, c: c+1},
            {r: r, c: c-1}
        ];
        
        for (const neighbor of neighbors) {
            if (neighbor.r >= 0 && neighbor.r < 6 && neighbor.c >= 0 && neighbor.c < 6) {
                const neighborBlock = grid[neighbor.r][neighbor.c];
                if (neighborBlock && neighborBlock.logic.color === block.logic.color && !visited.has(neighborBlock)) {
                    getMatches(neighbor.r, neighbor.c, block.logic.color, visited);
                }
            }
        }
        
        matches = Array.from(visited);
    }

    if (matches.length >= 2) {
        isInputLocked = true;
        audioManager.playSFX('pop', true); // Pitch variation
        if (navigator.vibrate) navigator.vibrate(50);

        // === IMPACT PACK: Visual Feedback BEFORE cleanup ===
        const timeline = gsap.timeline();

        // Micro-Pop: Scale clicked block
        timeline.to(block.scale, { 
            x: 1.2, 
            y: 1.2, 
            duration: 0.1, 
            ease: 'power2.out' 
        }).to(block.scale, { 
            x: 0, 
            y: 0, 
            duration: 0.1, 
            ease: 'power2.in' 
        }, '-=0.05');

        // Screen Shake
        const shakeAmount = 5;
        const shakeX = (Math.random() - 0.5) * shakeAmount * 2;
        const shakeY = (Math.random() - 0.5) * shakeAmount * 2;
        timeline.to(boardContainer, {
            x: boardContainer.x + shakeX,
            y: boardContainer.y + shakeY,
            duration: 0.05,
            ease: 'power2.out'
        }, '-=0.15').to(boardContainer, {
            x: boardContainer.x,
            y: boardContainer.y,
            duration: 0.15,
            ease: 'power2.out'
        });

        // Flash overlay
        const flash = new Graphics();
        flash.rect(-2000, -2000, 4000, 4000).fill({ color: 0xFFFFFF, alpha: 0.3 });
        overlayLayer.addChild(flash);
        timeline.to(flash, {
            alpha: 0,
            duration: 0.1,
            ease: 'power2.out',
            onComplete: () => overlayLayer.removeChild(flash)
        }, '-=0.1');

        // Bloom Effect for matched blocks
        matches.forEach(matchedBlock => {
            const bloom = Sprite.from(TEXTURE_MAP[matchedBlock.logic.color]);
            bloom.anchor.set(0.5);
            bloom.width = matchedBlock.width;
            bloom.height = matchedBlock.height;
            bloom.position.set(matchedBlock.x, matchedBlock.y);
            bloom.blendMode = 'add';
            bloom.filters = [new BlurFilter({ strength: 4 })];
            bloom.alpha = 0.8;
            bloom.scale.set(1);
            fxLayer.addChild(bloom);
            
            timeline.to(bloom, {
                alpha: 0,
                scale: { x: 1.5, y: 1.5 },
                duration: 0.3,
                ease: 'expo.out',
                onComplete: () => fxLayer.removeChild(bloom)
            }, '-=0.25');
        });

        // Calculate money and spawn particles
        let amount = (Math.random() * 1.5) + 1.0;
        if (matches.length > 4) amount *= 1.5;
        amount *= MONEY_MULTIPLIER; // Удваиваем в версии 2x
        
        const left = TARGET_BALANCE - currentBalance;
        if (amount > left && left > 0) amount = left / 2;
        if (left < 2) amount = left;
        if (currentBalance + amount >= TARGET_BALANCE - 0.05) amount = left;

        // Spawn particles for each matched block
        matches.forEach(b => {
            particleSystem.spawn(b.x, b.y, b.logic.color, 10);
        });

        // Cleanup blocks after visual effects
        timeline.call(() => {
            matches.forEach(b => {
                grid[b.logic.r][b.logic.c] = null;
                gridContainer.removeChild(b);
            });
        }, null, '-=0.1');

        // Add money and show floating text
        timeline.call(() => {
            addMoney(amount);
            showFloatingText(`+${formatMoney(amount, 2)}`, block.x, block.y);
        }, null, '-=0.15');

        // Drop blocks after match sequence completes
        timeline.call(() => {
            if (dropBlocksTimer) clearTimeout(dropBlocksTimer);
            dropBlocksTimer = setTimeout(dropBlocks, 100);
        });

    } else {
        // Анимация ошибки
        gsap.to(block, { x: block.x + 5, duration: 0.05, yoyo: true, repeat: 4 });
    }
}

function getMatches(r, c, color, visited) {
    if (r<0 || r>=6 || c<0 || c>=6) return visited;
    const b = grid[r][c];
    
    const isSet = visited instanceof Set;
    const isVisited = isSet ? visited.has(b) : visited.includes(b);
    
    if (!b || isVisited || b.logic.color !== color) return visited;
    
    if (isSet) {
        visited.add(b);
    } else {
        visited.push(b);
    }
    
    getMatches(r+1, c, color, visited);
    getMatches(r-1, c, color, visited);
    getMatches(r, c+1, color, visited);
    getMatches(r, c-1, color, visited);
    return visited;
}

function dropBlocks() {
    const size = 82; 
    const startX = -(6 * size) / 2 + size / 2;
    const startY = -(6 * size) / 2 + size / 2;

    for (let c = 0; c < 6; c++) {
        let empty = 0;
        // Идем снизу вверх
        for (let r = 5; r >= 0; r--) {
            if (!grid[r][c]) {
                empty++;
            } else if (empty > 0) {
                const b = grid[r][c];
                const newR = r + empty;
                // Проверяем границы
                if (newR < 6) {
                    // Сдвигаем в массиве
                    grid[newR][c] = b;
                    grid[r][c] = null;
                    // Обновляем логические координаты
                    b.logic.r = newR;
                    
                    gsap.to(b, { y: startY + newR*size, duration: 0.4, ease: 'bounce.out' });
                }
            }
        }
        // Спавним новые блоки в пустых строках сверху
        for (let i = 0; i < empty; i++) {
             spawnBlock(i, c, startX, startY, size, false);
        }
    }
    
    // Увеличиваем задержку, чтобы учесть анимации падения блоков (0.4s) и появления новых (0.5s)
    if (dropBlocksTimer) clearTimeout(dropBlocksTimer);
    dropBlocksTimer = setTimeout(() => {
        if (!isGameOver) {
            checkDeadlock();
            isInputLocked = false;
            dropBlocksTimer = null;
        }
    }, 1000);
}

// === DEADLOCK & SHUFFLE ===
function checkDeadlock() {
    if (isGameOver) return;
    
    if (!hasPossibleMove()) {
        shuffleGrid();
    }
}

function hasPossibleMove() {
    for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 6; c++) {
            if (!grid[r][c]) continue;
            const color = grid[r][c].logic.color;
            if (c < 5 && grid[r][c+1] && grid[r][c+1].logic.color === color) return true;
            if (r < 5 && grid[r+1][c] && grid[r+1][c].logic.color === color) return true;
        }
    }
    return false;
}

function shuffleGrid() {
    let blocks = [];
    for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 6; c++) {
            if (grid[r][c]) blocks.push(grid[r][c]);
        }
    }
    
    let attempts = 0;
    let valid = false;
    
    while (!valid && attempts < 10) {
        attempts++;
        for (let i = blocks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tempColor = blocks[i].logic.color;
            blocks[i].logic.color = blocks[j].logic.color;
            blocks[j].logic.color = tempColor;
        }
        blocks.forEach(b => {
            b.texture = Texture.from(TEXTURE_MAP[b.logic.color]);
        });
        valid = hasPossibleMove();
    }
    
    showFloatingText("No Moves! Shuffling...", 0, -350);
    blocks.forEach(b => {
        gsap.from(b.scale, { x: 0, y: 0, duration: 0.4, ease: "back.out" });
    });
}

// === ЭФФЕКТЫ ===
function updateProgressBar(percentage) {
    if (!progressBarFill) return;
    
    const width = progressBarFill.maxW * Math.max(0, Math.min(1, percentage));
    const height = progressBarFill.fixedHeight;
    
    // Полностью очищаем Graphics перед перерисовкой
    progressBarFill.clear();
    
    if (width > 0 && height > 0) {
        const radius = height / 2;
        
        // Основной золотой фон
        progressBarFill.roundRect(0, 0, width, height, radius);
        progressBarFill.fill({ color: 0xFFB800, alpha: 1 });
        
        // Градиент от светлого к темному (имитация через несколько слоев)
        // Верхняя светлая часть
        progressBarFill.roundRect(0, 0, width, height * 0.45, radius);
        progressBarFill.fill({ color: 0xFFE55C, alpha: 0.8 });
        
        // Средняя часть
        progressBarFill.roundRect(0, height * 0.3, width, height * 0.4, radius);
        progressBarFill.fill({ color: 0xFFB800, alpha: 0.9 });
        
        // Нижняя темная часть для глубины
        progressBarFill.roundRect(0, height * 0.65, width, height * 0.35, radius);
        progressBarFill.fill({ color: 0xCC9000, alpha: 0.7 });
        
        // Блики в правой части
        if (width > 30) {
            const highlightWidth = Math.min(width * 0.25, 80);
            progressBarFill.roundRect(width - highlightWidth - 5, 2, highlightWidth, height * 0.35, radius);
            progressBarFill.fill({ color: 0xFFFFFF, alpha: 0.4 });
        }
        
        // Обводка золотого цвета
        progressBarFill.roundRect(0, 0, width, height, radius);
        progressBarFill.stroke({ color: 0xFFD700, width: 2.5 });
        
        // Внутренняя светлая обводка
        progressBarFill.roundRect(1, 1, width - 2, height - 2, radius);
        progressBarFill.stroke({ color: 0xFFF8DC, width: 1, alpha: 0.5 });
    }

    // Update glow
    if (progressBarGlow && width > 0) {
        progressBarGlow.clear();
        progressBarGlow.roundRect(-10, -10, width + 20, height + 20, height / 2 + 10);
        progressBarGlow.fill({ color: 0xFFD700, alpha: 0.3 });
    }
}

function addMoney(amount) {
    currentBalance += amount;
    if (currentBalance >= TARGET_BALANCE - 0.01) currentBalance = TARGET_BALANCE;
    
    balanceText.text = formatMoney(currentBalance, 2);
    audioManager.playSFX('coin');
    
    const pct = currentBalance / TARGET_BALANCE;
    
    // Анимируем прогресс-бар через промежуточные значения
    const startPct = (currentBalance - amount) / TARGET_BALANCE;
    
    const animObj = { value: startPct };
    gsap.to(animObj, {
        value: pct,
        duration: 0.5 / balanceUpdateSpeed, // Speed up during mega win
        ease: 'power2.out',
        onUpdate: function() {
            updateProgressBar(animObj.value);
        }
    });

    // Pulse glow effect
    if (progressBarGlow) {
        gsap.to(progressBarGlow, {
            alpha: 0.6,
            scale: { x: 1.1, y: 1.1 },
            duration: 0.2,
            ease: 'power2.out',
            yoyo: true,
            repeat: 1
        });
    }

    if (currentBalance >= TARGET_BALANCE && !isGameOver) {
        winGame();
    }
}

function showFloatingText(str, x, y) {
    const t = new Text({ text: str, style: { fontFamily: 'Titan One', fontSize: 45, fill: '#ffffff', stroke: { color: '#000000', width: 5 } }});
    t.anchor.set(0.5);
    t.position.set(x, y);
    gridContainer.addChild(t);
    gsap.to(t, { y: y - 100, alpha: 0, duration: 1.0, onComplete: () => gridContainer.removeChild(t) });
}

// === MEGA WIN VISUAL ELEMENTS ===
function createSunburst(radius = 400) {
    const sunburst = new Graphics();
    const rays = 16;
    const rayLength = radius * 1.2;
    
    // Draw rays
    for (let i = 0; i < rays; i++) {
        const angle = (Math.PI * 2 * i) / rays;
        const startRadius = radius * 0.3;
        const endRadius = rayLength;
        
        // Outer ray
        sunburst.moveTo(
            Math.cos(angle) * startRadius,
            Math.sin(angle) * startRadius
        );
        sunburst.lineTo(
            Math.cos(angle) * endRadius,
            Math.sin(angle) * endRadius
        );
        
        // Inner ray (alternating)
        if (i % 2 === 0) {
            const midAngle = angle + (Math.PI / rays);
            sunburst.lineTo(
                Math.cos(midAngle) * (radius * 0.6),
                Math.sin(midAngle) * (radius * 0.6)
            );
            sunburst.lineTo(
                Math.cos(angle) * startRadius,
                Math.sin(angle) * startRadius
            );
        }
    }
    
    // Fill with gradient-like effect (bright yellow to orange)
    sunburst.fill({ color: 0xFFD700, alpha: 0.8 });
    sunburst.stroke({ color: 0xFFFFFF, width: 2, alpha: 0.6 });
    
    // Graphics are drawn from (0,0), so we'll position it when adding to container
    sunburst.alpha = 0;
    sunburst.blendMode = 'add';
    
    return sunburst;
}

function createBigWinLabel(text = 'MEGA WIN') {
    const container = new Container();
    
    // Dynamic aura behind text (radial gradient effect using multiple circles)
    const aura = new Graphics();
    const auraRadius = 180;
    // Create radial gradient effect with multiple circles
    for (let i = 0; i < 5; i++) {
        const radius = auraRadius * (1 - i * 0.15);
        const alpha = 0.4 * (1 - i * 0.2);
        aura.circle(0, 0, radius).fill({ color: 0xFFD700, alpha });
    }
    aura.blendMode = 'add';
    container.addChildAt(aura, 0);
    
    // Main text with heavy stroke
    const mainText = new Text({
        text: text,
        style: new TextStyle({
            fontFamily: 'Titan One',
            fontSize: 120,
            fill: '#FFD700',
            stroke: { color: '#FFFFFF', width: 12 },
            dropShadow: true,
            dropShadowColor: '#FF6B00',
            dropShadowDistance: 8,
            dropShadowBlur: 10,
            dropShadowAngle: Math.PI / 4,
            align: 'center'
        })
    });
    mainText.anchor.set(0.5);
    container.addChild(mainText);
    
    // Glow effect behind text - use fixed size if text not measured yet
    const glow = new Graphics();
    const textWidth = mainText.width || 400; // Fallback if not measured
    const textHeight = mainText.height || 120;
    glow.roundRect(-textWidth / 2 - 20, -textHeight / 2 - 20, 
                   textWidth + 40, textHeight + 40, 15);
    glow.fill({ color: 0xFFD700, alpha: 0.3 });
    glow.blendMode = 'add';
    container.addChildAt(glow, 1);
    
    // Outer stroke layer for extra pop
    const strokeText = new Text({
        text: text,
        style: new TextStyle({
            fontFamily: 'Titan One',
            fontSize: 120,
            fill: 'transparent',
            stroke: { color: '#FF6B00', width: 16 },
            align: 'center'
        })
    });
    strokeText.anchor.set(0.5);
    strokeText.alpha = 0.6;
    container.addChildAt(strokeText, 2);
    
    // Add NoiseFilter to label (only on mainText for performance)
    const labelNoiseFilter = new NoiseFilter({ noise: 0 });
    mainText.filters = [labelNoiseFilter];
    
    // Animate noise filter (0.5-1.0s) - use timeline for chaining
    const noiseTimeline = gsap.timeline({ delay: 0.5 });
    noiseTimeline.to(labelNoiseFilter, {
        noise: 0.15,
        duration: 0.3,
        ease: 'power2.out'
    }).to(labelNoiseFilter, {
        noise: 0,
        duration: 0.5,
        ease: 'power2.in',
        delay: 0.2,
        onComplete: () => {
            mainText.filters = null;
        }
    });
    
    // Jitter will be handled in winGame() to avoid conflicts
    // Don't animate here - just set initial state
    container.scale.set(5); // Start huge
    container.alpha = 0;
    container.visible = true; // Ensure visible
    
    return container;
}

function winGame() {
    isGameOver = true;
    
    // Store original values
    const originalX = mainContainer.x;
    const originalY = mainContainer.y;
    const originalScale = mainContainer.scale.x; // Store original scale for zoom
    const centerX = 0;
    const centerY = -100;
    
    // Enhanced music ducking: 0.1 → 0.6 on 300ms → 0.5
    audioManager.setMusicVolume(0.1, 0.3);
    
    // Speed up balance count-up during mega win (1-2s)
    balanceUpdateSpeed = 3.0; // 3x faster
    gsap.delayedCall(2.0, () => {
        balanceUpdateSpeed = 1.0; // Return to normal
    });
    
    // === UI Updates (immediate) ===
    if (cashOutBtn) {
        cashOutBtn.texture = Texture.from(ASSET_LIST.btnCashOutActive);
        cashOutBtn.eventMode = 'static';
        cashOutBtn.cursor = 'pointer';
        gsap.to(cashOutBtn.scale, { x: 1.1, y: 1.1, yoyo: true, repeat: -1, duration: 0.6 });
        
        cashOutBtn.on('pointerdown', () => {
            // AppLovin MRAID: Open click-through URL via mraid.open()
            openClickThrough();
            audioManager.playMusic('bgMusic', true, 0.5);
            endCardContainer.visible = true;
            gsap.to(endCardContainer, { alpha: 1, duration: 0.5 });
        });
    }
    
    // === PREMIUM WIN TIMELINE ===
    const winTimeline = gsap.timeline({
        onStart: () => {
            }
    });
    
    // === PHASE 1: Dim & Pause (0-200ms) ===
    const dimOverlay = new Graphics();
    dimOverlay.rect(-2000, -2000, 4000, 4000).fill({ color: 0x000000, alpha: 0 });
    overlayLayer.addChild(dimOverlay);
    winTimeline.to(dimOverlay, {
        alpha: 0.7,
        duration: 0.2,
        ease: 'power2.out'
    });
    
    // === PHASE 2: The Rays (200-600ms) ===
    const sunburst = createSunburst(350);
    sunburst.position.set(centerX, centerY);
    overlayLayer.addChild(sunburst);
    
    // Rotate sunburst continuously
    const rotateTween = gsap.to(sunburst, {
        rotation: Math.PI * 2,
        duration: 3,
        repeat: -1,
        ease: 'none'
    });
    
    winTimeline.to(sunburst, {
        alpha: 0.9,
        duration: 0.4,
        ease: 'power2.out'
    }, 0.2);
    
    // === Camera Zoom In/Out Effect ===
    // Zoom in on impact
    winTimeline.to(mainContainer.scale, {
        x: originalScale * 1.1,
        y: originalScale * 1.1,
        duration: 0.3,
        ease: 'power2.out'
    }, 0.6)
    // Zoom out back
    .to(mainContainer.scale, {
        x: originalScale,
        y: originalScale,
        duration: 0.4,
        ease: 'power2.inOut'
    }, 0.9)
    // Subtle zoom in again for emphasis
    .to(mainContainer.scale, {
        x: originalScale * 1.05,
        y: originalScale * 1.05,
        duration: 0.3,
        ease: 'power2.out'
    }, 1.2)
    // Final zoom out to normal
    .to(mainContainer.scale, {
        x: originalScale,
        y: originalScale,
        duration: 0.5,
        ease: 'power2.inOut'
    }, 1.5);
    
    // === PHASE 3: The Impact (600-900ms) ===
    let bigWinLabel;
    try {
        bigWinLabel = createBigWinLabel('MEGA WIN');
        bigWinLabel.position.set(centerX, centerY - 50);
        overlayLayer.addChild(bigWinLabel);
        } catch (e) {
        console.error('createBigWinLabel error:', e);
        return; // Exit if label creation fails
    }
    
    // Fade in FIRST, then scale - this prevents flicker
    winTimeline.to(bigWinLabel, {
        alpha: 1,
        duration: 0.15, // Quick fade in
        ease: 'power2.out',
        onStart: () => {
            bigWinLabel.visible = true;
            },
        onComplete: () => {
            bigWinLabel.alpha = 1; // Lock alpha to 1
            }
    }, 0.6)
    // Then scale from huge to normal
    .to(bigWinLabel.scale, {
        x: 1,
        y: 1,
        duration: 0.5,
        ease: 'elastic.out(1, 0.5)',
        onStart: () => {
            // Ensure label stays visible during scale
            bigWinLabel.alpha = 1;
            bigWinLabel.visible = true;
            },
        onUpdate: () => {
            // Continuously lock alpha during scale animation
            bigWinLabel.alpha = 1;
        },
        onComplete: () => {
            // Lock alpha to 1 after scale completes
            bigWinLabel.alpha = 1;
            bigWinLabel.visible = true;
            }
    }, 0.6);
    
    // === PHASE 4: Impact PostFX (0.70-1.20s) ===
    // Enable impact filters at peak moment
    winTimeline.call(() => {
        if (megaWinFXManager) {
            megaWinFXManager.enableImpactFilters(1.5, centerX, centerY);
        }
    }, null, 0.70);
    
    // Animate filter intensity
    const filterIntensity = { value: 1.5 };
    winTimeline.to(filterIntensity, {
        value: 0,
        duration: 0.5,
        ease: 'power2.in',
        onUpdate: () => {
            if (megaWinFXManager) {
                megaWinFXManager.colorMatrixFilter.saturate(filterIntensity.value);
                megaWinFXManager.colorMatrixFilter.brightness(1 + filterIntensity.value * 0.2);
                megaWinFXManager.colorMatrixFilter.contrast(1 + filterIntensity.value * 0.3);
                megaWinFXManager.blurFilter.strength = filterIntensity.value * 3;
                megaWinFXManager.noiseFilter.noise = filterIntensity.value * 0.12;
                megaWinFXManager.displacementFilter.scale.set(filterIntensity.value * 15);
            }
        },
        onComplete: () => {
            if (megaWinFXManager) {
                megaWinFXManager.disableImpactFilters();
            }
        }
    }, 0.70);
    
    // === PHASE 4: The Flash (at impact moment ~750ms) ===
    const flashOverlay = new Graphics();
    flashOverlay.rect(-2000, -2000, 4000, 4000).fill({ color: 0xFFFFFF, alpha: 0 });
    overlayLayer.addChild(flashOverlay);
    
    // Advanced blend mode flash (short burst 100-250ms)
    // Using 'screen' blend mode for premium flash effect (similar to linear-dodge)
    const advancedFlash = new Graphics();
    advancedFlash.rect(-2000, -2000, 4000, 4000).fill({ color: 0xFFFFFF, alpha: 0 });
    advancedFlash.blendMode = 'screen'; // Premium flash effect
    overlayLayer.addChild(advancedFlash);
    
    winTimeline.to(flashOverlay, {
        alpha: 0.6,
        duration: 0.05,
        ease: 'power2.out'
    }, 0.75)
    .to(flashOverlay, {
        alpha: 0,
        duration: 0.15,
        ease: 'power2.in',
        onComplete: () => overlayLayer.removeChild(flashOverlay)
    }, 0.8)
    .to(advancedFlash, {
        alpha: 0.4,
        duration: 0.1,
        ease: 'power2.out'
    }, 0.75)
    .to(advancedFlash, {
        alpha: 0,
        duration: 0.15,
        ease: 'power2.in',
        onComplete: () => overlayLayer.removeChild(advancedFlash)
    }, 0.85);
    
    // Shock ring at impact
    winTimeline.call(() => {
        if (megaWinFXManager) {
            megaWinFXManager.playShockRing(centerX, centerY);
        }
    }, null, 0.75);
    
    // === Camera Shake (at impact moment) ===
    const shakeAmount = 12;
    const shakeDuration = 0.3;
    const shakeCount = 6;
    
    for (let i = 0; i < shakeCount; i++) {
        winTimeline.to(mainContainer, {
            x: originalX + (Math.random() - 0.5) * shakeAmount * 2,
            y: originalY + (Math.random() - 0.5) * shakeAmount * 2,
            duration: shakeDuration / shakeCount,
            ease: 'power2.out'
        }, 0.75 + (i * shakeDuration / shakeCount));
    }
    
    winTimeline.to(mainContainer, {
        x: originalX,
        y: originalY,
        duration: 0.2,
        ease: 'power2.out'
    }, 0.75 + shakeDuration);
    
    // === PHASE 5: The Fountain (800-1200ms) ===
    winTimeline.call(() => {
        // Play win sound exactly at impact
        audioManager.playSFX('win');
        
        // Spawn fountain from center/bottom
        particleSystem.spawnFountain(centerX, centerY + 200, 80);
        
        // Additional bursts for extra juice
        gsap.delayedCall(0.2, () => {
            particleSystem.spawnFountain(centerX - 150, centerY + 150, 40);
        });
        gsap.delayedCall(0.25, () => {
            particleSystem.spawnFountain(centerX + 150, centerY + 150, 40);
        });
    }, null, 0.8);
    
    // === Coin Rain (0.8-2.5s) ===
    winTimeline.call(() => {
        if (megaWinFXManager && particleSystem) {
            const screenWidth = 1200; // Approximate screen width in design space
            const topY = -600; // Top of screen
            megaWinFXManager.playCoinRain(particleSystem, screenWidth, topY, 60, 2.0);
        }
    }, null, 0.8);
    
    // === Settle Phase (1200-4000ms) - Extended display time ===
    winTimeline.to(sunburst, {
        alpha: 0.4,
        duration: 0.5,
        ease: 'power2.in'
    }, 1.2)
    // DON'T animate bigWinLabel alpha here - it causes flicker
    // Just ensure it stays at 1.0 and animate scale only
    .to(bigWinLabel.scale, {
        x: 1.0,
        y: 1.0,
        duration: 0.3,
        ease: 'power2.inOut',
        onStart: () => {
            // Force visibility during settle phase - NO alpha animation
            if (bigWinLabel) {
                bigWinLabel.alpha = 1.0; // Lock to 1.0
                bigWinLabel.visible = true;
            }
        }
    }, 1.2)
    // Keep label visible and pulsing - scale only, no alpha
    .to(bigWinLabel.scale, {
        x: 1.05,
        y: 1.05,
        duration: 0.8,
        ease: 'power2.inOut',
        yoyo: true,
        repeat: 3,
        onStart: () => {
            // Ensure label stays visible during pulse - NO alpha changes
            if (bigWinLabel) {
                bigWinLabel.alpha = 1.0; // Lock to 1.0
                bigWinLabel.visible = true;
            }
        },
        onUpdate: () => {
            // Continuously lock alpha during pulse
            if (bigWinLabel) {
                bigWinLabel.alpha = 1.0;
            }
        }
    }, 1.5)
    .to(dimOverlay, {
        alpha: 0.3,
        duration: 0.5,
        ease: 'power2.in'
    }, 1.2);
    
    // === Cleanup (4000ms+) - Extended to 4 seconds ===
    winTimeline.call(() => {
        // Stop sunburst rotation
        rotateTween.kill();
        
        // Fade out elements
        gsap.to(sunburst, {
            alpha: 0,
            duration: 0.5,
            ease: 'power2.in',
            onComplete: () => overlayLayer.removeChild(sunburst)
        });
        
        if (bigWinLabel && bigWinLabel.parent) {
            gsap.to(bigWinLabel, {
                alpha: 0,
                scale: { x: 1.1, y: 1.1 },
                duration: 0.5,
                ease: 'power2.in',
                onComplete: () => {
                    if (bigWinLabel.parent) {
                        overlayLayer.removeChild(bigWinLabel);
                    }
                }
            });
        }
        
        gsap.to(dimOverlay, {
            alpha: 0,
            duration: 0.5,
            ease: 'power2.in',
            onComplete: () => overlayLayer.removeChild(dimOverlay)
        });
    }, null, 4.0);
    
    // Enhanced music ducking: return swell (0.1 → 0.6 on 300ms → 0.5)
    winTimeline.call(() => {
        // At peak moment (0.75s), start return swell
        audioManager.setMusicVolume(0.6, 0.3);
    }, null, 0.75);
    
    // Then settle to normal
    winTimeline.call(() => {
        audioManager.setMusicVolume(0.5, 0.2);
    }, null, 1.05);
    
    // UI Updates already done at the start of winGame()
}

function buildEndCard() {
    endCardContainer = new Container();
    endCardContainer.visible = false;
    endCardContainer.alpha = 0;
    mainContainer.addChild(endCardContainer);

    const overlay = new Graphics().rect(-2000, -2000, 4000, 4000).fill({ color: 0x000000, alpha: 0.85 });
    endCardContainer.addChild(overlay);

    const icon = Sprite.from(ASSET_LIST.icon);
    icon.anchor.set(0.5);
    icon.scale.set(1.5);
    icon.y = -200;
    // Add rounded corners mask
    const iconSize = Math.min(icon.width, icon.height) * 0.5;
    const iconMask = new Graphics();
    iconMask.roundRect(-iconSize, -iconSize, iconSize * 2, iconSize * 2, iconSize * 0.25);
    iconMask.fill({ color: 0xFFFFFF, alpha: 1 });
    // Position mask to match icon (icon has anchor 0.5, so center at icon position)
    iconMask.position.set(icon.x, icon.y);
    icon.mask = iconMask;
    endCardContainer.addChild(iconMask);
    endCardContainer.addChild(icon);

    const btn = Sprite.from(ASSET_LIST.btnPlay);
    btn.anchor.set(0.5);
    btn.y = 150;
    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointerdown', () => {
        // AppLovin MRAID: Open click-through URL via mraid.open()
        openClickThrough();
    });
    
    gsap.to(btn.scale, { x: 1.1, y: 1.1, yoyo: true, repeat: -1, duration: 0.5 });
    endCardContainer.addChild(btn);
}

function resetIdleTimer() {
    if (isGameOver) return;
    if (idleTimer) clearTimeout(idleTimer);
    if (!tutorialHand) return;
    tutorialHand.visible = false;
    gsap.killTweensOf(tutorialHand);

    idleTimer = setTimeout(() => {
        // Check if game is over before showing hand
        if (isGameOver) return;
        
        let target = null;
        for (let r=0; r<6; r++) {
            for (let c=0; c<6; c++) {
                if (grid[r][c]) {
                    const visited = new Set();
                    getMatches(r, c, grid[r][c].logic.color, visited);
                    if (visited.size >= 2) {
                        target = grid[r][c];
                        break;
                    }
                }
            }
            if(target) break;
        }
        if (target && !isGameOver) {
            tutorialHand.visible = true;
            tutorialHand.alpha = 1;
            
            // Enhanced tutorial animation sequence
            const sequence = () => {
                // Check again before animating
                if (isGameOver) {
                    tutorialHand.visible = false;
                    return;
                }
                
                // Move to target
                gsap.to(tutorialHand, {
                    x: target.x + 50,
                    y: target.y + 60,
                    duration: 0.8,
                    ease: 'power2.inOut'
                });
                
                // Tap animation: use timeline, Tween does not support chained .to()
                const tapTl = gsap.timeline({ delay: 0.8 });
                tapTl
                    .to(tutorialHand.scale, {
                        x: 0.7,
                        y: 0.7,
                        duration: 0.15,
                        ease: 'power2.out'
                    })
                    .to(tutorialHand.scale, {
                        x: 0.6,
                        y: 0.6,
                        duration: 0.15,
                        ease: 'power2.in'
                    });
                
                // Fade out
                gsap.to(tutorialHand, {
                    alpha: 0,
                    duration: 0.3,
                    delay: 1.1,
                    ease: 'power2.out',
                    onComplete: () => {
                        if (tutorialHand.visible && !isGameOver) {
                            tutorialHand.alpha = 1;
                            sequence(); // Repeat
                        } else {
                            tutorialHand.visible = false;
                        }
                    }
                });
            };
            
            sequence();
        }
    }, 3000);
}

function resize() {
    if (!bgSprite || !mainContainer) return;

    const w = window.innerWidth;
    const h = window.innerHeight;

    bgSprite.x = w / 2;
    bgSprite.y = h / 2;
    const bgScale = Math.max(w / bgSprite.texture.width, h / bgSprite.texture.height);
    bgSprite.scale.set(bgScale);

    const scale = Math.min(w / DESIGN_W, h / DESIGN_H);
    mainContainer.x = w / 2;
    mainContainer.y = h / 2;
    mainContainer.scale.set(scale);
    
}

