export const GameConfig = {
  // Canvas settings
  width: 1080, // Portrait base width
  height: 1920, // Portrait base height
  backgroundColor: 0x87ceeb, // Sky blue fallback

  // Game Economy
  startingBalance: 1000,
  defaultBet: 10,
  minBet: 10,
  maxBet: 500,

  // Difficulty Modes
  modes: {
    low: {
      name: "Low",
      trainChance: 0.05, // 10% chance of train
      speed: 1.0,
      multiplierIncrement: 1.25,
      maxMultiplier: 5.0,
    },
    medium: {
      name: "Medium",
      trainChance: 0.1,
      speed: 1.0,
      multiplierIncrement: 2.25,
      maxMultiplier: 10.0,
    },
    high: {
      name: "High",
      trainChance: 0.15,
      speed: 1.0,
      multiplierIncrement: 2.7,
      maxMultiplier: 25.0,
    },
    extreme: {
      name: "Extreme",
      trainChance: 0.2,
      speed: 1.0,
      multiplierIncrement: 4.13,
      maxMultiplier: 100.0,
    },
  },

  // Bonus Run
  bonusRunUnlockStep: 2,
  bonusRunDurationSteps: 3,
  bonusRunMultiplierBoost: 2.0, // Multiplier grows faster during bonus

  // Assets Scale Configuration
  assets: {
    chickenScale: 0.5,
    trainScale: 0.3,
    trainWidth: 520,
    trainHeight: 220,
    trainTint: 0x4d4d4d,
    trainAnimSpeed: 0.2,
    winAnimSpeed: 0.2,
    jumpAnimSpeed: 1.0,
    uiScale: 1.0,
    goldPlateScale: 0.3,
    goldPlateCenterScale: 1.0,
    goldPlateCenterOffsetY: 120,
    goldPlateSideOffsetX: 18,
    goldPlateSideOffsetY: 61,
    goldPlateSideVerticalScale: 1.1,
    railwaySignScale: 0.9,
    railwaySignOffsetX: 10,
    railwaySignOffsetY: 280,
    barrierBasisScale: 0.8,
    barrierBasisOffsetX: 130,
    barrierBasisOffsetY: 0,
    barrierScale: 0.8,
    barrierOffsetX: 1,
    barrierOffsetY: -110,
    barrierBaseRotation: Math.PI / 2,
    barrierRotateDelta: Math.PI / 2,
    panelScale: 1.0,
    panelOffsetX: 0,
    panelOffsetY: 240,
    panelFontSizeRatio: 0.22,
    panelTextHeightRatio: 0.7,
    panelTextOffsetY: 7,
    landingEggScale: 0.5,
    landingEggOffsetX: 15,
    landingEggOffsetY: -10,
    landingEggLightScale: 1.3,
    landingEggLightOffsetY: -130,
    landingEggTextSizeRatio: 0.25,
    landingEggTextHeightRatio: 0.58,
    landingEggTextOffsetY: 25
  },

  // Layout
  verticalCenter: 0.6, // Position of the main game line (0-1)
  camera: {
    zoom: 0.65,
    zoomPortrait: 0.70,
    zoomLandscape: 0.8,
  },

  // Audio Settings
  volume: 0.5,
  audio: {
    bgmLoopStart: 0.05,
    bgmLoopEndTrim: 0.05,
  },

  // Train visuals (purely cosmetic)
  trains: {
    spawnInterval: 4500, // ms between trains
    speed: 720, // px/sec downward
    startOffset: 0.85, // screen heights above rail center
    endOffset: 0.9, // screen heights below rail center
    jumpSpeedMultiplier: 2.5, // speed boost while jumping
    crashSpeedMultiplier: 2.0, // speed boost for death train
    crashStartOffset: 0.35, // start closer so death train appears sooner
    barrierSpawnChanceMultiplier: 1.5, // boost chance after barrier closes
  },

  animations: {
    deathSpeedMultiplier: 8,
    deathResetDelayMs: 1000,
    jumpHeight: 120,
    jumpDuration: 0.4,
    panelRevealDuration: 0.35,
    panelRevealRotation: -0.6,
    landingEggPopDuration: 0.22,
    landingEggLightSpinSpeed: Math.PI * 0.6,
    landingEggFloatAmplitude: 12,
    landingEggFloatSpeed: Math.PI * 1.2,
  },

  winCoins: {
    count: 20,
    spawnInterval: 0.06,
    fallDurationMin: 0.9,
    fallDurationMax: 1.4,
    startYOffsetRatio: 0.15,
    endYOffsetRatio: 0.1,
    xSpreadRatio: 0.85,
    minScale: 0.45,
    maxScale: 0.75,
    fadeStartRatio: 0.75,
    scrollStartOffsetRatio: 0.45,
  },
  winOverlay: {
    ctaText: "PLAY NOW!",
    ctaUrl: "",
    scrollOffsetYRatio: 0.52,
    ctaButtonWidthRatio: 0.76,
    ctaButtonOffsetYRatio: 0.72,
    ctaTextSizeRatio: 0.32,
    ctaTextOffsetYRatio: -0.02,
  },
};
