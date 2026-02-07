(() => {
  const USER_CONFIG = (window.__USER_CONFIG__ && typeof window.__USER_CONFIG__ === 'object')
    ? window.__USER_CONFIG__
    : {};
  const CURRENCY = typeof USER_CONFIG.currency === 'string' && USER_CONFIG.currency.trim()
    ? USER_CONFIG.currency
    : '$';
  const STARTING_BALANCE = typeof USER_CONFIG.startingBalance === 'number' && Number.isFinite(USER_CONFIG.startingBalance)
    ? Math.max(0, USER_CONFIG.startingBalance)
    : 1000;
  if (typeof USER_CONFIG.clickUrl === 'string' && USER_CONFIG.clickUrl.trim()) {
    window.STORE_URL = USER_CONFIG.clickUrl;
  }

  const DESIGN_WIDTH = 1080;
  const DESIGN_HEIGHT = 1920;

  // Toggle layout editor (drag + resize + copy JSON)
  // Enable by setting: window.LAYOUT_DEBUG = true (e.g. in DevTools console) then reload.
  const LAYOUT_DEBUG = window.LAYOUT_DEBUG === true;
  const ROWS = 6;
  const COLS = 5;
  const SYMBOL_SIZE = 130;
  const GAP = 6;
  const STEP = SYMBOL_SIZE + GAP;
  const IDLE_DELAY = 2000;
  const MORPH_WIN_TO_S01M = true; // Enable symbol transformation

  // ---- TUNING (quick knobs) ----
  const TUNING = {
    // audio
    musicVolume: 0.32,
    duckWin: { db: -8, attackMs: 60, holdMs: 650, releaseMs: 260 },
    duckMega: { db: -10, attackMs: 40, holdMs: 900, releaseMs: 420 },

    // timing
    spinDurationMs: 3600,
    stopDurationMs: 180, // eased-stop 150–200ms with light bounce
    nearMissSlowMs: 200,

    // impact
    stopFlashMs: 120, // punchier
    shakeMs: 220,
    shakeAmpPx: 5,
    megaShakeMs: 520,
    megaShakeAmpPx: 14,
    megaFlashMs: 130,
    megaToneMs: 820,

    // win highlight
    winPopScale: 1.12,
    winPopMs: 680,
    glowBlur: 26,
    glowAlpha: 1,

    // overlays
    blurDuringSpin: 0.32,
    overlayPeakAlpha: 0.78,

    // mega
    megaZoomScale: 1.095,
    megaZoomInMs: 320,
    megaZoomOutMs: 720,
    shockwaveMs: 920,
    confettiCount: 140,
    chromaMs: 920,
    // audio
    spinLoopVolume: 0.28,
    jackpotVolume: 0.9,
    // Combo effects
    megaSequenceMs: 920,
    symbolMorphMs: 680,
    lightningDurationMs: 520,
    // Canvas effects
    motionBlurPx: 4,
    glitchMs: 320,
    rippleMs: 480,
    grainIntensity: 0.12,
    // Audio
    reverbRoomSize: 0.8,
    lowpassCutoff: 800,
    pitchVariation: 0.05
  };

  const canvas = document.getElementById('reels');
  const ctx = canvas.getContext('2d');
  const spinBtn = document.getElementById('spinBtn');
  const bonusBtn = document.getElementById('bonusBtn');
  const keepPlayingBtn = document.getElementById('keepPlayingBtn');
  const installBtn = document.getElementById('installBtn');
  const megaOverlay = document.getElementById('megaOverlay');
  const bonusPopup = document.getElementById('bonusPopup');
  const endcard = document.getElementById('endcard');
  const balanceEl = document.getElementById('balance');
  const winEl = document.getElementById('win');
  const megaValueEl = document.getElementById('megaWinValue');
  const megaBurstTL = document.getElementById('megaBurstTL');
  const megaBurstTR = document.getElementById('megaBurstTR');
  const megaBurstBL = document.getElementById('megaBurstBL');
  const megaBurstBR = document.getElementById('megaBurstBR');
  const zeusIdle = document.getElementById('zeusIdle');
  const zeusCast = document.getElementById('zeusCast');
  const zeusFx = document.getElementById('zeusFx');
  const overlayFx = document.getElementById('overlayFx');
  const bgImg = document.getElementById('bg');
  const cloud5Img = document.getElementById('cloud5');
  const cloud6Img = document.getElementById('cloud6');
  const logoImg = document.getElementById('logo');
  const flashFx = document.getElementById('flashFx');
  const sparkFx = document.getElementById('sparkFx');
  const clickSpark = document.getElementById('clickSpark');
  const handCue = document.getElementById('handCue');
  const titleEl = document.getElementById('title');
  const hudEl = document.getElementById('hud');
  const winLines = document.getElementById('winLines');
  const winLinePath = document.getElementById('winLinePath');
  const muteBtn = document.getElementById('muteBtn');
  const vignetteEl = document.getElementById('vignette');
  const gameEl = document.getElementById('game');
  const copyLayoutBtn = document.getElementById('copyLayoutBtn');

  let isViewable = true;
  let lightningTimer = null;
  let audio = null;
  let spinLoopHandle = null;
  let particlesInstance = null; // particles.js instance

  canvas.width = 800;
  canvas.height = 860;

  const state = {
    assets: {},
    grid: [],
    spinIndex: 0,
    balance: STARTING_BALANCE,
    lastWin: 0,
    spinning: false,
    spinStart: 0,
    pendingOutcome: null,
    spinDuration: TUNING.spinDurationMs,
    stopDelays: [0, 120, 240, 360, 480],
    // legacy reel fields kept but unused (we now do deterministic fake-spin + swap)
    bands: [],
    bandShift: [0, 0, 0, 0, 0],
    bandOffset: [0, 0, 0, 0, 0],
    bandStopAt: [0, 0, 0, 0, 0],
    bandStopRequested: [false, false, false, false, false],
    stopInsertIdx: [ROWS - 1, ROWS - 1, ROWS - 1, ROWS - 1, ROWS - 1],
    stopInProgress: [false, false, false, false, false],
    stopStepsLeft: [0, 0, 0, 0, 0],
    columnSettled: [false, false, false, false, false],
    targetGrid: null,
    winCells: null,
    winAnimStart: 0,
    winRevealStart: 0,
    winBaseSymbol: 'S07',
    prevBalance: STARTING_BALANCE,
    prevWin: 0,

    // fake spin stop-phase (eased stop + bounce)
    stopPhase: false,
    stopStart: 0,
    stopDuration: TUNING.stopDurationMs,
    stopFromOffset: 0,
    stopTick: 0,

    // fx state
    fx: {
      flashT: 0,
      impactT: 0,
      winT: 0,
      outcome: 'none', // 'red' | 'green' | 'lose' | 'mega'
      shakeT: 0,
      shakeAmp: 0,
      shakeRot: 0,
      shockwaveT: 0,
      toneT: 0,
      chromaT: 0,
      zoom: 1,
      zoomFrom: 1,
      zoomTo: 1,
      zoomStart: 0,
      zoomDur: 0,
      particles: [],
      // Combo effects
      megaSequence: null, // { start: timestamp, phase: 'flash' | 'chroma' | 'zoom' | 'particles' | 'shake' }
      symbolMorph: [], // Array of { c, r, start, progress }
      zeusLightning: null, // { start: timestamp, bolts: [{ path: [...], opacity: number }] }
      // Canvas effects
      glitchT: 0,
      rippleT: 0,
      rippleCenter: { x: 0, y: 0 },
      grainT: 0
    }
  };
  const numberAnimations = { balance: null, win: null };
  let idleTimer = null;

  // win patterns: 0 diagonal, 1 diagonal (second win), 2 zigzag
  const WIN_PATTERNS = [
    [{ c: 0, r: 0 }, { c: 1, r: 1 }, { c: 2, r: 2 }, { c: 3, r: 3 }, { c: 4, r: 4 }],
    [{ c: 0, r: 0 }, { c: 1, r: 1 }, { c: 2, r: 2 }, { c: 3, r: 3 }, { c: 4, r: 4 }],
    [{ c: 0, r: 0 }, { c: 1, r: 1 }, { c: 2, r: 0 }, { c: 3, r: 1 }, { c: 4, r: 0 }],
  ];

  function applyPatternToGrid(grid, pattern) {
    const g = cloneGrid(grid);
    for (const p of pattern) g[p.c][p.r] = 'S01M';
    return g;
  }

  function applyPatternWithSymbol(grid, pattern, symbol) {
    const g = cloneGrid(grid);
    for (const p of pattern) g[p.c][p.r] = symbol;
    return g;
  }

  function isWinCell(col, row) {
    if (!state.winCells) return false;
    return state.winCells.some((p) => p.c === col && p.r === row);
  }

  function setWinPattern(patternIndex) {
    if (patternIndex === null || patternIndex === undefined) {
      state.winCells = null;
      return;
    }
    state.winCells = WIN_PATTERNS[patternIndex];
    state.winAnimStart = performance.now();
    updateWinLinePath(state.winCells);
  }

  function updateWinLinePath(pattern) {
    if (!winLinePath || !pattern || pattern.length === 0) return;
    const totalWidth = COLS * SYMBOL_SIZE + (COLS - 1) * GAP;
    const totalHeight = ROWS * SYMBOL_SIZE + (ROWS - 1) * GAP;
    const startX = (canvas.width - totalWidth) / 2;
    const startY = (canvas.height - totalHeight) / 2;
    const pts = pattern.map((p) => ({
      x: startX + p.c * STEP + SYMBOL_SIZE / 2,
      y: startY + p.r * STEP + SYMBOL_SIZE / 2
    }));
    const d = pts.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');
    winLinePath.setAttribute('d', d);
  }

  function flyZeusToCorner(spinIdx) {
    if (!zeusIdle) return;
    const reel = layout?.reels || DEFAULT_LAYOUT.reels;
    const corners = [
      { x: reel.x - 20, y: reel.y - 40 },
      { x: reel.x + reel.w - 220, y: reel.y - 40 },
      { x: reel.x - 20, y: reel.y + reel.h - 360 },
      { x: reel.x + reel.w - 220, y: reel.y + reel.h - 360 }
    ];
    const c = corners[spinIdx % corners.length];
    zeusIdle.style.transition = 'left 720ms cubic-bezier(.22,.9,.22,1), top 720ms cubic-bezier(.22,.9,.22,1)';
    zeusIdle.style.left = `${c.x}px`;
    zeusIdle.style.top = `${c.y}px`;
  }

  // ---------------- FX helpers ----------------
  function clamp01(x) {
    return Math.max(0, Math.min(1, x));
  }

  function easeOutCubic(x) {
    return 1 - Math.pow(1 - x, 3);
  }

  function easeOutQuad(x) {
    return 1 - (1 - x) * (1 - x);
  }

  function formatMoney(value) {
    return `${CURRENCY}${Math.round(value)}`;
  }

  function startZoom(to, durMs) {
    state.fx.zoomFrom = state.fx.zoom || 1;
    state.fx.zoomTo = to;
    state.fx.zoomStart = performance.now();
    state.fx.zoomDur = Math.max(1, durMs);
  }

  function spawnSparks(count, bounds) {
    const now = performance.now();
    const n = Math.max(1, count | 0);
    for (let i = 0; i < n; i += 1) {
      const x = bounds.x + ((i * 97 + now) % bounds.w);
      const y = bounds.y + ((i * 131 + now * 0.7) % bounds.h);
      const a = (i * 0.83 + now * 0.001) % (Math.PI * 2);
      const sp = 260 + (i % 5) * 40;
      state.fx.particles.push({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 120,
        life: 420,
        born: now
      });
    }
  }

  function spawnConfetti(count, bounds) {
    const now = performance.now();
    const n = Math.max(1, count | 0);
    for (let i = 0; i < n; i += 1) {
      const x = bounds.x + ((i * 61 + now * 0.5) % bounds.w);
      const y = bounds.y - 20 - (i % 8) * 8;
      const vx = -120 + ((i * 37) % 240);
      const vy = 80 + ((i * 19) % 200);
      state.fx.particles.push({
        kind: 'coin',
        x,
        y,
        vx,
        vy,
        rot: (i * 0.7) % (Math.PI * 2),
        vr: -6 + (i % 13) * 1,
        life: 1400,
        born: now
      });
    }
  }

  function spawnZeusLightning() {
    const now = performance.now();
    const reel = layout?.reels || DEFAULT_LAYOUT.reels;
    const zeusRect = layout?.zeusIdle || DEFAULT_LAYOUT.zeusIdle;
    // Zeus position (center of Zeus image)
    const fromX = zeusRect.x + zeusRect.w * 0.5;
    const fromY = zeusRect.y + zeusRect.h * 0.3; // top third (hand area)
    // Target: center of reels
    const toX = reel.x + reel.w * 0.5;
    const toY = reel.y + reel.h * 0.5;

    // Generate branching lightning path
    function generateBoltPath(fx, fy, tx, ty, depth = 0) {
      const path = [{ x: fx, y: fy }];
      const dx = tx - fx;
      const dy = ty - fy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const steps = Math.max(3, Math.floor(dist / 40));
      const baseAngle = Math.atan2(dy, dx);

      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        const x = fx + dx * t;
        const y = fy + dy * t;
        // Add random jitter for lightning effect
        const jitter = (depth < 2) ? 12 : 6;
        const jx = (Math.random() - 0.5) * jitter * (1 - t * 0.5);
        const jy = (Math.random() - 0.5) * jitter * (1 - t * 0.5);
        path.push({ x: x + jx, y: y + jy });
      }
      path.push({ x: tx, y: ty });
      return path;
    }

    const bolts = [];
    // Main bolt only (reduced branches for performance)
    bolts.push({
      path: generateBoltPath(fromX, fromY, toX, toY, 0),
      opacity: 1
    });
    // Single branch bolt (reduced from 2-3 to 1)
    const branchT = 0.4;
    const branchX = fromX + (toX - fromX) * branchT + (Math.random() - 0.5) * 60;
    const branchY = fromY + (toY - fromY) * branchT + (Math.random() - 0.5) * 40;
    bolts.push({
      path: generateBoltPath(branchX, branchY, toX + (Math.random() - 0.5) * 80, toY + (Math.random() - 0.5) * 80, 1),
      opacity: 0.7
    });

    state.fx.zeusLightning = {
      start: now,
      bolts
    };
  }

  function setOutcomeFx(spin) {
    if (spin?.mega) return 'mega';
    if (spin?.win > 0) {
      // 1st win: red, 2nd win: green (by scenario)
      return (spin.pattern === 0) ? 'red' : 'green';
    }
    return 'lose';
  }

  function triggerImpactFxCanvas(spin) {
    const now = performance.now();
    state.fx.flashT = now + TUNING.stopFlashMs;
    state.fx.impactT = now;
    state.fx.shakeT = now + TUNING.shakeMs;
    state.fx.shakeAmp = TUNING.shakeAmpPx;
    state.fx.winT = (spin && spin.win > 0) ? now : 0;
    state.fx.outcome = setOutcomeFx(spin);
    state.fx.toneT = 0;
    state.fx.chromaT = 0;
    // Ripple distortion on stop (for all wins)
    if (spin && spin.win > 0) {
      state.fx.rippleT = now;
      state.fx.rippleCenter = {
        x: canvas.width * 0.5,
        y: canvas.height * 0.5
      };
    }

    // sparks burst inside reels bounds
    const b = { x: 6, y: 6, w: canvas.width - 12, h: canvas.height - 12 };
    let sparkCount = 10 + (state.spinIndex % 9); // 10–18 deterministic
    spawnSparks(sparkCount, b);

    if (spin?.mega) {
      // Enhanced mega win sequence: flash → chroma → zoom → particles → confetti → shake
      state.fx.megaSequence = {
        start: now,
        phase: 'flash'
      };
      // Timeline orchestration
      state.fx.flashT = now + TUNING.megaFlashMs; // 0ms: White flash
      // Chromatic and glitch disabled on mega for performance (too heavy)
      // state.fx.chromaT = now + 80; // Disabled - getImageData is too expensive
      // state.fx.glitchT = now + 100; // Disabled - getImageData is too expensive
      startZoom(TUNING.megaZoomScale, TUNING.megaZoomInMs); // 120ms: Camera zoom in
      // 200ms: Particles burst (delayed spawn, reduced for performance)
      setTimeout(() => {
        if (state.fx.megaSequence && state.fx.megaSequence.phase !== 'done') {
          spawnSparks(12, b); // Reduced from 22 to 12
          state.fx.megaSequence.phase = 'particles';
        }
      }, 200);
      // 320ms: Confetti spawn (reduced for performance)
      setTimeout(() => {
        if (state.fx.megaSequence && state.fx.megaSequence.phase !== 'done') {
          spawnConfetti(Math.floor(TUNING.confettiCount * 0.6), b); // Reduced from 140 to ~84
          state.fx.megaSequence.phase = 'confetti';
        }
      }, 320);
      // 400ms: Screen shake peak
      state.fx.shakeT = now + 400;
      state.fx.shakeAmp = TUNING.megaShakeAmpPx;
      // 720ms: Zoom bounce back (handled by startZoom)
      state.fx.shockwaveT = now;
      state.fx.toneT = now + TUNING.megaToneMs; // purple tone after flash
      // Mark sequence complete after all phases
      setTimeout(() => {
        if (state.fx.megaSequence) {
          state.fx.megaSequence.phase = 'done';
        }
      }, TUNING.megaSequenceMs);
    }
  }

  function updateParticles(dtMs) {
    const g = 680; // gravity px/s^2
    const now = performance.now();
    const out = [];
    for (const p of state.fx.particles) {
      const age = now - p.born;
      if (age >= p.life) continue;
      const dt = dtMs / 1000;
      p.vy += g * dt * (p.kind === 'coin' ? 0.55 : 1);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'coin') {
        p.rot += (p.vr || 0) * dt;
      }
      out.push(p);
    }
    state.fx.particles = out;
  }

  function updateZoom() {
    if (!state.fx.zoomDur) return;
    const now = performance.now();
    const t = clamp01((now - state.fx.zoomStart) / state.fx.zoomDur);
    const eased = easeOutCubic(t);
    state.fx.zoom = state.fx.zoomFrom + (state.fx.zoomTo - state.fx.zoomFrom) * eased;
    resize();
    if (t >= 1) {
      // if we zoomed in for mega, bounce back
      if (Math.abs(state.fx.zoomTo - 1) > 0.001) {
        state.fx.zoomFrom = state.fx.zoom;
        state.fx.zoomTo = 1;
        state.fx.zoomStart = now;
        state.fx.zoomDur = TUNING.megaZoomOutMs;
      } else {
        state.fx.zoomDur = 0;
      }
    }
  }

  const predefinedSpins = [
    {
      // 1: WIN diagonal (S03)
      grid: applyPatternWithSymbol([
        ['S07', 'S10', 'S03', 'S09', 'S05', 'S11'],
        ['S04', 'S09', 'S10', 'S03', 'S08', 'S05'],
        ['S03', 'S06', 'S11', 'S07', 'S04', 'S09'],
        ['S10', 'S05', 'S08', 'S11', 'S06', 'S03'],
        ['S04', 'S07', 'S09', 'S05', 'S10', 'S08']
      ], WIN_PATTERNS[0], 'S03'),
      win: 7,
      balance: 957,
      pattern: 0
    },
    {
      // 2: WIN diagonal (S04)
      grid: applyPatternWithSymbol([
        ['S07', 'S10', 'S03', 'S09', 'S05', 'S11'],
        ['S04', 'S09', 'S10', 'S03', 'S08', 'S05'],
        ['S03', 'S06', 'S11', 'S07', 'S04', 'S09'],
        ['S10', 'S05', 'S08', 'S11', 'S06', 'S03'],
        ['S04', 'S07', 'S09', 'S05', 'S10', 'S08']
      ], WIN_PATTERNS[1], 'S04'),
      win: 120,
      balance: 1077,
      pattern: 1
    },
    {
      // 3rd spin: проигрышный
      grid: [
        ['S07', 'S09', 'S04', 'S10', 'S05', 'S08'],
        ['S03', 'S06', 'S11', 'S07', 'S04', 'S09'],
        ['S05', 'S08', 'S10', 'S03', 'S11', 'S06'],
        ['S09', 'S04', 'S07', 'S10', 'S05', 'S11'],
        ['S08', 'S05', 'S03', 'S06', 'S10', 'S04']
      ],
      win: 0,
      balance: 1863,
      pattern: null
    },
    {
      // 4: WIN zigzag (S08)
      grid: applyPatternWithSymbol([
        ['S07', 'S09', 'S04', 'S10', 'S05', 'S08'],
        ['S03', 'S06', 'S11', 'S07', 'S04', 'S09'],
        ['S05', 'S08', 'S10', 'S03', 'S11', 'S06'],
        ['S09', 'S04', 'S07', 'S10', 'S05', 'S11'],
        ['S08', 'S05', 'S03', 'S06', 'S10', 'S04']
      ], WIN_PATTERNS[2], 'S08'),
      win: 2500,
      balance: 4363,
      mega: true,
      pattern: 2
    }
  ];

  const initialGrid = [
    ['S07', 'S09', 'S04', 'S10', 'S05', 'S08'],
    ['S03', 'S06', 'S11', 'S07', 'S04', 'S09'],
    ['S05', 'S08', 'S10', 'S03', 'S11', 'S06'],
    ['S09', 'S04', 'S07', 'S10', 'S05', 'S11'],
    ['S08', 'S05', 'S03', 'S06', 'S10', 'S04']
  ];

  const symbolKeys = [
    'S01M', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11'
  ];

  function preload() {
    const images = [
      bgImg, cloud5Img, cloud6Img, logoImg,
      zeusIdle, overlayFx, zeusFx
    ];
    const assetMap = {
      background: bgImg,
      cloud5: cloud5Img,
      cloud6: cloud6Img,
      logo: logoImg,
      zeusIdle,
      overlay: overlayFx
    };

    for (const [key, img] of Object.entries(assetMap)) {
      img.src = ASSETS[key];
    }

    for (const key of Object.keys(ASSETS.symbols)) {
      state.assets[key] = new Image();
      state.assets[key].src = ASSETS.symbols[key];
    }

    return Promise.all([
      ...images.map(loadImage),
      ...Object.values(state.assets).map(loadImage)
    ]);
  }

  function loadImage(img) {
    return new Promise((resolve, reject) => {
      if (img.complete) {
        resolve();
        return;
      }
      img.onload = () => resolve();
      img.onerror = (e) => reject(e);
    });
  }

  function init() {
    state.grid = cloneGrid(initialGrid);
    initLayout();
    initViewability();
    initAudio();
    initMicroFx();
    if (balanceEl) balanceEl.textContent = formatMoney(state.balance);
    if (winEl) winEl.textContent = formatMoney(0);
    if (megaValueEl) megaValueEl.textContent = formatMoney(state.balance);
    // Never use the secondary Zeus element; keep it hidden permanently.
    if (zeusCast) zeusCast.classList.add('hidden');
    resize();
    window.addEventListener('resize', resize);
    spinBtn.addEventListener('click', () => {
      userAction();
      onSpin();
    });
    bonusBtn.addEventListener('click', () => {
      audio?.play('cta_click');
      clickout();
      showEndcard();
    });
    keepPlayingBtn.addEventListener('click', () => {
      audio?.play('cta_click');
      hideOverlay(bonusPopup);
      showEndcard();
    });
    installBtn.addEventListener('click', () => {
      audio?.play('cta_click');
      clickout();
    });
    window.addEventListener('pointerdown', userAction, { passive: true });
    requestAnimationFrame(loop);
    updateHud();
    startIdleTimer();
  }

  function initAudio() {
    if (!window.AudioManager) return;

    audio = new window.AudioManager({
      files: {
        ui_click: 'assets/audio/ui_click.mp3',
        spin_whoosh: 'assets/audio/spin_whoosh.mp3',
        spin: 'assets/audio/spin.mp3',
        reel_stop: 'assets/audio/reel_stop.mp3',
        win_small: 'assets/audio/win_small.mp3',
        win_mega_hit: 'assets/audio/win_mega_hit.mp3',
        jackpot: 'assets/audio/jackpot.mp3',
        lightning_zap: 'assets/audio/lightning_zap.mp3',
        popup: 'assets/audio/popup.mp3',
        cta_click: 'assets/audio/cta_click.mp3',
        bg_music: 'assets/audio/bg_music.mp3'
      }
    });

    // UI state for mute button
    if (muteBtn) {
      const syncMuteBtn = () => {
        muteBtn.classList.toggle('muted', !!audio?.muted);
        muteBtn.textContent = audio?.muted ? 'MUTED' : 'SOUND';
      };
      syncMuteBtn();
      muteBtn.addEventListener('click', async () => {
        await audio.unlock();
        audio.toggleMute();
        syncMuteBtn();
      });
    }

    // Unlock on first gesture + preload
    const onFirstGesture = async () => {
      document.removeEventListener('pointerdown', onFirstGesture, true);
      await audio.unlock();
      await audio.preload();
      // Start looping bg only after unlock+preload (mobile/webview safe)
      audio.startBackground('bg_music', { volume: TUNING.musicVolume });
    };
    document.addEventListener('pointerdown', onFirstGesture, true);
  }

  async function ensureAudioReady() {
    if (!audio) return false;
    if (audio.audioUnlocked) return true;
    const ok = await audio.unlock();
    if (ok) await audio.preload();
    return ok;
  }

  function initViewability() {
    try {
      if (window.mraid && typeof window.mraid.addEventListener === 'function') {
        window.mraid.addEventListener('viewableChange', (v) => {
          isViewable = !!v;
          if (!isViewable) {
            stopIdleCue();
            clearTimeout(idleTimer);
            stopLightning();
          } else {
            startIdleTimer();
            startLightning();
          }
        });
      }
    } catch (e) {
      /* noop */
    }
  }

  function initMicroFx() {
    // start idle pulse quickly after load
    spinBtn.classList.add('idle');
    startLightning();

    spinBtn.addEventListener('pointerdown', async (e) => {
      playClickSpark(e);
      spinBtn.classList.add('press');
      setTimeout(() => spinBtn.classList.remove('press'), 160);
      await ensureAudioReady();
      audio?.play('ui_click');
    });
  }

  function playClickSpark(e) {
    if (!clickSpark || !gameEl) return;
    const rect = gameEl.getBoundingClientRect();
    const x = (e.clientX - rect.left);
    const y = (e.clientY - rect.top);
    // convert from screen coords to design coords: invert current scale
    const scale = getCurrentScale();
    const dx = x / scale;
    const dy = y / scale;
    clickSpark.style.left = `${dx - 30}px`;
    clickSpark.style.top = `${dy - 30}px`;
    clickSpark.classList.remove('active');
    // force reflow
    // eslint-disable-next-line no-unused-expressions
    clickSpark.offsetWidth;
    clickSpark.classList.add('active');
  }

  function getCurrentScale() {
    // gameEl transform is translate(-50%, -50%) scale(s)
    const t = gameEl.style.transform || '';
    const m = t.match(/scale\(([^)]+)\)/);
    const s = m ? parseFloat(m[1]) : 1;
    return Number.isFinite(s) && s > 0 ? s : 1;
  }

  function startLightning() {
    stopLightning();
    if (!isViewable) return;
    scheduleLightning();
  }

  function stopLightning() {
    if (lightningTimer) clearTimeout(lightningTimer);
    lightningTimer = null;
  }

  function scheduleLightning() {
    const delay = 1500 + Math.random() * 1500; // 1.5–3s
    lightningTimer = setTimeout(() => {
      if (!isViewable) return;
      zeusIdle.classList.add('lightning');
      setTimeout(() => zeusIdle.classList.remove('lightning'), 220);
      scheduleLightning();
    }, delay);
  }

  function resize() {
    const vw = getViewportWidth();
    const vh = getViewportHeight();
    const scale = Math.min(vw / DESIGN_WIDTH, vh / DESIGN_HEIGHT);
    const zoom = state.fx?.zoom || 1;
    const tNow = performance.now();
    // Apply rotation shake if active
    let rotation = 0;
    if (state.fx.shakeT && tNow < state.fx.shakeT) {
      const left = Math.max(0, state.fx.shakeT - tNow);
      const k = 1 - clamp01(left / (state.fx.outcome === 'mega' ? TUNING.megaShakeMs : TUNING.shakeMs));
      const amp = (state.fx.shakeAmp || 0) * (1 - k);
      // Rotation based on shake amplitude (stronger on mega)
      rotation = (Math.sin(tNow * 0.12) * amp * 0.08) * (state.fx.outcome === 'mega' ? 1.4 : 1);
      state.fx.shakeRot = rotation;
    } else {
      state.fx.shakeRot = 0;
    }
    // Apply transform with rotation
    if (Math.abs(rotation) > 0.001) {
      gameEl.style.transform = `translate(-50%, -50%) rotate(${rotation}deg) scale(${scale * zoom})`;
    } else {
      gameEl.style.transform = `translate(-50%, -50%) scale(${scale * zoom})`;
    }
  }

  function getViewportWidth() {
    try {
      if (window.mraid && typeof window.mraid.getMaxSize === 'function') {
        return window.mraid.getMaxSize().width;
      }
    } catch (e) {
      /* noop */
    }
    const wrapper = document.getElementById('wrapper');
    if (wrapper) return wrapper.clientWidth || window.innerWidth;
    return window.innerWidth;
  }

  function getViewportHeight() {
    try {
      if (window.mraid && typeof window.mraid.getMaxSize === 'function') {
        return window.mraid.getMaxSize().height;
      }
    } catch (e) {
      /* noop */
    }
    const wrapper = document.getElementById('wrapper');
    if (wrapper) return wrapper.clientHeight || window.innerHeight;
    return window.innerHeight;
  }

  // -------------------- Layout system (single source of truth) --------------------
  const DEFAULT_LAYOUT = {
    reels: { x: 140, y: 460, w: 800, h: 860 },
    zeusIdle: { x: 720, y: 560, w: 420, h: 820 },
    spinBtn: { x: 320, y: 1500, w: 440, h: 130 },
    hud: { x: 0, y: 150, w: 1080, h: 260 },
    title: { x: 0, y: -71, w: 1080, h: 80 },
    logo: { x: 230, y: 310, w: 620, h: 150 }
  };

  let layout = null;

  function initLayout() {
    layout = (window.LAYOUT && typeof window.LAYOUT === 'object') ? window.LAYOUT : DEFAULT_LAYOUT;

    applyLayoutToElement(canvas, layout.reels);
    applyLayoutToElement(zeusIdle, layout.zeusIdle);
    applyLayoutToElement(spinBtn, layout.spinBtn);
    applyLayoutToElement(hudEl, layout.hud);
    applyLayoutToElement(titleEl, layout.title);
    applyLayoutToElement(logoImg, layout.logo);

    // Keep title centered text inside its own box
    if (titleEl) titleEl.style.width = `${layout.title.w}px`;

    if (LAYOUT_DEBUG) {
      enableLayoutDebug();
    }
  }

  function applyLayoutToElement(el, box) {
    if (!el || !box) return;
    el.style.position = 'absolute';
    el.style.left = `${box.x}px`;
    el.style.top = `${box.y}px`;
    el.style.width = `${box.w}px`;
    el.style.height = `${box.h}px`;
    el.style.transform = 'none';
  }

  function enableLayoutDebug() {
    if (!copyLayoutBtn) return;
    copyLayoutBtn.classList.remove('hidden');

    const targets = [
      { id: 'reels', el: canvas },
      { id: 'zeusIdle', el: zeusIdle },
      { id: 'spinBtn', el: spinBtn },
      { id: 'hud', el: hudEl },
      { id: 'title', el: titleEl },
      { id: 'logo', el: logoImg }
    ];

    const overlays = targets.map((t) => createDebugOverlay(t.id, t.el));

    copyLayoutBtn.addEventListener('click', async () => {
      const json = {};
      for (const t of targets) {
        const rect = getLayoutFromElement(t.el);
        json[t.id] = rect;
      }
      const text = JSON.stringify(json, null, 2);
      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        // fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      // expose latest layout for easy paste into manifest / file
      window.LAYOUT = json;
    });

    function syncOverlays() {
      for (const o of overlays) o.sync();
    }

    // Update overlay positions every frame (cheap, but keeps in sync)
    const prevLoop = loop;
    // no-op: loop already runs; just hook into render
    const prevRender = render;
    render = function renderWithDebug() {
      prevRender();
      syncOverlays();
    };
  }

  function getLayoutFromElement(el) {
    const x = parseFloat(el.style.left || '0') || 0;
    const y = parseFloat(el.style.top || '0') || 0;
    const w = parseFloat(el.style.width || el.getAttribute('width') || '0') || el.offsetWidth || 0;
    const h = parseFloat(el.style.height || el.getAttribute('height') || '0') || el.offsetHeight || 0;
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  }

  function createDebugOverlay(id, targetEl) {
    const box = document.createElement('div');
    box.className = 'layout-debug-box';
    box.dataset.target = id;

    const label = document.createElement('div');
    label.className = 'layout-debug-label';
    box.appendChild(label);

    const handle = document.createElement('div');
    handle.className = 'layout-debug-handle';
    box.appendChild(handle);

    // overlay must be in the same coordinate space as target (inside #game)
    gameEl.appendChild(box);

    let mode = null; // 'move' | 'resize'
    let startX = 0;
    let startY = 0;
    let startRect = null;

    const startPointer = (e, nextMode) => {
      if (!LAYOUT_DEBUG) return;
      mode = nextMode;
      startX = e.clientX;
      startY = e.clientY;
      startRect = getLayoutFromElement(targetEl);
      box.setPointerCapture(e.pointerId);
      e.preventDefault();
    };

    box.addEventListener('pointerdown', (e) => startPointer(e, 'move'));
    handle.addEventListener('pointerdown', (e) => startPointer(e, 'resize'));

    box.addEventListener('pointermove', (e) => {
      if (!mode || !startRect) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (mode === 'move') {
        applyLayoutToElement(targetEl, { ...startRect, x: startRect.x + dx, y: startRect.y + dy });
      } else {
        applyLayoutToElement(targetEl, {
          ...startRect,
          w: Math.max(10, startRect.w + dx),
          h: Math.max(10, startRect.h + dy)
        });
      }
      sync();
    });

    box.addEventListener('pointerup', () => {
      mode = null;
      startRect = null;
    });

    function sync() {
      const r = getLayoutFromElement(targetEl);
      box.style.left = `${r.x}px`;
      box.style.top = `${r.y}px`;
      box.style.width = `${r.w}px`;
      box.style.height = `${r.h}px`;
      label.textContent = `${id} x:${r.x} y:${r.y} w:${r.w} h:${r.h}`;
    }

    sync();
    return { sync };
  }

  function onSpin() {
    if (state.spinning) return;
    if (state.spinIndex >= predefinedSpins.length) return;
    stopIdleCue();
    const spin = predefinedSpins[state.spinIndex];
    startSpin(spin);
  }

  async function startSpin(spin) {
    state.spinning = true;
    state.spinStart = performance.now();
    state.pendingOutcome = spin;
    setWinPattern(spin.pattern);
    state.winRevealStart = 0;
    state.stopPhase = false;
    state.stopStart = 0;
    state.stopFromOffset = 0;
    state.stopTick = 0;
    spinBtn.disabled = true;
    canvas.classList.add('reels-whoosh');
    setTimeout(() => canvas.classList.remove('reels-whoosh'), 220);
    flyZeusToCorner(state.spinIndex);
    setZeusMode('casting');
    spawnZeusLightning(); // Lightning during casting
    pulseVignette('spin');

    await ensureAudioReady();
    audio?.play('spin_whoosh');
    // looping spin bed while reels are spinning (with lowpass filter)
    if (audio?.playLoop) {
      try { spinLoopHandle?.stop?.(); } catch (e) { /* noop */ }
      spinLoopHandle = audio.playLoop('spin', { volume: TUNING.spinLoopVolume, lowpass: true });
    }
    scheduleReelStops();

    // hide win line while spinning
    if (winLines) {
      winLines.classList.remove('active');
      winLines.classList.add('hidden');
    }
  }

  function scheduleReelStops() {
    // deterministic reel-stop ticks (even though visuals are fake)
    for (let i = 0; i < COLS; i += 1) {
      const delay = (state.stopDelays[i] || 0) + Math.max(0, state.spinDuration - 240);
      setTimeout(() => {
        if (!state.spinning) return;
        // Add random pitch variation to prevent monotony
        const pitchVariation = 1 + (Math.random() - 0.5) * TUNING.pitchVariation * 2;
        audio?.play('reel_stop', { rate: pitchVariation });
      }, delay);
    }
  }

  function settleSpin() {
    state.spinning = false;
    // Gradually increase lowpass cutoff frequency on stop (unmuffle)
    if (spinLoopHandle && audio) {
      audio.applyFilterToLoop('spin', 'lowpass', 22000); // Full frequency range
      setTimeout(() => {
        try { spinLoopHandle?.stop?.(); } catch (e) { /* noop */ }
        spinLoopHandle = null;
      }, 400);
    } else {
      try { spinLoopHandle?.stop?.(); } catch (e) { /* noop */ }
      spinLoopHandle = null;
    }
    const spin = state.pendingOutcome || predefinedSpins[state.spinIndex];
    state.pendingOutcome = null;
    state.grid = cloneGrid(spin.grid);
    state.lastWin = spin.win;
    state.balance = spin.balance;
    state.spinIndex += 1;
    updateHud();
    playImpactFx();
    triggerImpactFxCanvas(spin);
    setZeusMode(spin.mega ? 'celebrate' : 'idle');
    if (spin.mega) {
      zeusLightningOverlay(0.95);
      spawnZeusLightning(); // Canvas lightning for mega win
    } else if (spin.win > 0) {
      zeusLightningOverlay(0.75);
    }
    pulseVignette(spin.mega ? 'mega' : (spin.win > 0 ? 'win' : 'lose'));
    canvas.classList.remove('reels-whoosh');
    canvas.classList.add('reels-impact');
    setTimeout(() => canvas.classList.remove('reels-impact'), 200);

    if (spin.win > 0) {
      if (MORPH_WIN_TO_S01M) state.winRevealStart = performance.now();
      showWinLines();
      // Duck bg music slightly so SFX + win moment hits harder
      audio?.duck(TUNING.duckWin);
      audio?.play('win_small');
    }

    if (spin.mega) {
      // Stronger/longer duck for mega
      audio?.duck(TUNING.duckMega);
      audio?.play('win_mega_hit', { reverb: true });
      audio?.play('lightning_zap', { delayMs: 120, reverb: true });
      showMegaWin(spin.win);
    } else {
      spinBtn.disabled = false;
    }
    startIdleTimer();
  }

  function showWinLines() {
    if (!winLines) return;
    winLines.classList.remove('hidden');
    winLines.classList.remove('active');
    // restart animation
    // eslint-disable-next-line no-unused-expressions
    winLines.offsetWidth;
    winLines.classList.add('active');
    setTimeout(() => {
      winLines.classList.remove('active');
      winLines.classList.add('hidden');
    }, 540);
  }

  function showMegaWin(amount) {
    audio?.play('jackpot', { volume: TUNING.jackpotVolume, reverb: true });
    // make overlay feel alive during count-up
    megaOverlay?.classList.add('mega-pulse');
    const bursts = [megaBurstTL, megaBurstTR, megaBurstBL, megaBurstBR].filter(Boolean);
    bursts.forEach((b, i) => {
      b.classList.remove('active');
      // restart animation
      // eslint-disable-next-line no-unused-expressions
      b.offsetWidth;
      setTimeout(() => b.classList.add('active'), 120 + i * 120);
      setTimeout(() => b.classList.remove('active'), 900 + i * 80);
    });
    // second wave (fatter)
    bursts.forEach((b, i) => {
      setTimeout(() => {
        b.classList.remove('active');
        // eslint-disable-next-line no-unused-expressions
        b.offsetWidth;
        b.classList.add('active');
      }, 520 + i * 90);
    });
    animateMegaValue(amount);
    
    // GSAP animation for mega overlay reveal
    if (window.gsap && megaOverlay) {
      gsap.fromTo(megaOverlay, 
        { scale: 0.8, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.7)' }
      );
    } else {
      showOverlay(megaOverlay);
    }
    
    // particles.js confetti for mega win
    if (window.particlesJS && !particlesInstance) {
      const particlesContainer = document.createElement('div');
      particlesContainer.id = 'particles-js';
      particlesContainer.style.position = 'fixed';
      particlesContainer.style.top = '0';
      particlesContainer.style.left = '0';
      particlesContainer.style.width = '100%';
      particlesContainer.style.height = '100%';
      particlesContainer.style.pointerEvents = 'none';
      particlesContainer.style.zIndex = '9998';
      document.body.appendChild(particlesContainer);
      
      particlesJS('particles-js', {
        particles: {
          number: { value: 40, density: { enable: false } }, // Reduced from 80 to 40, disabled density calc
          color: { value: ['#ffd65b', '#f9c22b', '#ffaa00'] }, // Reduced colors
          shape: { type: 'circle' },
          opacity: { value: 0.8, random: false }, // Disabled random for performance
          size: { value: 4, random: false }, // Disabled random
          move: {
            enable: true,
            speed: 2.5, // Slightly faster to finish sooner
            direction: 'bottom',
            random: false, // Disabled for performance
            straight: false,
            out_mode: 'out',
            bounce: false
          }
        },
        interactivity: { detect_on: 'canvas', events: { onhover: { enable: false }, onclick: { enable: false }, resize: false } }, // Disabled resize detection
        retina_detect: false // Disabled for performance
      });
      particlesInstance = particlesContainer;
      
      // Stop particles after 3 seconds
      setTimeout(() => {
        if (particlesInstance && particlesInstance.parentNode) {
          particlesInstance.parentNode.removeChild(particlesInstance);
          particlesInstance = null;
        }
      }, 3000);
    }
    
    setTimeout(() => {
      if (window.gsap && megaOverlay) {
        gsap.to(megaOverlay, { scale: 0.9, opacity: 0, duration: 0.3, ease: 'power2.in', onComplete: () => {
          hideOverlay(megaOverlay);
          megaOverlay?.classList.remove('mega-pulse');
        }});
      } else {
        hideOverlay(megaOverlay);
        megaOverlay?.classList.remove('mega-pulse');
      }
      audio?.play('popup');
      showOverlay(bonusPopup);
    }, 1500);
  }

  function animateMegaValue(to) {
    if (!megaValueEl) return;
    const from = 0;
    const duration = 1150;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(from + (to - from) * eased);
      megaValueEl.textContent = formatMoney(value);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function showOverlay(el) {
    if (!el) return;
    el.classList.remove('hidden');
    // GSAP animation if available
    if (window.gsap) {
      if (el === bonusPopup) {
        gsap.fromTo(el, 
          { scale: 0.9, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.4, ease: 'elastic.out(1, 0.5)' }
        );
      } else {
        gsap.fromTo(el,
          { scale: 0.95, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.3, ease: 'power2.out' }
        );
      }
    }
    el.classList.add('active');
  }

  function hideOverlay(el) {
    if (!el) return;
    // GSAP animation if available
    if (window.gsap) {
      gsap.to(el, { scale: 0.9, opacity: 0, duration: 0.2, ease: 'power2.in', onComplete: () => {
        el.classList.remove('active');
        el.classList.add('hidden');
      }});
    } else {
      el.classList.remove('active');
      setTimeout(() => el.classList.add('hidden'), 180);
    }
  }

  function showEndcard() {
    hideOverlay(bonusPopup);
    showOverlay(endcard);
  }

  function loop() {
    requestAnimationFrame(loop);
    if (!isViewable) return;
    // update FX first so render reads fresh state
    updateZoom();
    updateParticles(16.7);
    updateSpin();
    render();
  }

  function updateSpin() {
    if (!state.spinning) return;
    const now = performance.now();
    const elapsed = now - state.spinStart;
    if (!state.stopPhase && elapsed >= state.spinDuration) {
      // enter stop phase
      state.stopPhase = true;
      state.stopStart = now;
      state.stopTick = Math.floor(elapsed / 70);
      // compute current offset at the moment we start stopping
      state.stopFromOffset = ((elapsed * 0.65) % STEP);
      return;
    }
    if (state.stopPhase) {
      const t = (now - state.stopStart) / state.stopDuration;
      if (t >= 1) {
        settleSpin();
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    const totalWidth = COLS * SYMBOL_SIZE + (COLS - 1) * GAP;
    const totalHeight = ROWS * SYMBOL_SIZE + (ROWS - 1) * GAP;
    const startX = (canvas.width - totalWidth) / 2;
    const startY = (canvas.height - totalHeight) / 2;
    const tNow = performance.now();
    const revealT = (MORPH_WIN_TO_S01M && state.winRevealStart)
      ? Math.min(1, (tNow - state.winRevealStart) / TUNING.symbolMorphMs)
      : 1;

    const fillerSymbols = ['S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11'];
    const elapsed = tNow - state.spinStart;

    // screen shake (on stop / mega impact)
    if (state.fx.shakeT && tNow < state.fx.shakeT) {
      const left = Math.max(0, state.fx.shakeT - tNow);
      const k = 1 - clamp01(left / TUNING.shakeMs);
      const amp = (state.fx.shakeAmp || 0) * (1 - k);
      // deterministic pseudo-random based on time
      const sx = Math.sin(tNow * 0.08) * amp;
      const sy = Math.cos(tNow * 0.11) * amp;
      ctx.translate(sx, sy);
    }

    function easeOutBack(x) {
      const c1 = 1.35;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }

    // constant speed during fake spin, then ease-stop to alignment with a small bounce
    let fakeOffset = 0;
    let tick = 0;
    if (state.spinning) {
      if (!state.stopPhase) {
        // near-miss slow for losing outcome (last ~200ms)
        let speed = 0.65;
        if (state.pendingOutcome && state.pendingOutcome.win === 0) {
          const tSlow = clamp01((elapsed - (state.spinDuration - TUNING.nearMissSlowMs)) / TUNING.nearMissSlowMs);
          const k = easeOutQuad(tSlow);
          speed = 0.65 - (0.65 - 0.22) * k;
        }
        fakeOffset = ((elapsed * speed) % STEP);
        tick = Math.floor(elapsed / 70);
      } else {
        const t = Math.min(1, (tNow - state.stopStart) / state.stopDuration);
        const eased = easeOutBack(t);
        fakeOffset = state.stopFromOffset * (1 - eased);
        // Freeze symbols during the eased-stop so it doesn't look like it accelerates/changes.
        tick = state.stopTick;
      }
    }

    // ---------------- Spin blur overlay (cheap "whoosh/smear") ----------------
    if (state.spinning) {
      ctx.save();
      // subtle vertical smear gradient
      const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
      g.addColorStop(0, 'rgba(255,255,255,0.00)');
      g.addColorStop(0.15, `rgba(255,255,255,${(TUNING.blurDuringSpin * 0.28).toFixed(3)})`);
      g.addColorStop(0.5, `rgba(255,255,255,${(TUNING.blurDuringSpin * 0.12).toFixed(3)})`);
      g.addColorStop(0.85, `rgba(255,255,255,${(TUNING.blurDuringSpin * 0.28).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,255,255,0.00)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // deterministic tiny noise streaks
      const n = 22;
      for (let i = 0; i < n; i += 1) {
        const x = ((tick * 17 + i * 53) % 800);
        const y = ((tick * 29 + i * 71) % 860);
        const h = 40 + ((tick * 7 + i * 19) % 120);
        ctx.fillStyle = `rgba(255,255,255,${(TUNING.blurDuringSpin * 0.14).toFixed(3)})`;
        ctx.fillRect(x, y, 2, h);
      }
      ctx.restore();
    }

    for (let c = 0; c < COLS; c += 1) {
      // Motion blur per column during spin
      const shouldBlur = state.spinning && !state.stopPhase;
      let blurAmount = shouldBlur ? TUNING.motionBlurPx : 0;
      // Gradually reduce blur during stop phase
      if (state.spinning && state.stopPhase) {
        const stopT = clamp01((tNow - state.stopStart) / state.stopDuration);
        blurAmount = TUNING.motionBlurPx * (1 - easeOutQuad(stopT));
      }
      ctx.save();
      if (blurAmount > 0) {
        ctx.filter = `blur(${blurAmount}px)`;
      }
      for (let r = -1; r < ROWS + 1; r += 1) {
        const baseY = startY + r * STEP - (state.spinning ? fakeOffset : 0);
        let currentId;
        if (state.spinning) {
          // deterministic fake symbols (no RNG)
          const idx = (tick + c * 7 + r * 3 + 1000) % fillerSymbols.length;
          currentId = fillerSymbols[idx];
        } else {
          currentId = getSymbolForCell(c, r);
        }

        const img = state.assets[currentId] || state.assets.S07;
        let y = baseY;
        let x = startX + c * STEP;
        // Apply ripple distortion if active
        if (state.fx.rippleT && tNow < state.fx.rippleT + TUNING.rippleMs) {
          const rippleAge = tNow - state.fx.rippleT;
          const rippleT = clamp01(rippleAge / TUNING.rippleMs);
          if (rippleT < 1) {
            const cx = state.fx.rippleCenter.x;
            const cy = state.fx.rippleCenter.y;
            const symbolCenterX = x + SYMBOL_SIZE / 2;
            const symbolCenterY = y + SYMBOL_SIZE / 2;
            const dx = symbolCenterX - cx;
            const dy = symbolCenterY - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const maxDist = Math.sqrt(canvas.width * canvas.width + canvas.height * canvas.height);
            const normalizedDist = dist / maxDist;
            // Wave calculation: expanding circular waves
            const waveSpeed = 0.8;
            const waveFreq = 0.12;
            const waveAmp = 8 * (1 - rippleT);
            const wavePhase = (normalizedDist - rippleT * waveSpeed) * Math.PI * 2 * waveFreq;
            const waveOffset = Math.sin(wavePhase) * waveAmp * (1 - normalizedDist);
            // Apply distortion
            const angle = Math.atan2(dy, dx);
            x += Math.cos(angle) * waveOffset;
            y += Math.sin(angle) * waveOffset;
          }
        }

        // Optional: After settle, morph winning cells into S01M (scatter)
        if (MORPH_WIN_TO_S01M && !state.spinning && r >= 0 && r < ROWS && isWinCell(c, r) && revealT < 1) {
          const cx = startX + c * STEP + SYMBOL_SIZE / 2;
          const cy = y + SYMBOL_SIZE / 2;
          const scatterImg = state.assets.S01M || img;
          // Enhanced morph with scale bounce (1.0 → 1.15 → 1.0)
          const easeBack = easeOutBack(revealT);
          const scaleBounce = 1 + (easeBack - 1) * 0.15; // 1.0 → 1.15 → 1.0
          ctx.save();
          ctx.translate(cx, cy);
          ctx.scale(scaleBounce, scaleBounce);
          // Crossfade: base symbol fades out, S01M fades in
          ctx.globalAlpha = 1 - revealT;
          ctx.drawImage(img, -SYMBOL_SIZE / 2, -SYMBOL_SIZE / 2, SYMBOL_SIZE, SYMBOL_SIZE);
          ctx.globalAlpha = revealT;
          // Add glow pulse synchronized with morph
          if (revealT > 0.3 && revealT < 0.7) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.shadowBlur = TUNING.glowBlur * (1 - Math.abs(revealT - 0.5) * 2);
            ctx.shadowColor = state.fx.outcome === 'mega'
              ? 'rgba(180, 120, 255, 0.95)'
              : 'rgba(255, 214, 107, 0.92)';
          }
          ctx.drawImage(scatterImg, -SYMBOL_SIZE / 2, -SYMBOL_SIZE / 2, SYMBOL_SIZE, SYMBOL_SIZE);
          ctx.restore();
        } else {
          // after morph completed, force S01M on winning cells
          if (MORPH_WIN_TO_S01M && !state.spinning && r >= 0 && r < ROWS && isWinCell(c, r) && state.winRevealStart) {
            const scatterImg = state.assets.S01M || img;
              ctx.drawImage(scatterImg, x, y, SYMBOL_SIZE, SYMBOL_SIZE);
          } else {
            // Win highlight: base + additive glow pass + micro-pop
            if (!state.spinning && r >= 0 && r < ROWS && isWinCell(c, r)) {
              const t = clamp01((tNow - state.winAnimStart) / TUNING.winPopMs);
              const pulse = 1 + Math.sin(t * Math.PI) * (TUNING.winPopScale - 1); // 1 → 1.08 → 1
              const cx = startX + c * STEP + SYMBOL_SIZE / 2;
              const cy = y + SYMBOL_SIZE / 2;

              ctx.save();
              ctx.translate(cx, cy);
              ctx.scale(pulse, pulse);
              // base pass
              ctx.globalAlpha = 1;
              ctx.drawImage(img, -SYMBOL_SIZE / 2, -SYMBOL_SIZE / 2, SYMBOL_SIZE, SYMBOL_SIZE);
              // additive glow pass (cheap "bloom")
              ctx.globalCompositeOperation = 'lighter';
              ctx.globalAlpha = TUNING.glowAlpha;
              ctx.shadowColor = (state.fx.outcome === 'green')
                ? 'rgba(80, 255, 170, 0.95)'
                : (state.fx.outcome === 'mega')
                  ? 'rgba(180, 120, 255, 0.98)'
                  : 'rgba(255, 214, 107, 0.92)';
              ctx.shadowBlur = TUNING.glowBlur;
              ctx.drawImage(img, -SYMBOL_SIZE / 2, -SYMBOL_SIZE / 2, SYMBOL_SIZE, SYMBOL_SIZE);
              ctx.restore();
            } else {
              ctx.drawImage(img, x, y, SYMBOL_SIZE, SYMBOL_SIZE);
            }
          }
        }
      }
      ctx.restore(); // Restore blur filter per column
    }

    // ---------------- Outcome overlays (red/green/lose/mega) ----------------
    if (!state.spinning) {
      const tWin = state.fx.winT ? clamp01((tNow - state.fx.winT) / 900) : 1;
      const a = (1 - tWin) * TUNING.overlayPeakAlpha;
      if (a > 0.001) {
        ctx.save();
        ctx.globalAlpha = a;
        if (state.fx.outcome === 'red') {
          // aggressive rays
          const cx = canvas.width * 0.5;
          const cy = canvas.height * 0.5;
          const rays = 22;
          for (let i = 0; i < rays; i += 1) {
            const ang = (i / rays) * Math.PI * 2 + tNow * 0.0015;
            const r1 = 40;
            const r2 = 520;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(ang - 0.06) * r2, cy + Math.sin(ang - 0.06) * r2);
            ctx.lineTo(cx + Math.cos(ang + 0.06) * r2, cy + Math.sin(ang + 0.06) * r2);
            ctx.closePath();
            const grad = ctx.createRadialGradient(cx, cy, r1, cx, cy, r2);
            grad.addColorStop(0, 'rgba(255,70,70,0.0)');
            grad.addColorStop(0.28, 'rgba(255,70,70,0.55)');
            grad.addColorStop(1, 'rgba(255,70,70,0.0)');
            ctx.fillStyle = grad;
            ctx.fill();
          }
          // extra bloom wash
          ctx.globalCompositeOperation = 'lighter';
          const wash = ctx.createRadialGradient(cx, cy, 40, cx, cy, 560);
          wash.addColorStop(0, 'rgba(255,90,90,0.45)');
          wash.addColorStop(0.6, 'rgba(255,90,90,0.12)');
          wash.addColorStop(1, 'rgba(255,90,90,0)');
          ctx.fillStyle = wash;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else if (state.fx.outcome === 'green') {
          // magical aura
          const g = ctx.createRadialGradient(canvas.width * 0.5, canvas.height * 0.55, 20, canvas.width * 0.5, canvas.height * 0.55, 560);
          g.addColorStop(0, 'rgba(80,255,170,0.75)');
          g.addColorStop(0.5, 'rgba(80,255,170,0.22)');
          g.addColorStop(1, 'rgba(80,255,170,0.0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          // soft upward energy streaks
          ctx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 14; i += 1) {
            const x = ((i * 53 + tNow * 0.06) % canvas.width);
            const y = canvas.height - ((i * 71 + tNow * 0.09) % 560);
            ctx.globalAlpha = a * 0.35;
            ctx.fillStyle = 'rgba(80,255,170,0.6)';
            ctx.fillRect(x, y, 3, 120);
          }
        } else if (state.fx.outcome === 'lose') {
          // dull dim + slight vignette
          ctx.fillStyle = 'rgba(0,0,0,0.32)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else if (state.fx.outcome === 'mega') {
          const g = ctx.createRadialGradient(canvas.width * 0.5, canvas.height * 0.5, 40, canvas.width * 0.5, canvas.height * 0.5, 560);
          g.addColorStop(0, 'rgba(180,120,255,0.75)');
          g.addColorStop(0.5, 'rgba(180,120,255,0.24)');
          g.addColorStop(1, 'rgba(180,120,255,0.0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // mega rays (cinematic)
          ctx.globalCompositeOperation = 'lighter';
          const cx = canvas.width * 0.5;
          const cy = canvas.height * 0.5;
          // Reduced rays for performance (28 -> 16)
          const rays = 16;
          for (let i = 0; i < rays; i += 1) {
            const ang = (i / rays) * Math.PI * 2 + tNow * 0.0012;
            const r1 = 60;
            const r2 = 560;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(ang - 0.06) * r2, cy + Math.sin(ang - 0.06) * r2);
            ctx.lineTo(cx + Math.cos(ang + 0.06) * r2, cy + Math.sin(ang + 0.06) * r2);
            ctx.closePath();
            const grad = ctx.createRadialGradient(cx, cy, r1, cx, cy, r2);
            grad.addColorStop(0, 'rgba(180,120,255,0.0)');
            grad.addColorStop(0.26, 'rgba(180,120,255,0.34)');
            grad.addColorStop(1, 'rgba(180,120,255,0.0)');
            ctx.fillStyle = grad;
            ctx.fill();
          }
        }
        ctx.restore();
      }
    }

    // ---------------- Shockwave (mega) ----------------
    if (state.fx.shockwaveT) {
      const t = clamp01((tNow - state.fx.shockwaveT) / TUNING.shockwaveMs);
      if (t < 1) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (1 - t) * 0.85;
        const cx = canvas.width * 0.5;
        const cy = canvas.height * 0.5;
        const r = 40 + t * 520;
        const ring = ctx.createRadialGradient(cx, cy, r * 0.7, cx, cy, r);
        ring.addColorStop(0, 'rgba(180,120,255,0.0)');
        ring.addColorStop(0.65, 'rgba(180,120,255,0.35)');
        ring.addColorStop(1, 'rgba(180,120,255,0.0)');
        ctx.fillStyle = ring;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
    }

    // ---------------- Particles (sparks/coins) ----------------
    if (state.fx.particles.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of state.fx.particles) {
        const age = clamp01((tNow - p.born) / p.life);
        const alpha = 1 - age;
        if (p.kind === 'spark') {
          ctx.globalAlpha = alpha * 0.9;
          ctx.strokeStyle = 'rgba(255, 214, 107, 1)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
          ctx.stroke();
        } else {
          // coin/confetti blob
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot || 0);
          ctx.globalAlpha = alpha * 0.65;
          ctx.fillStyle = 'rgba(255, 214, 107, 0.95)';
          ctx.fillRect(-3, -5, 6, 10);
          ctx.restore();
        }
      }
      ctx.restore();
    }

    // ---------------- Screen flash (stop impact) ----------------
    if (state.fx.flashT && tNow < state.fx.flashT) {
      const left = state.fx.flashT - tNow;
      const isMega = state.fx.outcome === 'mega';
      const dur = isMega ? TUNING.megaFlashMs : TUNING.stopFlashMs;
      const t = 1 - clamp01(left / dur);
      const a = (1 - easeOutQuad(t)) * 0.9;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    // short purple tone after mega flash
    if (state.fx.toneT && tNow < state.fx.toneT) {
      const left = state.fx.toneT - tNow;
      const t = 1 - clamp01(left / TUNING.megaToneMs);
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.35;
      ctx.fillStyle = 'rgba(140, 70, 255, 1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    // chromatic-lite (mega) - DISABLED FOR PERFORMANCE
    // Chromatic aberration disabled - getImageData/putImageData is too expensive
    // Using simple colored overlay instead
    if (state.fx.chromaT && tNow < state.fx.chromaT) {
      const left = state.fx.chromaT - tNow;
      const t = 1 - clamp01(left / TUNING.chromaMs);
      const k = (1 - easeOutQuad(t)) * 0.15; // Reduced intensity
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = k;
      // Simple colored overlay instead of expensive getImageData
      ctx.fillStyle = 'rgba(180, 120, 255, 0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    // ---------------- Glitch Effect (mega) - DISABLED FOR PERFORMANCE ----------------
    // Glitch effect disabled - getImageData/putImageData is too expensive and causes lag

    // ---------------- Zeus Lightning (canvas) ----------------
    if (state.fx.zeusLightning) {
      const age = tNow - state.fx.zeusLightning.start;
      if (age < TUNING.lightningDurationMs) {
        const t = clamp01(age / TUNING.lightningDurationMs);
        const flicker = 0.7 + Math.sin(age * 0.05) * 0.3; // flicker effect
        const alpha = (1 - t) * flicker;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(180, 220, 255, 1)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(180, 220, 255, 0.9)';
        for (const bolt of state.fx.zeusLightning.bolts) {
          ctx.globalAlpha = alpha * bolt.opacity;
          ctx.beginPath();
          const path = bolt.path;
          if (path.length > 0) {
            ctx.moveTo(path[0].x, path[0].y);
            for (let i = 1; i < path.length; i += 1) {
              ctx.lineTo(path[i].x, path[i].y);
            }
          }
          ctx.stroke();
        }
        ctx.restore();
      } else {
        state.fx.zeusLightning = null;
      }
    }

    // ---------------- Film Grain Overlay (disabled on mega to avoid gray noise) ----------------
    // Film grain removed on mega win - was causing gray noise overlay
    ctx.restore();
  }

  function getSymbolForCell(col, row) {
    if (state.spinning && !state.columnSettled[col]) {
      const band = state.bands[col];
      const idx = (state.bandShift[col] + row + band.length) % band.length;
      return band[idx];
    }
    return state.grid[col][row] || 'S07';
  }

  function randomSymbol() {
    return symbolKeys[Math.floor(Math.random() * symbolKeys.length)];
  }

  function updateHud() {
    animateNumber(balanceEl, state.prevBalance ?? state.balance, state.balance, 900, 'balance');
    animateNumber(winEl, state.prevWin ?? state.lastWin, state.lastWin, 900, 'win');
    state.prevBalance = state.balance;
    state.prevWin = state.lastWin;
  }

  function startIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (state.spinning) return;
      spinBtn.classList.add('idle');
      showHandCue();
    }, IDLE_DELAY);
  }

  function stopIdleCue() {
    clearTimeout(idleTimer);
    spinBtn.classList.remove('idle');
    hideHandCue();
  }

  function userAction() {
    stopIdleCue();
    startIdleTimer();
  }

  function showHandCue() {
    if (!handCue) return;
    handCue.classList.remove('hidden');
    handCue.classList.remove('show');
    // force reflow to restart animation
    // eslint-disable-next-line no-unused-expressions
    handCue.offsetWidth;
    handCue.classList.add('show');
    setTimeout(() => hideHandCue(), 1400);
  }

  function hideHandCue() {
    if (!handCue) return;
    handCue.classList.remove('show');
    handCue.classList.add('hidden');
  }

  function animateNumber(el, from, to, duration, key) {
    if (!el) return;
    cancelAnimationFrame(numberAnimations[key]);
    const start = performance.now();
    const delta = to - from;
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(from + delta * eased);
      el.textContent = formatMoney(value);
      if (t < 1) {
        numberAnimations[key] = requestAnimationFrame(step);
      }
    };
    numberAnimations[key] = requestAnimationFrame(step);
  }

  function playImpactFx() {
    restartFx(flashFx, 'active', 260);
    restartFx(sparkFx, 'active', 440);
  }

  function pulseVignette(kind) {
    if (!vignetteEl) return;
    vignetteEl.classList.remove('mega');
    vignetteEl.classList.add('active');
    if (kind === 'mega') vignetteEl.classList.add('mega');
    clearTimeout(vignetteEl._t);
    vignetteEl._t = setTimeout(() => {
      vignetteEl.classList.remove('active');
      vignetteEl.classList.remove('mega');
    }, kind === 'mega' ? 900 : 520);
  }

  function zeusLightningOverlay(strength) {
    if (!zeusFx) return;
    // reuse overlay asset as an additive lightning layer around Zeus
    zeusFx.src = ASSETS.overlay;
    zeusFx.classList.remove('hidden');
    zeusFx.style.opacity = String(Math.max(0.35, Math.min(1, strength || 0.8)));
    // position around Zeus (single element)
    zeusFx.style.left = zeusIdle?.style.left || `${(layout?.zeusIdle || DEFAULT_LAYOUT.zeusIdle).x}px`;
    zeusFx.style.top = zeusIdle?.style.top || `${(layout?.zeusIdle || DEFAULT_LAYOUT.zeusIdle).y}px`;
    zeusFx.style.width = (zeusIdle?.style.width || `${(layout?.zeusIdle || DEFAULT_LAYOUT.zeusIdle).w}px`);
    zeusFx.style.height = (zeusIdle?.style.height || `${(layout?.zeusIdle || DEFAULT_LAYOUT.zeusIdle).h}px`);
    zeusFx.classList.add('active');
    clearTimeout(zeusFx._t);
    zeusFx._t = setTimeout(() => {
      zeusFx.classList.remove('active');
      zeusFx.classList.add('hidden');
    }, 520);
  }

  function setZeusMode(mode) {
    if (!zeusIdle) return;
    // Keep Zeus always visible and only swap sprite to avoid any teleport/jump.
    if (zeusCast) zeusCast.classList.add('hidden');

    if (mode === 'casting') {
      zeusIdle.src = ASSETS.symbols.wild;
      return;
    }
    if (mode === 'celebrate') {
      zeusIdle.src = ASSETS.symbols.summon;
      return;
    }
    // idle
    zeusIdle.src = ASSETS.zeusIdle;
  }

  function restartFx(el, className, duration) {
    if (!el) return;
    el.classList.remove(className);
    // eslint-disable-next-line no-unused-expressions
    el.offsetWidth;
    el.classList.add(className);
    setTimeout(() => el.classList.remove(className), duration);
  }

  function cloneGrid(grid) {
    return grid.map((col) => [...col]);
  }

  window.clickout = function clickout() {
    const url = window.STORE_URL || 'https://play.google.com/store/apps/details?id=com.example.app';
    try {
      if (window.mraid && typeof window.mraid.open === 'function') {
        window.mraid.open(url);
        return;
      }
    } catch (e) {
      /* noop */
    }
    try {
      if (window.ExitApi && typeof window.ExitApi.exit === 'function') {
        window.ExitApi.exit();
        return;
      }
    } catch (e) {
      /* noop */
    }
    window.open(url, '_blank');
  };

  preload()
    .then(init)
    .catch((err) => {
      console.error('asset load failed', err);
    });
})();

