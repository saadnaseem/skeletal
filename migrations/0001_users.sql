-- Accounts created by "Sign in with Google". Drawings are never stored on the server.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,              -- Google account id (the ID token's "sub")
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,      -- first sign-in, ms since epoch
  last_seen_at INTEGER NOT NULL,    -- last visit while signed in (updated at most hourly)
  sign_ins INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,              -- SHA-256 of the session cookie; the cookie itself is never stored
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS users_created ON users(created_at);
