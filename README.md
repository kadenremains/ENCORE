# Encore

Fully customizable Last.fm "wrapped" graphics for **any date range**. Silver-on-ink, archival look by default.

- **Any time range:** your whole scrobble history is downloaded once into your browser (IndexedDB), so every stat is computed locally and instantly for any range: a week, a summer, a custom span, or a year compared with the year before.
- **Block editor:** drag and resize blocks on a real 1080×1920 (or 4:5, 1:1, 16:9, custom) canvas with snapping guides, undo/redo, layers and multiple slides.
  - **Top list:** artists / albums / songs, any length, start at any rank, "only new discoveries". Layouts: list, ledger, grid, collage, podium, hero, bars.
  - **Leaderboard:** ▲▼ rank movement vs the previous period or any custom range.
  - **Big stat:** scrobbles, minutes, unique counts, streaks, busiest day, obsession, peak hour, % from your #1… with editable labels.
  - **Image:** your #N artist/album/song, or an upload, with crop, zoom and filters.
  - **Chart:** listening over time, 24h clock, hour of day, weekdays. Plus **#1 by month**, text with live tokens (`{range}`, `{topArtist}`, …) and shapes.
  - Every block can have its **own time range**, title, colors, font, box style.
- **Themes:** Vault, Vault Light, Midnight, Acid, Sunset, Paper, Mono, Ocean, Bubblegum, Ember, Editorial. Edit any color or font, add frames, grain, sharp corners, or a blurred #1-album background. Backgrounds can be set per slide.
- **Images:** artist photos come from Deezer and cover art from Last.fm or Apple Music. Upload your own for anything, with crop and zoom; it's reused everywhere.
- **Export:** PNG at 1×/2×/3×, one slide or all of them. On iPhone it opens the share sheet (save to Photos / post to Instagram).

## Setup

1. Get a free Last.fm API key at https://www.last.fm/api/account/create (any app name, no callback).
2. Open the app, enter your username + key. Or try the demo data first.

Your history, images and designs stay in your browser.

## Development

```bash
npm install
npm run dev
```

Pushing to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`. In the repo's settings, set **Settings → Pages → Source** to **GitHub Actions**.
