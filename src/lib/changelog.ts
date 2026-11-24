/**
 * Version history, newest first. Notes marked `owner` are behind-the-scenes (server, database,
 * security): only owners see those, in Settings → Owner. Everyone else sees the rest in
 * Settings → What's new.
 */
export interface Release {
  version: string;
  date: string; // yyyy-mm-dd
  title: string;
  notes: { text: string; owner?: boolean }[];
}

export const CHANGELOG: Release[] = [
  {
    version: '2.2',
    date: '2026-11-24',
    title: 'Pick your look, and a much bigger demo',
    notes: [
      { text: 'First time you open Encore, you pick your palette, accent and text size before anything else. Signed-in accounts only ever see it once.' },
      { text: 'The demo now covers 2012 to today: about 150,000 plays across 140 artists and 200 albums, all real releases played only after they came out.' },
      { text: 'The demo opens in seconds and saves itself in the background.' },
      { text: 'What’s new: this page.' },
    ],
  },
  {
    version: '2.1',
    date: '2026-11-24',
    title: 'Private sync',
    notes: [
      { text: 'Your synced wrappeds, pictures and settings are encrypted on your device before they’re uploaded. Only your devices can read them; signing in with Last.fm unlocks them on a new one.' },
      { text: 'Everyone was signed out once so private sync could switch on. Signing in again sets it up.' },
      { text: 'Charts and long lists are smoother: pictures only redraw when their own image arrives.' },
      { text: 'The editor, Create and Settings load the first time you open them, so the app starts lighter.' },
      { text: 'Fixed: a sync and a Last.fm edit check at the same moment could store some plays twice.' },
      { text: 'Fixed: settings restored from a backup didn’t reach your other devices.' },
      { text: 'Data key stored only locked with the Last.fm session key (never stored or logged); picture names HMAC-hashed; readable uploads refused once an account is private.', owner: true },
      { text: 'Owner accounts (OWNERS) keep an escrowed key so the owner can read their own data (scripts/owner-data.mjs).', owner: true },
      { text: 'Owner stats: Settings → Owner and the account_stats view (last used, size, wrappeds, pictures, devices, private), plus usernames looked up without signing in.', owner: true },
      { text: 'Hardening: relay rate limit per IP and only read methods; generic error messages; sessions expire after 6 months idle; per-request logs off.', owner: true },
      { text: 'All 11 existing sessions deleted to force the switch to private sync.', owner: true },
    ],
  },
  {
    version: '2.0',
    date: '2026-11-24',
    title: 'Settings',
    notes: [
      { text: 'A real Settings page: account & sync, stats, albums & singles, images, appearance, data & storage, about.' },
      { text: 'Five palettes (Vault, Black, Midnight, Darkroom, Paper) and seven accent colors, plus text size, film grain and animations.' },
      { text: '12- or 24-hour clock, minutes per scrobble, the page the app opens on, chart length, milestone interval.' },
      { text: 'Skip breaks moved into Settings → Stats, with the list of breaks being skipped.' },
      { text: 'Every single you’ve hidden or kept, in one searchable list.' },
      { text: 'Back up your wrappeds, pictures and settings to a file, and restore them.' },
      { text: 'Your Last.fm picture behind the Overview card (or your #1 artist, #1 album, your own picture, or none).' },
      { text: 'Use your own Last.fm API key, checked before it’s saved.' },
    ],
  },
  {
    version: '1.7',
    date: '2026-11-24',
    title: 'Deeper pages',
    notes: [
      { text: 'Artist and album pages list every song and album, with search, not just the top 15.' },
      { text: 'Pick any single month as your range.' },
      { text: 'The all-time chart on artist pages goes week by week for day-based ranges, lined up on your range’s first day.' },
      { text: 'Fixed: the phone header could scroll sideways when the sync status was long.' },
    ],
  },
  {
    version: '1.6',
    date: '2026-11-23',
    title: 'A proper iPhone app',
    notes: [
      { text: 'Home-screen icon for iPhone and Android.' },
      { text: 'The editor, pop-ups and sign-in stay clear of the notch.' },
      { text: 'Exports on iPhone no longer drop big pictures, and previews fit the screen.' },
      { text: 'The home-screen app picks up new versions by itself.' },
    ],
  },
  {
    version: '1.5',
    date: '2026-11-23',
    title: 'Quality pass',
    notes: [
      { text: '“This year vs last year” compares the same stretch of each year, so an unfinished year doesn’t always look down.' },
      { text: 'Undo now syncs to your other devices.' },
      { text: 'Custom album pictures show on that album’s songs, even when the album artist is different.' },
      { text: 'Edits made just before leaving the app are saved straight away.' },
      { text: 'Accounts with no scrobbles get a proper message instead of an endless download.' },
      { text: 'Sync revisions assigned in commit order, so a slow upload can’t be skipped by another device.', owner: true },
    ],
  },
  {
    version: '1.4',
    date: '2026-11-23',
    title: 'Backgrounds',
    notes: [
      { text: 'Use your Last.fm profile picture or your own uploaded picture as a wrapped background; your picture is shared by every wrapped.' },
      { text: 'Drag background pictures to frame them, and zoom in.' },
    ],
  },
  {
    version: '1.3',
    date: '2026-11-23',
    title: 'Singles, Last.fm edits and breaks',
    notes: [
      { text: 'Releases with only one song count as singles, not albums (Last.fm decides first; a second song makes it an album again).' },
      { text: 'Scrobbles you edit or delete on Last.fm (Pro) are picked up.' },
      { text: 'Skip breaks: leave long stretches without music out of averages and charts.' },
    ],
  },
  {
    version: '1.2',
    date: '2026-11-22',
    title: 'Albums done right',
    notes: [
      { text: 'Albums are credited to their album artist, the way Last.fm groups them.' },
      { text: 'Years are their own choice in the range picker, and nothing before your first scrobble shows up.' },
      { text: 'Tapping a link starts the new page at the top.' },
      { text: 'Fixed: exports showing the same picture for different custom image links.' },
    ],
  },
  {
    version: '1.1',
    date: '2026-11-22',
    title: 'Sign in and sync',
    notes: [
      { text: 'Sign in with Last.fm to keep your wrappeds, pictures and settings on all your devices.' },
      { text: 'No Last.fm API key needed any more.' },
      { text: 'Each wrapped shows whether it’s synced.' },
      { text: 'Cloudflare Worker + D1: sign-in, sync with last-write-wins and tombstones, Last.fm relay; big items stored in pieces.', owner: true },
    ],
  },
  {
    version: '1.0',
    date: '2026-11-22',
    title: 'Encore',
    notes: [
      { text: 'Your Last.fm stats for any date range: overview, artists, albums, songs, listening habits and all-time records, compared with the period before.' },
      { text: 'A page for every artist, album and song.' },
      { text: 'Wrapped editor: templates, blocks you can drag and resize, themes, any time range, and PNG export.' },
      { text: 'Milestones you can set yourself.' },
    ],
  },
];

export const APP_VERSION = CHANGELOG[0].version;
