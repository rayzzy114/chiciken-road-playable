import { Container, Sprite, Text, TextStyle, Rectangle, BlurFilter, Graphics, ColorMatrixFilter } from 'pixi.js';
import { gsap } from 'gsap';
import { CONFIG } from '../config.js';
import { SceneContainer } from '../core/SceneContainer.js';
import { openClickThrough } from '../core/openClickThrough.js';
import { DropZone } from '../components/DropZone.js';
import { DraggableBill } from '../components/DraggableBill.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { HandHint } from '../components/HandHint.js';

export class GameplayScene extends SceneContainer {
  constructor(assets, bus, state, idleSystem, sound) {
    super();
    this.assets = assets;
    this.bus = bus;
    this.state = state;
    this.idleSystem = idleSystem;
    this.sound = sound;
    this.zones = new Map();
    this.activeBill = null;
    this.billQueue = CONFIG.bills.queue.slice();
    this.billStack = new Container();
    this.floatingPool = [];
    this.cta = null;
    this.ctaGlow = null;
    this.handHint = new HandHint();
    this.dragData = null;
    this.winOverlay = new Graphics();
    this.isWon = false;

    this.eventMode = 'dynamic';
    this.hitArea = new Rectangle(0, 0, CONFIG.design.width, CONFIG.design.height);
    this.on('pointerdown', () => {
      this.bus.emit('pointer:activity');
      this.sound.unlock();
    });
    this.bus.on('pointer:any', () => this.handleGlobalPointer());
    this.on('pointermove', (e) => this.handlePointerMove(e));
    this.on('pointerup', (e) => this.handlePointerUp(e));
    this.on('pointerupoutside', (e) => this.handlePointerUp(e));

    this.init();
  }

  init() {
    this.createBackground();
    this.createUI();
    this.createZones();
    this.createBillStack();
    this.createWinOverlay();
    this.addChild(this.handHint);

    this.bus.on('resize', (data) => this.onResize(data));
    this.bus.on('balance:changed', (balance) => this.updateBalance(balance));
    this.bus.on('progress:changed', (pct) => this.progressBar.setProgress(pct));
    this.bus.on('drop:invalid', (data) => this.flashZones(data));
    this.bus.on('game:won', () => this.showCTA());
    this.bus.on('idle', () => this.showHint());
  }

  createBackground() {
    const bg = new Sprite(this.assets.get('bg'));
    bg.anchor.set(0.5);
    bg.position.set(CONFIG.design.width / 2, CONFIG.design.height / 2);
    const scale = Math.max(CONFIG.design.width / bg.texture.width, CONFIG.design.height / bg.texture.height);
    bg.scale.set(scale);
    this.addChild(bg);
  }

  createUI() {
    const money = (value, digits = 2) => `${CONFIG.game.currency}${value.toFixed(digits)}`;

    this.titleGlow = new Sprite(this.assets.get('title'));
    this.titleGlow.anchor.set(0.5);
    this.titleGlow.scale.set(0.9);
    this.titleGlow.alpha = 0.35;
    this.titleGlow.filters = [new BlurFilter(10)];
    this.addChild(this.titleGlow);

    this.title = new Sprite(this.assets.get('title'));
    this.title.anchor.set(0.5);
    this.title.scale.set(0.85);
    this.addChild(this.title);
    gsap.to(this.titleGlow, { alpha: 0.55, duration: 1.2, yoyo: true, repeat: -1, ease: 'sine.inOut' });

    const balanceStyle = new TextStyle({
      fontFamily: CONFIG.ui.fontFamily,
      fontSize: 46,
      fill: 0xffffff,
      stroke: 0x1c2f58,
      strokeThickness: 6
    });
    this.balanceText = new Text({ text: `Balance: ${money(0, 2)}`, style: balanceStyle });
    this.balanceText.anchor.set(0.5);
    this.addChild(this.balanceText);

    const progressStyle = new TextStyle({
      fontFamily: CONFIG.ui.fontFamily,
      fontSize: 40,
      fill: CONFIG.colors.accent,
      stroke: 0x1c2f58,
      strokeThickness: 6
    });
    this.progressText = new Text({
      text: `${money(0, 0)} / ${CONFIG.game.currency}${CONFIG.game.targetBalance}`,
      style: progressStyle
    });
    this.progressText.anchor.set(0.5);
    this.addChild(this.progressText);

    this.progressBar = new ProgressBar(620, 26, CONFIG.colors);
    this.addChild(this.progressBar.container);
  }

