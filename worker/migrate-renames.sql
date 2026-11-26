-- Renamed Last.fm accounts (run once on an existing database; schema.sql has these for new ones)
ALTER TABLE users ADD COLUMN registered INTEGER;
ALTER TABLE users ADD COLUMN was TEXT;
CREATE INDEX IF NOT EXISTS users_registered ON users (registered);
