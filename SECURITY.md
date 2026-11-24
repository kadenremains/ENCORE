# Security

## Reporting a problem

Please report security issues privately through GitHub's **Report a vulnerability** button on this repository's Security tab, rather than in a public issue.

## How Encore protects data

- **End-to-end encrypted sync.** Wrappeds, pictures and settings are encrypted in the browser (AES-256-GCM) with a per-account key before upload. The server stores that key only locked with a key derived from the user's Last.fm session key, which it never stores or logs. Picture names are keyed hashes, so the server can't tell what was customized.
- **Only the app's own code runs** in the site (Content Security Policy). No third-party scripts, analytics or trackers. Fonts are bundled.
- **No secrets in this repository.** The Last.fm API key and secret live only in the server's database or Worker secrets; the server never returns them.
- **Server:** origin-locked CORS, parameterized SQL everywhere, size limits on every upload, a per-IP rate limit on the Last.fm and artwork relays (read-only methods only), generic error messages, `nosniff` / `no-referrer` / `no-store` headers, sign-in tokens of 256 bits that expire after 6 months unused, and redirects only back to the site itself.
- **Owner tools** (usage stats, reading the owner's own data) require the owner's own sign-in, checked by the server.
- See [PRIVACY.md](PRIVACY.md) for exactly what's stored.