  createZones() {
    const origin = { x: CONFIG.design.width / 2, y: CONFIG.design.height / 2 };
    CONFIG.slots.forEach((slot) => {
      const zone = new DropZone({
        ...slot,
        hitPadding: CONFIG.slotHitPadding,
        highlightInset: CONFIG.slotHighlightInset
      }, CONFIG.colors, origin);
      this.zones.set(slot.id, zone);
      this.addChild(zone);
    });
  }

  createBillStack() {
    this.billStack.position.set(CONFIG.layout.stackX + CONFIG.design.width / 2, CONFIG.layout.stackY + CONFIG.design.height / 2);
    this.addChild(this.billStack);
    this.spawnNextBill();
  }

  createWinOverlay() {
    this.winOverlay.alpha = 0;
    this.winOverlay.eventMode = 'none';
    this.addChild(this.winOverlay);
  }

  spawnConfettiBurst(count = 22) {
    const originX = CONFIG.design.width / 2;
    const originY = CONFIG.design.height / 2 - 200;
    for (let i = 0; i < count; i += 1) {
      const piece = new Graphics();
      const size = 10 + Math.random() * 10;
      const color = i % 2 === 0 ? CONFIG.colors.accent : CONFIG.colors.good;
      piece.rect(-size / 2, -size / 2, size, size).fill({ color });
      piece.position.set(originX + (Math.random() * 200 - 100), originY + (Math.random() * 80 - 40));
      piece.rotation = Math.random() * Math.PI;
      this.addChild(piece);

      gsap.to(piece, {
        x: piece.x + (Math.random() * 500 - 250),
        y: piece.y + 600 + Math.random() * 200,
        rotation: piece.rotation + (Math.random() * 2 - 1) * Math.PI,
        duration: 1.4 + Math.random() * 0.6,
        ease: 'power2.out',
        onComplete: () => this.removeChild(piece)
      });
      gsap.to(piece, { alpha: 0, duration: 1.2, ease: 'sine.in' });
    }
  }

