-- Full schema for a new database. (Existing databases got the later columns with ALTER TABLE.)
-- registered: when the Last.fm account was created (survives a rename); was: its former names
CREATE TABLE IF NOT EXISTS users (name TEXT PRIMARY KEY, display TEXT, created INTEGER, last_seen INTEGER, registered INTEGER, was TEXT);
CREATE INDEX IF NOT EXISTS users_registered ON users (registered);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user TEXT NOT NULL, created INTEGER, last_seen INTEGER);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user);
CREATE TABLE IF NOT EXISTS projects (
  user TEXT NOT NULL, id TEXT NOT NULL, data TEXT, updated INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0, srv INTEGER NOT NULL, refs TEXT, PRIMARY KEY (user, id)
);
CREATE INDEX IF NOT EXISTS projects_srv ON projects(user, srv);
CREATE TABLE IF NOT EXISTS images (
  user TEXT NOT NULL, key TEXT NOT NULL, src TEXT, zoom REAL, x REAL, y REAL, updated INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0, srv INTEGER NOT NULL, refs TEXT, PRIMARY KEY (user, key)
);
CREATE INDEX IF NOT EXISTS images_srv ON images(user, srv);
CREATE TABLE IF NOT EXISTS settings (user TEXT PRIMARY KEY, data TEXT, updated INTEGER NOT NULL, srv INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS config (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pending_auth (id TEXT PRIMARY KEY, token TEXT NOT NULL, user TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS chunks (user TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, seq INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (user, kind, key, seq));
CREATE TABLE IF NOT EXISTS vault (user TEXT PRIMARY KEY, wrapped TEXT NOT NULL, kid TEXT NOT NULL, updated INTEGER NOT NULL, escrow TEXT, skey TEXT);
CREATE TABLE IF NOT EXISTS auth_pending (id TEXT PRIMARY KEY, pk TEXT, token TEXT, user TEXT, sealed TEXT, created INTEGER NOT NULL, ready INTEGER NOT NULL DEFAULT 1);
-- sign-in pickups the home-screen app registered (with the connection it registered from)
CREATE TABLE IF NOT EXISTS auth_begin (id TEXT PRIMARY KEY, ip TEXT NOT NULL, created INTEGER NOT NULL);
-- picture store: encrypted pictures, once per account; rows point at them with refs (JSON list)
CREATE TABLE IF NOT EXISTS blobs (user TEXT NOT NULL, id TEXT NOT NULL, seq INTEGER NOT NULL, data BLOB NOT NULL, size INTEGER NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (user, id, seq));

-- behind-the-scenes version notes, readable only by owners (kept out of the public repo)
CREATE TABLE IF NOT EXISTS owner_notes (version TEXT NOT NULL, seq INTEGER NOT NULL, text TEXT NOT NULL, PRIMARY KEY (version, seq));

-- owner stats (usernames, sizes and last-used times only)
CREATE TABLE IF NOT EXISTS visitors (name TEXT PRIMARY KEY, display TEXT, first_seen INTEGER, last_seen INTEGER, visits INTEGER NOT NULL DEFAULT 0);
CREATE VIEW IF NOT EXISTS account_stats AS
SELECT u.display AS account,
  u.created AS joined,
  u.last_seen AS last_seen,
  (SELECT count(*) FROM sessions s WHERE s.user = u.name) AS devices,
  EXISTS (SELECT 1 FROM vault v WHERE v.user = u.name) AS private,
  (SELECT count(*) FROM projects p WHERE p.user = u.name AND p.deleted = 0) AS wrappeds,
  (SELECT count(*) FROM images i WHERE i.user = u.name AND i.deleted = 0) AS pictures,
  COALESCE((SELECT sum(length(p.data)) FROM projects p WHERE p.user = u.name), 0)
    + COALESCE((SELECT sum(length(i.src)) FROM images i WHERE i.user = u.name), 0)
    + COALESCE((SELECT sum(length(c.data)) FROM chunks c WHERE c.user = u.name), 0)
    + COALESCE((SELECT length(st.data) FROM settings st WHERE st.user = u.name), 0)
    + COALESCE((SELECT sum(length(b.data)) FROM blobs b WHERE b.user = u.name), 0) AS bytes
FROM users u;
