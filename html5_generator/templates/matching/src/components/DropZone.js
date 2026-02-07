import { Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';

export class DropZone extends Container {
  constructor(data, colors, origin) {
    super();
    this.data = data;
    this.colors = colors;
    this.origin = origin;
    const padding = data.hitPadding ?? 0;
    this.hitAreaRect = {
      x: data.x + origin.x - data.width / 2 - padding,
      y: data.y + origin.y - data.height / 2 - padding,
      width: data.width + padding * 2,
      height: data.height + padding * 2
    };

    this.highlight = new Graphics();
    this.highlight.alpha = 0;
    this.addChild(this.highlight);
    this.drawHighlight(colors.good);
    this.position.set(data.x + origin.x, data.y + origin.y);
  }

  drawHighlight(color) {
    this.highlight.clear();
    this.highlight.circle(0, 0, 10).fill({ color, alpha: 0.95 });
  }

  flash(color) {
    this.drawHighlight(color);
    gsap.killTweensOf(this.highlight);
    this.highlight.alpha = 0;
    gsap.to(this.highlight, {
      alpha: 1,
      duration: 0.12,
      yoyo: true,
      repeat: 2,
      ease: 'power2.out'
    });
  }

  containsPoint(point) {
    const rect = this.hitAreaRect;
    return point.x >= rect.x && point.x <= rect.x + rect.width &&
      point.y >= rect.y && point.y <= rect.y + rect.height;
  }
}
