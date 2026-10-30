import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/global.css';
import { App } from './App';
import { APP_NAME } from './appName';
import { startCatalog } from './state/bootstrap';

document.title = APP_NAME;
startCatalog();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// Install as an app and start offline (M33): the service worker is built with the app (vite.config.ts).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
