import { Text } from 'pixi.js';
import { CONFIG } from '../config.js';
import { SceneContainer } from '../core/SceneContainer.js';

export class BootScene extends SceneContainer {
  constructor(assets, bus) {
    super();
    this.bus = bus;
    this.label = new Text({ text: 'Booting...', style: { fill: 0xffffff, fontSize: 36 } });
    this.label.anchor.set(0.5);
    this.addChild(this.label);

    this.bus.on('resize', () => {
      this.label.position.set(CONFIG.design.width / 2, CONFIG.design.height / 2);
    });
  }

  onEnter() {
    setTimeout(() => this.bus.emit('scene:switch', 'preloader'), 200);
  }
}
