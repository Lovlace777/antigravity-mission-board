import '@fontsource-variable/plus-jakarta-sans';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

// Pause CSS animations automatically whenever document is hidden to keep idle GPU at 0%
if (typeof document !== 'undefined') {
  const syncVisibilityPause = () => {
    document.documentElement.classList.toggle('agmb-paused', document.hidden);
  };
  syncVisibilityPause();
  document.addEventListener('visibilitychange', syncVisibilityPause);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
