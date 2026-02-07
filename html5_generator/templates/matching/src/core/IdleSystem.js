export class IdleSystem {
  constructor(bus) {
    this.bus = bus;
    this.timer = null;
    this.timeoutMs = 3000;

    this.bus.on('pointer:activity', () => this.reset());
  }

  start(timeoutMs) {
    this.timeoutMs = timeoutMs;
    this.reset();
  }

  reset() {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.bus.emit('idle');
    }, this.timeoutMs);
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
