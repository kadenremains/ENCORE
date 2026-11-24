import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/unbounded';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/anton';
import '@fontsource/archivo-black';
import '@fontsource/instrument-serif';
import '@fontsource/dm-serif-display';
import '@fontsource/bebas-neue';
import '@fontsource/cormorant-garamond/300.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/300-italic.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/dm-mono/300.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import './index.css';
import App from './App.tsx';
import { installScrollToTopOnLinks } from './router';
import { applyAppearance, getPrefs, usePrefs } from './lib/prefs';

installScrollToTopOnLinks();

// Settings → Stats → start page (only when opening the app at its front page)
if (!location.hash || location.hash === '#/' || location.hash === '#') {
  const start = getPrefs().startPage;
  if (start !== 'overview') history.replaceState(null, '', `${location.pathname}${location.search}#/${start}`);
}
applyAppearance(getPrefs());
usePrefs.subscribe(applyAppearance);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