  spawnNextBill() {
    if (this.activeBill || this.billQueue.length === 0) return;
    const value = this.billQueue.shift();
    const billData = CONFIG.bills.types[value];
    const texture = this.assets.get(billData.texture);
    const bill = new DraggableBill(texture, billData.scale, CONFIG);
    bill.billData = billData;
    bill.setHome(this.billStack.x, this.billStack.y);
    bill.onDragStart = (e) => this.handleDragStart(bill, e);

    this.addChild(bill);
    this.activeBill = bill;
    bill.idleTween = gsap.to(bill, { y: bill.y - 8, duration: 1.1, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  }

  bringBillToFront(bill) {
    this.removeChild(bill);
    this.addChild(bill);
  }

  handleDragStart(bill, e) {
    this.sound.unlock();
    this.sound.play('pick');
    this.sound.startMusic();
    this.bus.emit('pointer:activity');
    this.handHint.stop();
    gsap.killTweensOf(bill);
    gsap.killTweensOf(bill.scale);
    if (bill.idleTween) {
      bill.idleTween.kill();
      bill.idleTween = null;
    }
    bill.setHighlight(true);
    const pos = e.getLocalPosition(this);
    this.dragData = {
      bill,
      pointerId: e.pointerId,
      offsetX: pos.x - bill.x,
      offsetY: pos.y - bill.y
    };
    this.bringBillToFront(bill);
  }

  handlePointerMove(e) {
    if (!this.dragData || e.pointerId !== this.dragData.pointerId) return;
    const pos = e.getLocalPosition(this);
    this.dragData.bill.position.set(pos.x - this.dragData.offsetX, pos.y - this.dragData.offsetY);
  }

  handlePointerUp(e) {
    if (!this.dragData || e.pointerId !== this.dragData.pointerId) return;
    const bill = this.dragData.bill;
    this.dragData = null;
    bill.endDrag();
    bill.setHighlight(false);
    this.handleDrop(bill, { x: bill.x, y: bill.y });
  }

  handleDrop(bill, pos) {
    const zone = this.getZoneAt(pos);
    if (!zone) {
      bill.eventMode = 'none';
      bill.returnHome(() => {
        bill.eventMode = 'static';
      });
      return;
    }

    if (zone.data.id !== bill.billData.zoneId) {
      this.state.placeBill(bill.billData, zone.data.id);
      bill.eventMode = 'none';
      gsap.fromTo(bill, { rotation: 0 }, { rotation: 0.1, yoyo: true, repeat: 3, duration: 0.06, ease: 'sine.inOut' });
      bill.returnHome(() => {
        bill.rotation = 0;
        bill.eventMode = 'static';
      });
      return;
    }

    bill.eventMode = 'none';
    gsap.to(bill.scale, { x: 1.05, y: 1.05, duration: 0.1, yoyo: true, repeat: 1 });
    gsap.to(bill, {
      x: zone.position.x + (zone.data.snapOffsetX || 0),
      y: zone.position.y + (zone.data.snapOffsetY || 0),
      duration: CONFIG.interaction.snapDuration,
      ease: 'power2.out',
      onComplete: () => {
        this.state.placeBill(bill.billData, zone.data.id);
        this.spawnRewardText(bill.x, bill.y);
        this.spawnConfettiBurst(10);
        this.sound.play('drop');
        gsap.fromTo(bill.scale, { x: 1.1, y: 1.1 }, { x: 1, y: 1, duration: 0.25, ease: 'back.out(2)' });
        gsap.fromTo(zone.scale, { x: 1.02, y: 1.02 }, { x: 1, y: 1, duration: 0.2, ease: 'power2.out' });
        this.activeBill = null;
        this.spawnNextBill();
      }
    });
  }

  getZoneAt(point) {
    for (const zone of this.zones.values()) {
      if (zone.containsPoint(point)) {
        return zone;
      }
    }
    return null;
  }

  spawnRewardText(x, y) {
    const reward = CONFIG.game.rewards[Math.max(0, this.state.stepIndex - 1)] || 2;
    const text = this.getFloatingText();
    text.text = `+${CONFIG.game.currency}${reward}`;
    text.alpha = 1;
    text.position.set(x, y - 40);
    text.visible = true;
    gsap.to(text, {
      y: y - 130,
      alpha: 0,
      duration: 0.9,
      ease: 'power2.out',
      onComplete: () => {
        text.visible = false;
      }
    });
    this.spawnBurst(x, y - 20);
  }

  spawnBurst(x, y) {
    const ring = new Graphics();
    ring.circle(0, 0, 14).stroke({ width: 4, color: CONFIG.colors.accent });
    ring.position.set(x, y);
    this.addChild(ring);
    gsap.to(ring, {
      alpha: 0,
      duration: 0.4,
      ease: 'power2.out',
      onComplete: () => this.removeChild(ring)
    });
    gsap.to(ring.scale, { x: 1.6, y: 1.6, duration: 0.4, ease: 'power2.out' });
  }

  getFloatingText() {
    const existing = this.floatingPool.find((t) => !t.visible);
    if (existing) return existing;
    const style = new TextStyle({
      fontFamily: CONFIG.ui.fontFamily,
      fontSize: 44,
      fill: 0xffffff,
      stroke: 0x1c2f58,
      strokeThickness: 6
    });
    const text = new Text({ text: '', style });
    text.anchor.set(0.5);
    text.visible = false;
    this.floatingPool.push(text);
    this.addChild(text);
    return text;
  }

  flashZones({ wrongZoneId, correctZoneId }) {
    const wrong = this.zones.get(wrongZoneId);
    const correct = this.zones.get(correctZoneId);
    if (wrong) wrong.flash(CONFIG.colors.bad);
    if (correct) correct.flash(CONFIG.colors.good);
    this.sound.play('wrong');
  }

  updateBalance(balance) {
    this.balanceText.text = `Balance: ${CONFIG.game.currency}${balance.toFixed(2)}`;
    this.progressText.text = `${CONFIG.game.currency}${balance.toFixed(0)} / ${CONFIG.game.currency}${CONFIG.game.targetBalance}`;
    gsap.fromTo(this.balanceText.scale, { x: 1.05, y: 1.05 }, { x: 1, y: 1, duration: 0.2, ease: 'power2.out' });
    gsap.fromTo(this.progressText.scale, { x: 1.05, y: 1.05 }, { x: 1, y: 1, duration: 0.2, ease: 'power2.out' });
  }

  showCTA() {
    if (this.cta) return;
    this.isWon = true;
    if (this.activeBill) {
      this.removeChild(this.activeBill);
      this.activeBill = null;
    }
    this.winOverlay.alpha = 0;
    this.addChild(this.winOverlay);
    gsap.to(this.winOverlay, { alpha: 1, duration: 0.3, ease: 'power2.out' });
    this.cta = new Sprite(this.assets.get('cta'));
    this.cta.anchor.set(0.5);
    this.cta.position.set(CONFIG.design.width / 2, CONFIG.design.height / 2 + 520);
    this.cta.scale.set(0.65);
    this.cta.alpha = 0;
    this.cta.eventMode = 'static';
    this.cta.cursor = 'pointer';
    this.cta.on('pointerdown', () => openClickThrough());
    this.ctaGlow = new Sprite(this.assets.get('cta'));
    this.ctaGlow.anchor.set(0.5);
    this.ctaGlow.position.copyFrom(this.cta.position);
    this.ctaGlow.scale.set(0.72);
    const glowFilter = new ColorMatrixFilter();
    glowFilter.brightness(1.2, false);
    glowFilter.saturate(1.4, false);
    this.ctaGlow.filters = [new BlurFilter(12), glowFilter];
    this.ctaGlow.alpha = 0.7;
    this.addChild(this.ctaGlow);
    this.addChild(this.cta);

    gsap.to(this.cta, { alpha: 1, duration: 0.3, ease: 'power2.out' });
    gsap.to(this.cta.scale, { x: 0.7, y: 0.7, yoyo: true, repeat: -1, duration: 0.6 });
    gsap.to(this.ctaGlow, { alpha: 0.95, duration: 0.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    setTimeout(() => this.bus.emit('scene:switch', 'endcard'), 2500);
    this.sound.play('win');
    this.spawnConfettiBurst(36);
  }

  showHint() {
    if (!this.activeBill) return;
    const targetZone = this.zones.get(this.activeBill.billData.zoneId);
    if (!targetZone) return;
    const from = { x: this.billStack.x + 40, y: this.billStack.y - 20 };
    const to = {
      x: targetZone.position.x + 20,
      y: targetZone.position.y + 40
    };
    this.handHint.play(from, to);
  }

  onResize(data) {
    const centerX = CONFIG.design.width / 2;
    const centerY = CONFIG.design.height / 2;
    this.titleGlow.position.set(centerX, centerY + CONFIG.layout.titleY);
    this.title.position.set(centerX, centerY + CONFIG.layout.titleY);
    this.balanceText.position.set(centerX - 200, centerY + CONFIG.layout.balanceY);
    this.progressText.position.set(centerX + 250, centerY + CONFIG.layout.balanceY);
    this.progressBar.container.position.set(centerX, centerY + CONFIG.layout.progressY);
    if (this.cta) {
      this.cta.position.set(centerX, centerY + 520);
    }
    if (this.ctaGlow) {
      this.ctaGlow.position.set(centerX, centerY + 520);
    }
    if (data) {
      const width = data.vpw * 100;
      const height = data.vph * 100;
      const left = (CONFIG.design.width - width) / 2;
      const top = (CONFIG.design.height - height) / 2;
      this.winOverlay.clear();
      this.winOverlay.rect(left, top, width, height).fill({ color: 0x000000, alpha: 0.45 });
    }
  }

  onEnter() {
    this.state.reset();
    this.bus.emit('pointer:activity');
    this.sound.startMusic();
    this.isWon = false;
  }

  onExit() {
    this.handHint.stop();
  }

  handleGlobalPointer() {
    if (this.isWon) {
      openClickThrough();
    }
  }
}
