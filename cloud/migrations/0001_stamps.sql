-- One row per post. The image itself lives in R2 under the same id.
CREATE TABLE stamps (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  posted_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'published', 'hidden')),
  reports INTEGER NOT NULL DEFAULT 0,
  delete_hash TEXT NOT NULL,
  content_type TEXT NOT NULL
);

CREATE INDEX stamps_status_posted ON stamps (status, posted_at DESC);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES ('moderation', 'approve-first');
