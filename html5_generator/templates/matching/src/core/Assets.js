import { Assets as PixiAssets } from 'pixi.js';

export class Assets {
  constructor() {
    this.textures = new Map();
  }

  async load() {
    const entries = [
      { alias: 'bg', src: new URL('../../assets/ChatGPT Image Dec 19, 2025, 02_59_23 PM.png', import.meta.url).href },
      { alias: 'bill5', src: new URL('../../assets/sprite_0000.png', import.meta.url).href },
      { alias: 'bill20', src: new URL('../../assets/sprite_0001.png', import.meta.url).href },
      { alias: 'bill10', src: new URL('../../assets/sprite_0002.png', import.meta.url).href },
      { alias: 'bill50', src: new URL('../../assets/sprite_0003.png', import.meta.url).href },
      { alias: 'progress', src: new URL('../../assets/sprite_0005.png', import.meta.url).href },
      { alias: 'title', src: new URL('../../assets/sprite_0006.png', import.meta.url).href },
      { alias: 'cta', src: new URL('../../assets/sprite_0007.png', import.meta.url).href }
    ];

    await PixiAssets.load(entries);
    entries.forEach((entry) => {
      const texture = PixiAssets.get(entry.alias);
      this.textures.set(entry.alias, texture);
    });
  }

  get(key) {
    return this.textures.get(key);
  }
}
