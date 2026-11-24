import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Content Security Policy for the built site (GitHub Pages can't send headers, so it's a <meta>).
 * Only the app's own scripts can run. Pictures and picture downloads may come from any https site
 * (album art, artist photos and links you paste), which is why img/connect allow https:.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // inline style attributes (React)
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https:",
  "font-src 'self' data:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'", // the export library points a scratch document at our own stylesheet
  "form-action 'self'",
  "frame-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

const csp = (): Plugin => ({
  name: 'encore-csp',
  apply: 'build', // the dev server needs inline scripts for hot reload
  transformIndexHtml: (html) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta name="referrer" content="no-referrer" />`),
});

// base './' so the build works on GitHub Pages under /<repo>/
export default defineConfig({
  base: './',
  plugins: [react(), csp()],
});
