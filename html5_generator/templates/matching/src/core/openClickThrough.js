import { CONFIG } from '../config.js';

export function openClickThrough() {
  try {
    if (window.mraid) {
      const doOpen = () => {
        window.mraid.open(CONFIG.mraid.clickUrl);
      };

      if (window.mraid.getState && window.mraid.getState() === 'loading') {
        window.mraid.addEventListener('ready', doOpen);
      } else {
        doOpen();
      }
    } else {
      window.open(CONFIG.mraid.fallbackUrl, '_blank');
    }
  } catch (err) {
    console.error('Click-through failed', err);
    window.open(CONFIG.mraid.fallbackUrl, '_blank');
  }
}
