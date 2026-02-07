import { Graphics, Text } from 'pixi.js';
import { CONFIG } from '../config.js';
import { SceneContainer } from '../core/SceneContainer.js';

export class PreloaderScene extends SceneContainer {
  constructor(assets, bus) {
    super();
    this.bus = bus;

    this.label = new Text({ text: 'Loading...', style: { fill: 0xffffff, fontSize: 40 } });
    this.label.anchor.set(0.5);
    this.addChild(this.label);

    this.bar = new Graphics();
    this.addChild(this.bar);

    this.bus.on('resize', () => {
      this.label.position.set(CONFIG.design.width / 2, CONFIG.design.height / 2 - 40);
      this.bar.position.set(CONFIG.design.width / 2, CONFIG.design.height / 2 + 40);
      this.drawBar(0.7);
    });
  }

  drawBar(progress) {
    const width = 400;
    const height = 18;
    this.bar.clear();
    this.bar.rect(-width / 2, -height / 2, width, height).fill({ color: 0x1a2f57 });
    this.bar.rect(-width / 2, -height / 2, width * progress, height).fill({ color: 0xffc857 });
  }

  onEnter() {
    this.drawBar(1);
    setTimeout(() => this.bus.emit('scene:switch', 'gameplay'), 300);
  }
}
