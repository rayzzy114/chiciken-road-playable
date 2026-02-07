import { Sprite, Text, TextStyle } from 'pixi.js';
import { gsap } from 'gsap';
import { CONFIG } from '../config.js';
import { SceneContainer } from '../core/SceneContainer.js';
import { openClickThrough } from '../core/openClickThrough.js';

export class EndcardScene extends SceneContainer {
  constructor(assets, bus) {
    super();
    this.assets = assets;
    this.bus = bus;
    this.cta = null;

    this.createUI();
    this.bus.on('resize', () => this.onResize());
  }

  createUI() {
    const bg = new Sprite(this.assets.get('bg'));
    bg.anchor.set(0.5);
    bg.position.set(CONFIG.design.width / 2, CONFIG.design.height / 2);
    const scale = Math.max(CONFIG.design.width / bg.texture.width, CONFIG.design.height / bg.texture.height);
    bg.scale.set(scale);
    bg.alpha = 0.8;
    this.addChild(bg);

    const titleStyle = new TextStyle({
      fontFamily: CONFIG.ui.fontFamily,
      fontSize: 72,
      fill: 0xffffff,
      stroke: 0x6c35c9,
      strokeThickness: 10
    });
    this.title = new Text({ text: 'Play & Earn', style: titleStyle });
    this.title.anchor.set(0.5);
    this.addChild(this.title);

    this.cta = new Sprite(this.assets.get('cta'));
    this.cta.anchor.set(0.5);
    this.cta.scale.set(0.7);
    this.cta.eventMode = 'static';
    this.cta.cursor = 'pointer';
    this.cta.on('pointerdown', () => openClickThrough());
    this.addChild(this.cta);
  }

  onEnter() {
    this.onResize();
    gsap.to(this.cta.scale, { x: 0.75, y: 0.75, yoyo: true, repeat: -1, duration: 0.6 });
  }

  onResize() {
    const centerX = CONFIG.design.width / 2;
    const centerY = CONFIG.design.height / 2;
    this.title.position.set(centerX, centerY - 260);
    this.cta.position.set(centerX, centerY + 120);
  }
}
