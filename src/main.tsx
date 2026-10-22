import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './ui/App';

import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { reloadForNewVersion } from './ui/lazy';

// A build file from before the latest deploy is gone: reload once to get the new version.
window.addEventListener('vite:preloadError', (e) => {
  if (reloadForNewVersion()) e.preventDefault();
});

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

// Installable app: a service worker on the deployed site only (not in development, not inside the
// Claude artifact's frame, which serves a single inlined page).
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol === 'https:' && window.self === window.top) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}
