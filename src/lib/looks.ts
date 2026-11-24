import type { Prefs } from './prefs';

/** The app's palettes and accent colors (Settings → Appearance and the first-run look picker). */
export const PALETTES: { id: Prefs['palette']; name: string; desc: string; colors: [string, string, string] }[] = [
  { id: 'ink', name: 'Vault', desc: 'The original: silver on near-black', colors: ['#0a0a0c', '#18181c', '#e8ebf1'] },
  { id: 'oled', name: 'Black', desc: 'True black, for OLED screens', colors: ['#000000', '#101010', '#f2f2f2'] },
  { id: 'midnight', name: 'Midnight', desc: 'Deep blue-black', colors: ['#080b12', '#151b2a', '#e6ecf8'] },
  { id: 'sepia', name: 'Darkroom', desc: 'Warm, like old prints', colors: ['#100d0a', '#1e1914', '#efe6d8'] },
  { id: 'light', name: 'Paper', desc: 'Light, ink on paper', colors: ['#f3f2ef', '#ffffff', '#16171b'] },
];

export const ACCENTS: { id: Prefs['accent']; name: string; color: string }[] = [
  { id: 'silver', name: 'Silver', color: '#c8cdd6' },
  { id: 'gold', name: 'Gold', color: '#e2c27a' },
  { id: 'rose', name: 'Rose', color: '#f0a3b5' },
  { id: 'ember', name: 'Ember', color: '#ff9a6b' },
  { id: 'mint', name: 'Mint', color: '#8fe0bf' },
  { id: 'ice', name: 'Ice', color: '#9cc8ff' },
  { id: 'violet', name: 'Violet', color: '#b9a3ff' },
];
