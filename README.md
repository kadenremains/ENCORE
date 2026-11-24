# Encore

A much prettier, much deeper view of your Last.fm stats, plus fully customizable "wrapped" graphics for **any date range**. Silver-on-ink, archival look.

## Stats

- **Overview:** headline numbers with ▲▼ vs the previous period or the same time last year, top artists/albums/songs with rank movement, listening over time, a day-by-day heatmap, hour and weekday charts, highlights (biggest day, streaks, obsession), discoveries, and your #1 every month.
- **Artists / Albums / Songs:** full ranked charts with search and sorting (most played, climbing, falling, new, newest discoveries), share of plays and first-heard dates.
- **A page for every artist, album and song:** rank and movement, plays in range vs all time, first and last listen, an all-time monthly chart, top songs and albums, favourite hour and day, a day-by-day heatmap, and a custom image.
- **Listening:** timeline by day/week/month/year, hour × weekday punchcard, a heatmap per year, biggest days, month by month, streaks and longest silence.
- **Records (all time):** biggest day/week/month/year, streaks, scrobble milestones, year-by-year table, eras.

The date range and comparison mode are shared across every page and remembered. A period that's still going (this year, this month) is compared with the same stretch of the earlier one, e.g. Jan 1 – today vs Jan 1 – this day last year.

- **Skip breaks:** leave long stretches with no scrobbles (2 weeks to 3 months) out of per-day averages, day counts and charts.
- **Singles:** albums you've only played one song from are treated as singles and left out of album stats. Last.fm's track list decides first; if Last.fm doesn't know the album, your scrobbles do. Play a second song and it's an album again. Change it or keep specific ones at the bottom of the Albums page.
- **Album artists:** albums are credited the way Last.fm groups them (compilations, albums whose songs are by a featured artist).
- **Last.fm edits:** scrobbles you edit or delete on Last.fm (Pro) are picked up: the last two weeks on every sync, older months a few at a time in the background, or all at once from the menu.

## Settings

Open from the profile menu (top right). Tabs:

- **Account & sync:** your Last.fm profile, sign in to sync devices, use your own API key, disconnect.
- **Stats:** skip breaks, what changes are compared against, 12/24-hour clock, minutes per scrobble, the page the app opens on, chart length, milestone interval, automatic checks for Last.fm edits.
- **Albums & singles:** the singles switch with every single listed (and the ones you kept as albums), refresh Last.fm's album grouping, re-check singles.
- **Images:** online picture lookups on/off, pictures in lists, "My picture", and every custom picture.
- **Appearance:** palettes (Ink, Black, Midnight, Darkroom, Paper), seven accent colors, text size, film grain, animations.
- **Data & storage:** what's stored on the device, backup to a file and restore, re-download your history, clear caches.
- **About:** version and update check, data sources, wrapped editor shortcuts.

Settings sync between devices when you're signed in.

## Create

- **Any time range:** your whole scrobble history is downloaded once into your browser (IndexedDB), so every stat is computed locally and instantly for any range: a week, a summer, a custom span, or a year compared with the year before.
- **Block editor:** drag and resize blocks on a real 1080×1920 (or 4:5, 1:1, 16:9, custom) canvas with snapping guides, undo/redo, layers and multiple slides.
  - **Top list:** artists / albums / songs, any length, start at any rank, "only new discoveries". Layouts: list, ledger, grid, collage, podium, hero, bars.
  - **Leaderboard:** ▲▼ rank movement vs the previous period or any custom range.
  - **Big stat:** scrobbles, minutes, unique counts, streaks, busiest day, obsession, peak hour, % from your #1… with editable labels.
  - **Image:** your #N artist/album/song, or an upload, with crop, zoom and filters.
  - **Chart:** listening over time, 24h clock, hour of day, weekdays. Plus **#1 by month**, text with live tokens (`{range}`, `{topArtist}`, …) and shapes.
  - Every block can have its **own time range**, title, colors, font, box style.
- **Themes:** Vault, Vault Light, Midnight, Acid, Sunset, Paper, Mono, Ocean, Bubblegum, Ember, Editorial. Edit any color or font, add frames, grain and sharp corners.
- **Background pictures:** your #1 album or artist, your Last.fm profile picture, "My picture" (one upload saved to your account and reused everywhere), or an upload for one wrapped. Drag to frame it and zoom, with blur and opacity. Backgrounds can be set per slide.
- **Images:** artist photos come from Deezer and cover art from Last.fm or Apple Music. Upload your own for anything, with crop and zoom; it's reused everywhere.
- **Export:** PNG at 1×/2×/3×, one slide or all of them. On iPhone it opens the share sheet (save to Photos / post to Instagram).

## Using it

Open https://kadenremains.github.io/ENCORE/ and **Sign in with Last.fm** (syncs your wrappeds, pictures and settings between devices), or just type a username. No API key needed: the backend relays Last.fm requests. You can still use your own key, or try the demo data first.

Your scrobble history is downloaded once into your browser and every stat is computed on your device. On iPhone, Share → Add to Home Screen makes it an app.

## Backend (optional sync)

`worker/` is a Cloudflare Worker + D1 database at `https://encore-api.kadenremains.workers.dev`:

- **Sign in with Last.fm.** No passwords; your Last.fm account is your login.
- **Sync** of wrappeds, custom images and settings across devices (last-write-wins, deletions included). Items bigger than a database row are stored in pieces.
- **Last.fm relay.** Visitors don't need their own API key, and the key never ships in the site's code.

The Last.fm key/secret live in the database (set through a one-time `/setup` link) or as Worker secrets `LASTFM_API_KEY` / `LASTFM_SECRET`. Deploy with `cd worker && npx wrangler deploy`. The tables are in `worker/schema.sql`.

## Development

```bash
npm install
npm run dev
```

Pushing to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`. In the repo's settings, set **Settings → Pages → Source** to **GitHub Actions**.
