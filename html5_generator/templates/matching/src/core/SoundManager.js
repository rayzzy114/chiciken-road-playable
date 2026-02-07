export class SoundManager {
  constructor(config) {
    this.config = config;
    this.ctx = null;
    this.unlocked = false;
    this.music = null;
    this.musicGain = null;
    this.musicEl = null;
  }

  unlock() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.unlocked = true;
    if (this.musicEl) {
      this.musicEl.volume = this.config.audio.music.volume;
      this.musicEl.play().catch(() => {});
    }
  }

  play(name) {
    if (!this.unlocked || !this.ctx) return;
    const settings = this.config.audio.sfx[name];
    if (!settings) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = settings.type || 'sine';
    osc.frequency.value = settings.freq || 440;
    gain.gain.value = 0;
    gain.connect(this.ctx.destination);
    osc.connect(gain);

    const now = this.ctx.currentTime;
    const vol = this.config.audio.volume;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + settings.duration);

    osc.start(now);
    osc.stop(now + settings.duration);
  }

  startMusic() {
    const url = this.config.audio.music.url;
    if (!url || this.musicEl) return;
    this.musicEl = new Audio(url);
    this.musicEl.loop = true;
    this.musicEl.volume = this.unlocked ? this.config.audio.music.volume : 0;
    if (this.unlocked) {
      this.musicEl.play().catch(() => {});
    }
  }
}
