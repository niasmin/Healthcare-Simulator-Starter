import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './ui/App';

createRoot(document.getElementById('root')!).render(<App />);

// Installable app: a service worker on the deployed site only (not in development, not inside the
// Claude artifact's frame, which serves a single inlined page).
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol === 'https:' && window.self === window.top) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}
