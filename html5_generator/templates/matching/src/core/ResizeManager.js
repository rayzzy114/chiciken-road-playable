import { Rectangle } from 'pixi.js';

export class ResizeManager {
  constructor(app, container, design) {
    this.app = app;
    this.container = container;
    this.design = design;
    this.callbacks = new Set();
  }

  onResize(fn) {
    this.callbacks.add(fn);
  }

  resize() {
    const screenW = this.app.renderer.screen.width;
    const screenH = this.app.renderer.screen.height;
    const scale = Math.min(screenW / this.design.width, screenH / this.design.height);

    this.container.scale.set(scale);
    this.container.x = (screenW - this.design.width * scale) / 2;
    this.container.y = (screenH - this.design.height * scale) / 2;
    this.app.stage.hitArea = new Rectangle(0, 0, screenW, screenH);

    const vpw = (screenW / scale) / 100;
    const vph = (screenH / scale) / 100;

    const data = { screenW, screenH, scale, vpw, vph };
    this.callbacks.forEach((fn) => fn(data));
  }
}
