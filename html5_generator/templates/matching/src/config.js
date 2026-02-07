const MUSIC_URL = new URL('../assets/music.mp3', import.meta.url).href;
const USER_CONFIG = (globalThis.__USER_CONFIG__ && typeof globalThis.__USER_CONFIG__ === "object")
  ? globalThis.__USER_CONFIG__
  : {};

const currency = typeof USER_CONFIG.currency === "string" && USER_CONFIG.currency.trim()
  ? USER_CONFIG.currency
  : "$";

const initialBalance = typeof USER_CONFIG.startingBalance === "number" && Number.isFinite(USER_CONFIG.startingBalance)
  ? Math.max(0, USER_CONFIG.startingBalance)
  : 0;

const targetBalance = typeof USER_CONFIG.targetBalance === "number" && Number.isFinite(USER_CONFIG.targetBalance)
  ? Math.max(1, USER_CONFIG.targetBalance)
  : 20;

const clickUrl = typeof USER_CONFIG.clickUrl === "string" && USER_CONFIG.clickUrl.trim()
  ? USER_CONFIG.clickUrl
  : "https://play.google.com/store/apps/details?id=io.playcharge.playrush&hl=en";

const GAMEPLAY_MODES = {
  normal: {
    rewards: [5, 5, 5, 5, 5],
    queue: [5, 10, 20, 50, 5]
  },
  fast: {
    rewards: [7, 7, 6],
    queue: [5, 20, 50]
  }
};

const modeKey = import.meta.env.VITE_PLAYABLE_MODE || 'normal';
const modeConfig = GAMEPLAY_MODES[modeKey] || GAMEPLAY_MODES.normal;

export const CONFIG = {
  design: {
    width: 1080,
    height: 1920
  },
  colors: {
    background: 0x0b4c8a,
    text: 0xffffff,
    accent: 0xffc857,
    good: 0x3de06f,
    bad: 0xff4a4a
  },
  ui: {
    fontFamily: 'Lilita One'
  },
  game: {
    currency,
    targetBalance,
    initialBalance,
    rewards: modeConfig.rewards
  },
  interaction: {
    idleTimeout: 3000,
    dragReturnDuration: 0.35,
    snapDuration: 0.25
  },
  layout: {
    titleY: -820,
    balanceY: -690,
    progressY: -610,
    slotsY: -170,
    stackY: 520,
    stackX: 0
  },
  slots: [
    { id: 'slot5', value: 5, x: -458, y: -162, width: 290, height: 540, snapOffsetY: 0, highlightWidth: 230, highlightHeight: 440, highlightOffsetY: 40 },
    { id: 'slot10', value: 10, x: -170, y: -162, width: 290, height: 540, snapOffsetY: 0, highlightWidth: 230, highlightHeight: 440, highlightOffsetY: 40 },
    { id: 'slot20', value: 20, x: 170, y: -162, width: 290, height: 540, snapOffsetY: 0, highlightWidth: 230, highlightHeight: 440, highlightOffsetY: 40 },
    { id: 'slot50', value: 50, x: 458, y: -162, width: 290, height: 540, snapOffsetY: 0, highlightWidth: 230, highlightHeight: 440, highlightOffsetY: 40 }
  ],
  bills: {
    types: {
      5: { id: 'bill5', texture: 'bill5', zoneId: 'slot5', scale: 0.72 },
      10: { id: 'bill10', texture: 'bill10', zoneId: 'slot10', scale: 0.72 },
      20: { id: 'bill20', texture: 'bill20', zoneId: 'slot20', scale: 0.72 },
      50: { id: 'bill50', texture: 'bill50', zoneId: 'slot50', scale: 0.72 }
    },
    queue: modeConfig.queue
  },
  slotHitPadding: 8,
  slotHighlightInset: 22,
  audio: {
    volume: 0.18,
    sfx: {
      pick: { freq: 640, duration: 0.06, type: 'sine' },
      drop: { freq: 540, duration: 0.08, type: 'sine' },
      wrong: { freq: 220, duration: 0.12, type: 'square' },
      win: { freq: 880, duration: 0.18, type: 'triangle' }
    },
    music: {
      url: MUSIC_URL,
      volume: 0.25
    }
  },
  mraid: {
    clickUrl,
    fallbackUrl: clickUrl
  }
};
