import { App } from './core/App.js';

const app = new App();
app.init().catch((err) => {
  console.error('Failed to init app:', err);
});
