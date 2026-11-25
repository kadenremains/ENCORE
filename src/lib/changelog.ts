/**
 * Version history, newest first: the app changes everyone sees in Settings → What's new.
 * Behind-the-scenes notes (server, database, security) aren't in this public file: they live in
 * the database (owner_notes) and only an owner's sign-in can load them, in Settings → Owner.
 */
export interface Release {
  version: string;
  date: string; // yyyy-mm-dd
  title: string;
  notes: { text: string }[];
}

export const CHANGELOG: Release[] = [
  {
    version: '3.0',
    date: '2026-11-25',
    title: 'Compare',
    notes: [
      { text: 'Compare your listening with anyone on Last.fm: a match score, the artists, songs and albums you share (with both your play counts), what only they play (try these) and what only you play.' },
      { text: 'Get their full history to compare any date range exactly, see who found each shared artist first, your habits side by side, and how your match changed month by month.' },
      { text: 'Nothing about them is kept for long: what Encore downloads stays on your device and is deleted a day after you last open the comparison.' },
      { text: 'Make a “You vs. them” wrapped straight from a comparison. Only their name is saved with it; opening it loads the comparison fresh (text you rewrite yourself stays).' },
      { text: 'Start from the Overview (“Compare with a friend”, then one tap for people you’ve compared with) or the Compare tab on a computer. Artist, album and song pages show your friends’ plays next to yours.' },
    ],
  },
  {
    version: '2.9.1',
    date: '2026-11-25',
    title: 'Pictures stored once',
    notes: [
      { text: 'Every picture in your wrappeds and custom pictures is stored once on your device, as plain image data, however many wrappeds use it, so they take much less space. They look exactly the same; nothing is compressed.' },
      { text: 'Settings → Data & storage shows where the space goes: pictures, scrobbles, wrappeds and the rest.' },
    ],
  },
  {
    version: '2.9',
    date: '2026-11-25',
    title: 'Packed history',
    notes: [
      { text: 'Your downloaded scrobbles are stored packed: each name once a month, every play as numbers pointing to it. About a tenth of the space, and the app opens faster, most of all with a long history. Nothing about your plays changes.' },
      { text: 'The first time you open this version your history is moved over once, checked play by play first; if anything doesn’t match, it stays as it was and tries again next time.' },
      { text: 'Your stats are worked out 2–4 times faster when the app opens and after changes like merges, and the Clean up scan is quicker too. Same numbers, exactly.' },
      { text: 'The demo saves in about a second instead of half a minute, and its data only downloads if you open it.' },
    ],
  },
  {
    version: '2.8.1',
    date: '2026-11-25',
    title: 'Safer home-screen sign-in',
    notes: [
      { text: 'A sign-in started in the home-screen app only finishes there when you approve it from the same phone. Otherwise Safari asks first, so a sign-in link someone else sends you can’t sign them in as you.' },
    ],
  },
  {
    version: '2.8',
    date: '2026-11-25',
    title: 'History',
    notes: [
      { text: 'Listening is now History. Scrobbles lists every play in your range, newest first, by day (with each day’s plays and listening time): search it, or jump to any date. Patterns has the charts that were on Listening.' },
      { text: 'Every song, album and artist page lists its plays in the range.' },
      { text: 'Plays Encore shows differently from Last.fm say so (“merged”, “fixed”, with the name Last.fm has), and batch-scrobbled ones are marked.' },
      { text: 'Clean up: the one-tap singles merge skips songs you’ve played more as a single than from the album, and those suggest the single instead.' },
    ],
  },
  {
    version: '2.6.4',
    date: '2026-11-24',
    title: 'Clearer way back after signing in',
    notes: [
      { text: 'Signing in from the iPhone home-screen app: once you approve in Safari, Safari now says you’re signed in and to switch back to the app (which finishes by itself), instead of opening a second Encore. “Use Encore here in Safari instead” is there if you want it.' },
    ],
  },
  {
    version: '2.6.3',
    date: '2026-11-24',
    title: 'Last.fm links open in Safari',
    notes: [
      { text: 'In the iPhone home-screen app, Last.fm links (Clean up, your profile) now open in Safari, where you’re logged in, so you can edit scrobbles straight away. The app’s own little browser can’t log in to Last.fm.' },
    ],
  },
  {
    version: '2.6.2',
    date: '2026-11-24',
    title: 'Garbled names, pointed out',
    notes: [
      { text: 'Clean up lists every scrobble that came with codes in its name: what it says on Last.fm, what it should say, when, and a link to fix it there.' },
    ],
  },
  {
    version: '2.6.1',
    date: '2026-11-24',
    title: 'Tidier names',
    notes: [
      { text: 'Names some scrobblers send with codes left in (“Soda \\u0026 Syrup”, “&amp;”) now show as “&” and the like, and count with the right album.' },
      { text: 'Settings → Stats lists batch-scrobbled plays: runs seconds apart, from skipping through songs or an import. Look through the songs in each, and leave them out of your stats if you like (off unless you turn it on).' },
    ],
  },
  {
    version: '2.6',
    date: '2026-11-24',
    title: 'Clean up mismatched scrobbles',
    notes: [
      { text: 'Settings → Clean up finds songs, albums and artists you’ve scrobbled under different names: a song played from its single and its album, a deluxe edition, “feat.” in the title, a different apostrophe or accent, no album at all.' },
      { text: 'Merge them to count them as one in Encore (your Last.fm stays as it is), or open them on Last.fm to fix them there. Every merge can be undone, and merges sync to your other devices.' },
      { text: 'One tap merges every song you also played from its single into its album.' },
      { text: 'Song, album and artist pages say when they’re split across names, with a link to fix it.' },
      { text: 'Fixed: changing album settings in the first moments of the demo could briefly show only part of its history.' },
    ],
  },
  {
    version: '2.5.1',
    date: '2026-11-24',
    title: 'Home-screen sign-in goes through Safari',
    notes: [
      { text: 'On iPhone, signing in from the home-screen app now opens Last.fm in Safari, where you’re usually already logged in, instead of the app’s little browser (where Last.fm’s login fails). Approve there, come back, and the app signs in by itself.' },
      { text: 'If Safari doesn’t open, “Sign in here instead” uses the old way.' },
    ],
  },
  {
    version: '2.5',
    date: '2026-11-24',
    title: 'Sign-in that just works',
    notes: [
      { text: 'Signing in is a plain Last.fm sign-in again, on any device including the home-screen app. No “couldn’t unlock” errors and no extra steps.' },
      { text: 'Synced data is still encrypted on your device before upload. Your key is now kept by the server as a secret outside the database and given to your signed-in devices, so a new device works straight away.' },
      { text: 'If sync can’t start (say you’re offline), it keeps trying instead of signing you out.' },
    ],
  },
  {
    version: '2.4.3',
    date: '2026-11-24',
    title: 'Home-screen sign-in, for real this time',
    notes: [
      { text: 'Fixed: signing in from the iPhone home-screen app could finish in the Last.fm window but leave the app stuck on the start screen. The app now picks the sign-in up when you switch back.' },
    ],
  },
  {
    version: '2.4.2',
    date: '2026-11-24',
    title: 'Signed out means back to the start',
    notes: [
      { text: 'Whenever you’re signed out (by choice, by the server, or after deleting your synced data), you go back to the start screen with a note saying why, until you sign in again or choose to carry on without syncing. Your history stays on the device.' },
      { text: '“Turn off sync on this device” is now simply “Sign out”.' },
    ],
  },
  {
    version: '2.4.1',
    date: '2026-11-24',
    title: 'Sign-in fix for the home-screen app',
    notes: [
      { text: 'Fixed: after being signed out, signing in from the home-screen app didn’t stick. It works again; if a sign-in ever can’t finish, the app now says so.' },
    ],
  },
  {
    version: '2.4',
    date: '2026-11-24',
    title: 'Safety check',
    notes: [
      { text: 'Only Encore’s own code can run in the app now; artist photo searches go through Encore’s server instead of running Deezer’s code.' },
      { text: 'Settings → Account → Delete my synced data removes everything the server holds for your account.' },
      { text: 'A plain-language privacy summary in Settings → About, with the full note on GitHub.' },
      { text: 'Pasted picture links must be real web addresses, and profile links only ever open Last.fm.' },
    ],
  },
  {
    version: '2.3',
    date: '2026-11-24',
    title: 'Lighter sync, same pictures',
    notes: [
      { text: 'Synced pictures take about a quarter less space, and a picture used in several wrappeds is uploaded once. Picture quality is exactly the same.' },
      { text: 'Pictures you’ve already downloaded are remembered by your browser, so syncing a new device is quicker.' },
    ],
  },
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
