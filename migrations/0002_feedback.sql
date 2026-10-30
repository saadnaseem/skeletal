-- Messages sent with "Send feedback" in the app. Drawings are never attached.
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,      -- ms since epoch
  message TEXT NOT NULL,
  email TEXT,                       -- optional reply address the sender typed
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,  -- set when the sender was signed in
  context TEXT,                     -- JSON the sender chose to include: browser, screen size, page
  ip_hash TEXT,                     -- SHA-256 of the sender's IP, only to limit how often one address can send
  status TEXT NOT NULL DEFAULT 'new'  -- for your own triage: new | read | done
);
CREATE INDEX IF NOT EXISTS feedback_created ON feedback(created_at);
CREATE INDEX IF NOT EXISTS feedback_ip ON feedback(ip_hash, created_at);
