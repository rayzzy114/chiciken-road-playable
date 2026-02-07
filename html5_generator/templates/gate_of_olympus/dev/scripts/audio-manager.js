(() => {
  class AudioManager {
    /**
     * @param {{ files: Record<string,string> }} opts
     */
    constructor(opts) {
      this.files = (opts && opts.files) ? opts.files : {};
      this.ctx = null;
      this.masterGain = null;
      this.sfxGain = null;
      this.musicGain = null;
      this.buffers = new Map();
      this.audioUnlocked = false;
      this.muted = false;
      this._preloading = null;
      this._bg = { name: null, source: null, gain: null };
      this._loops = new Map();
      this._musicBase = 0.35;

      this._loadMuteFromStorage();
      this._ensureContext();
      this._applyMute();
    }

    _ensureContext() {
      if (this.ctx) return;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1;
      this.masterGain.connect(this.ctx.destination);

      // route: SFX -> sfxGain -> masterGain; Music -> musicGain -> masterGain
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 1;
      this.sfxGain.connect(this.masterGain);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 1;
      this.musicGain.connect(this.masterGain);
    }

    _loadMuteFromStorage() {
      try {
        const v = window.localStorage.getItem('audioMuted');
        this.muted = v === '1';
      } catch (e) {
        /* noop */
      }
    }

    _saveMuteToStorage() {
      try {
        window.localStorage.setItem('audioMuted', this.muted ? '1' : '0');
      } catch (e) {
        /* noop */
      }
    }

    _applyMute() {
      if (!this.masterGain) return;
      this.masterGain.gain.value = this.muted ? 0 : 1;
    }

    setMuted(nextMuted) {
      this.muted = !!nextMuted;
      this._applyMute();
      this._saveMuteToStorage();
    }

    toggleMute() {
      this.setMuted(!this.muted);
    }

    /**
     * Unlocks audio on first user gesture.
     * Safe to call multiple times.
     */
    async unlock() {
      this._ensureContext();
      if (!this.ctx) return false;
      if (this.audioUnlocked) return true;
      try {
        if (this.ctx.state === 'suspended') {
          await this.ctx.resume();
        }
        this.audioUnlocked = true;
        return true;
      } catch (e) {
        return false;
      }
    }

    /**
     * Preload and decode all configured audio files.
     * If called before unlock, it will no-op.
     */
    async preload() {
      if (!this.audioUnlocked) return;
      if (!this.ctx) return;
      if (this._preloading) return this._preloading;

      const entries = Object.entries(this.files);
      this._preloading = Promise.all(entries.map(async ([name, url]) => {
        try {
          if (this.buffers.has(name)) return;
          const res = await fetch(url, { cache: 'force-cache' });
          if (!res.ok) return;
          const ab = await res.arrayBuffer();
          const buf = await this.ctx.decodeAudioData(ab);
          this.buffers.set(name, buf);
        } catch (e) {
          // per-file swallow: one missing/bad audio must not break all audio
        }
      })).catch(() => {
        // swallow preload errors; audio should never crash playable
      });
      return this._preloading;
    }

    /**
     * Start (or restart) a looping background track.
     * If audio isn't unlocked yet, it will no-op.
     * @param {string} name
     * @param {{volume?:number, rate?:number}} [opts]
     */
    startBackground(name, opts) {
      if (!this.audioUnlocked) return;
      if (!this.ctx || !this.masterGain || !this.musicGain) return;
      const buf = this.buffers.get(name);
      if (!buf) return;

      // if already playing same bg, keep it
      if (this._bg.source && this._bg.name === name) return;

      // stop previous bg if any
      try {
        if (this._bg.source) this._bg.source.stop();
      } catch (e) {
        /* noop */
      }
      this._bg.source = null;
      this._bg.gain = null;
      this._bg.name = name;

      const volume = (opts && typeof opts.volume === 'number') ? opts.volume : 0.35;
      const rate = (opts && typeof opts.rate === 'number') ? opts.rate : 1;
      this._musicBase = volume;

      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = rate;

      const gain = this.ctx.createGain();
      gain.gain.value = volume;

      src.connect(gain);
      gain.connect(this.musicGain);

      try {
        src.start();
        this._bg.source = src;
        this._bg.gain = gain;
      } catch (e) {
        /* noop */
      }
    }

    stopBackground() {
      try {
        if (this._bg.source) this._bg.source.stop();
      } catch (e) {
        /* noop */
      }
      this._bg.source = null;
      this._bg.gain = null;
      this._bg.name = null;
    }

    /**
     * Create a simple reverb impulse response
     * @returns {AudioBuffer}
     */
    _createReverbIR() {
      if (this._reverbIR) return this._reverbIR;
      const sampleRate = this.ctx.sampleRate;
      const length = sampleRate * 0.5; // 0.5 second IR
      const impulse = this.ctx.createBuffer(2, length, sampleRate);
      const left = impulse.getChannelData(0);
      const right = impulse.getChannelData(1);
      for (let i = 0; i < length; i += 1) {
        const n = length - i;
        const decay = Math.pow(n / length, 2);
        const noise = (Math.random() * 2 - 1) * decay;
        left[i] = noise;
        right[i] = noise;
      }
      this._reverbIR = impulse;
      return impulse;
    }

    /**
     * @param {string} name
     * @param {{volume?:number, rate?:number, delayMs?:number, reverb?:boolean}} [opts]
     */
    play(name, opts) {
      if (!this.audioUnlocked) return;
      if (!this.ctx || !this.masterGain) return;
      if (this.muted) return;
      const buf = this.buffers.get(name);
      if (!buf) return;

      const volume = (opts && typeof opts.volume === 'number') ? opts.volume : 1;
      const rate = (opts && typeof opts.rate === 'number') ? opts.rate : 1;
      const delayMs = (opts && typeof opts.delayMs === 'number') ? opts.delayMs : 0;
      const useReverb = (opts && opts.reverb === true);

      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;

      const gain = this.ctx.createGain();
      gain.gain.value = volume;
      src.connect(gain);

      // Apply reverb if requested
      if (useReverb && this.ctx.createConvolver) {
        const convolver = this.ctx.createConvolver();
        convolver.buffer = this._createReverbIR();
        gain.connect(convolver);
        convolver.connect(this.sfxGain || this.masterGain);
      } else {
        // SFX route (separate from music for ducking)
        if (this.sfxGain) gain.connect(this.sfxGain);
        else gain.connect(this.masterGain);
      }

      const when = this.ctx.currentTime + Math.max(0, delayMs) / 1000;
      try {
        src.start(when);
      } catch (e) {
        /* noop */
      }
    }

    /**
     * Apply filter to a loop sound
     * @param {string} name
     * @param {string} filterType
     * @param {number} frequency
     */
    applyFilterToLoop(name, filterType, frequency) {
      const loop = this._loops.get(name);
      if (!loop || !loop.filter) return;
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      try {
        loop.filter.frequency.cancelScheduledValues(now);
        loop.filter.frequency.setValueAtTime(loop.filter.frequency.value, now);
        loop.filter.frequency.linearRampToValueAtTime(frequency, now + 0.1);
      } catch (e) {
        /* noop */
      }
    }

    /**
     * Play a looping SFX. Returns a handle that can be stopped.
     * If audio isn't unlocked or buffer isn't ready, returns null.
     * @param {string} name
     * @param {{volume?:number, rate?:number, lowpass?:boolean}} [opts]
     * @returns {{name:string, stop:()=>void, filter?:BiquadFilterNode}|null}
     */
    playLoop(name, opts) {
      if (!this.audioUnlocked) return null;
      if (!this.ctx || !this.masterGain) return null;
      if (this.muted) return null;
      const buf = this.buffers.get(name);
      if (!buf) return null;

      // Stop any existing loop with the same name (avoid stacking)
      this.stopLoop(name);

      const volume = (opts && typeof opts.volume === 'number') ? opts.volume : 1;
      const rate = (opts && typeof opts.rate === 'number') ? opts.rate : 1;
      const useLowpass = (opts && opts.lowpass === true);

      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = rate;

      const gain = this.ctx.createGain();
      gain.gain.value = volume;

      let filter = null;
      if (useLowpass && this.ctx.createBiquadFilter) {
        filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800; // Start muffled
        src.connect(filter);
        filter.connect(gain);
      } else {
        src.connect(gain);
      }
      // Route looping SFX through SFX bus
      if (this.sfxGain) gain.connect(this.sfxGain);
      else gain.connect(this.masterGain);

      const stop = () => {
        try { src.stop(); } catch (e) { /* noop */ }
        try { src.disconnect(); } catch (e) { /* noop */ }
        try { gain.disconnect(); } catch (e) { /* noop */ }
        if (this._loops.get(name)?.source === src) this._loops.delete(name);
      };

      try {
        src.start();
        this._loops.set(name, { source: src, gain, filter });
        return { name, stop };
      } catch (e) {
        return null;
      }
    }

    /**
     * Stop a looping SFX by name.
     * @param {string} name
     */
    stopLoop(name) {
      const loop = this._loops.get(name);
      if (!loop) return;
      try { loop.source.stop(); } catch (e) { /* noop */ }
      try { loop.source.disconnect(); } catch (e) { /* noop */ }
      try { loop.gain.disconnect(); } catch (e) { /* noop */ }
      this._loops.delete(name);
    }

    /**
     * Duck (temporarily lower) background music without affecting SFX.
     * No-ops if bg isn't playing or audio isn't unlocked.
     * @param {{db?:number, attackMs?:number, holdMs?:number, releaseMs?:number}} [opts]
     */
    duck(opts) {
      if (!this.audioUnlocked) return;
      if (!this.ctx || !this._bg.gain) return;
      const gainNode = this._bg.gain;
      const now = this.ctx.currentTime;
      const db = (opts && typeof opts.db === 'number') ? opts.db : -8; // -6..-10dB typical
      const attackMs = (opts && typeof opts.attackMs === 'number') ? opts.attackMs : 60;
      const holdMs = (opts && typeof opts.holdMs === 'number') ? opts.holdMs : 650;
      const releaseMs = (opts && typeof opts.releaseMs === 'number') ? opts.releaseMs : 250;

      const base = Math.max(0.0001, this._musicBase || 0.35);
      const target = base * Math.pow(10, db / 20);

      try {
        gainNode.gain.cancelScheduledValues(now);
        // start from current value to avoid clicks
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(target, now + attackMs / 1000);
        gainNode.gain.setValueAtTime(target, now + (attackMs + holdMs) / 1000);
        gainNode.gain.linearRampToValueAtTime(base, now + (attackMs + holdMs + releaseMs) / 1000);
      } catch (e) {
        /* noop */
      }
    }
  }

  window.AudioManager = AudioManager;
})();


