# Security

## Reporting a problem

Please report security issues privately through GitHub's **Report a vulnerability** button on this repository's Security tab, rather than in a public issue.

## How Encore protects data

- **Encrypted sync.** Wrappeds, pictures and settings are encrypted in the browser (AES-256-GCM) with a per-account key before upload. The server stores that key locked with `VAULT_KEY`, a Worker secret kept outside the database, and returns it only to the account's own signed-in sessions. A copy of the database is unreadable on its own. (This is not end-to-end: the server can unlock keys, which is what lets new devices sign in without a recovery code.) Picture names are keyed hashes, so the database doesn't show what was customized.
- **Only the app's own code runs** in the site (Content Security Policy). No third-party scripts, analytics or trackers. Fonts are bundled.
- **No secrets in this repository.** The Last.fm API key and secret live only in the server's database or Worker secrets; the server never returns them.
- **Server:** origin-locked CORS, parameterized SQL everywhere, size limits on every upload, a per-IP rate limit on the Last.fm and artwork relays (read-only methods only), generic error messages, `nosniff` / `no-referrer` / `no-store` headers, sign-in tokens of 256 bits that expire after 6 months unused, and redirects only back to the site itself.
- **Owner tools** (usage stats, reading the owner's own data) require the owner's own sign-in, checked by the server.
- See [PRIVACY.md](PRIVACY.md) for exactly what's stored.
