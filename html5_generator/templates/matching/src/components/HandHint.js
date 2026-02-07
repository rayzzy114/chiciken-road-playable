import { Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';

export class HandHint extends Container {
  constructor() {
    super();
    this.hand = new Graphics();
    this.addChild(this.hand);
    this.drawHand();
    this.visible = false;
    this.timeline = null;
  }

  drawHand() {
    this.hand.clear();
    this.hand.circle(0, 0, 26).fill({ color: 0xffffff, alpha: 0.9 });
    this.hand.roundRect(18, -30, 18, 60, 8).fill({ color: 0xffffff, alpha: 0.9 });
    this.hand.circle(30, -22, 10).fill({ color: 0xffffff, alpha: 0.9 });
  }

  play(from, to) {
    this.visible = true;
    this.position.set(from.x, from.y);
    this.alpha = 0;
    this.scale.set(0.9);

    if (this.timeline) this.timeline.kill();
    this.timeline = gsap.timeline({ repeat: -1, repeatDelay: 0.4 });
    this.timeline
      .to(this, { alpha: 1, duration: 0.2 })
      .to(this, { x: to.x, y: to.y, duration: 0.8, ease: 'power2.inOut' })
      .to(this.scale, { x: 0.8, y: 0.8, duration: 0.15 }, '-=0.2')
      .to(this.scale, { x: 0.9, y: 0.9, duration: 0.15 })
      .to(this, { alpha: 0, duration: 0.2 });
  }

  stop() {
    if (this.timeline) this.timeline.kill();
    this.visible = false;
  }
}
