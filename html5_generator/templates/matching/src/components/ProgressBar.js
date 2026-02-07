import { Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';

export class ProgressBar {
  constructor(width, height, colors) {
    this.container = new Container();
    this.width = width;
    this.height = height;
    this.colors = colors;
    this.bg = new Graphics();
    this.fill = new Graphics();
    this.container.addChild(this.bg, this.fill);
    this.drawBackground();
    this.progress = 0;
    this.setProgress(0, true);
  }

  drawBackground() {
    const r = this.height / 2;
    this.bg.clear();
    this.bg.roundRect(-this.width / 2, -this.height / 2, this.width, this.height, r)
      .fill({ color: 0x1c2f58 });
  }

  setProgress(pct, immediate = false) {
    const clamped = Math.max(0, Math.min(1, pct));
    if (immediate) {
      this.progress = clamped;
      this.renderFill();
      return;
    }

    gsap.to(this, {
      progress: clamped,
      duration: 0.3,
      ease: 'power2.out',
      onUpdate: () => this.renderFill()
    });
  }

  renderFill() {
    const r = this.height / 2;
    this.fill.clear();
    this.fill.roundRect(-this.width / 2, -this.height / 2, this.width * this.progress, this.height, r)
      .fill({ color: this.colors.good });
  }
}
