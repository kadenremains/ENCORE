# Privacy

Encore is a personal project. It has no ads, no analytics, no tracking cookies, and nothing is sold or shared.

## On your device

Your downloaded Last.fm history, every stat, your wrappeds, custom pictures and settings live in your browser's storage. Clearing the site's data (or **Settings → Account → Disconnect**) deletes them.

## On Encore's server (Cloudflare)

**If you sign in with Last.fm** (to sync between devices):

- Your Last.fm username, when you first signed in and when you last used Encore, and a sign-in token per device. Devices unused for 6 months are signed out.
- Your synced wrappeds, custom pictures and settings, **encrypted on your device before upload**. The server can't read them. The key that opens them is stored only locked with your Last.fm sign-in, which the server passes to your browser and doesn't keep.
- How much space your synced data takes (it's encrypted; only the size is known).

**If you don't sign in**, requests to Last.fm go through Encore's server so you don't need an API key. They're passed on and not kept, except a list of the Last.fm usernames that were looked up, with the first and last time and a count. Use your own API key (**Settings → Account**) and your requests go straight to Last.fm instead.

**Artwork searches** for artist photos go through Encore's server to Deezer and aren't kept, so Deezer never sees your IP address.

**Logs:** the server writes a short line per sync (username and item counts) and errors. Per-request logs, which would include what's being looked up, are switched off.

**One exception:** the site owner's own account keeps a readable copy of its own key, so the owner can read their own synced data. No other account does this; which accounts are owners is public in `worker/wrangler.toml`.

## Other services

- **Last.fm** provides your listening history and profile ([Last.fm privacy policy](https://www.last.fm/legal/privacy)).
- **Deezer** is asked, through Encore's server, for artist photos.
- **Apple (iTunes Search)** is asked directly by your browser for covers Last.fm doesn't have, so Apple sees the album name and your IP address. (Apple doesn't answer Encore's server.)
- Pictures load from Last.fm, Deezer and Apple's image servers, or from any link you paste.

## Deleting your data

**Settings → Account → Delete my synced data** removes everything the server holds for your account: synced data, pictures, key, devices and username.
