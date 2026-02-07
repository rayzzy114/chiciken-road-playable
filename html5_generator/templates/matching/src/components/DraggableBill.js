import { Container, Sprite, Rectangle, ColorMatrixFilter } from 'pixi.js';
import { gsap } from 'gsap';

export class DraggableBill extends Container {
  constructor(texture, scale, config) {
    super();
    this.config = config;
    this.sprite = new Sprite(texture);
    this.sprite.anchor.set(0.5);
    this.sprite.scale.set(scale);
    this.addChild(this.sprite);
    const w = this.sprite.texture.width * scale;
    const h = this.sprite.texture.height * scale;
    this.hitArea = new Rectangle(-w / 2, -h / 2, w, h);

    this.home = { x: 0, y: 0 };
    this.dragging = false;
    this.pointerId = null;
    this.onDragStart = null;
    this.highlightFilter = new ColorMatrixFilter();
    this.highlightFilter.brightness(1.1, false);
    this.highlightFilter.saturate(1.2, false);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerdown', this.handleDown, this);
  }

  setHome(x, y) {
    this.home.x = x;
    this.home.y = y;
    this.position.set(x, y);
  }

  handleDown(e) {
    if (this.dragging || !this.eventMode) return;
    this.dragging = true;
    this.pointerId = e.pointerId;
    if (this.onDragStart) this.onDragStart(e);
  }

  returnHome(onComplete) {
    gsap.to(this, {
      x: this.home.x,
      y: this.home.y,
      duration: this.config.interaction.dragReturnDuration,
      ease: 'power2.out',
      onComplete
    });
  }

  endDrag() {
    this.dragging = false;
    this.pointerId = null;
  }

  setHighlight(enabled) {
    this.sprite.filters = enabled ? [this.highlightFilter] : null;
  }
}
