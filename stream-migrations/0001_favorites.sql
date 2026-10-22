CREATE TABLE IF NOT EXISTS stream_favorites (
  owner_hash TEXT NOT NULL,
  bvid TEXT NOT NULL,
  page INTEGER NOT NULL CHECK (page > 0),
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  part_title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (owner_hash, bvid, page)
);
CREATE INDEX IF NOT EXISTS stream_favorites_recent ON stream_favorites(owner_hash, created_at DESC);
