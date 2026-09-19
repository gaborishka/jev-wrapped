-- One row per channel: which preview pages the current run consists of.
CREATE TABLE plans (
  channel TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  max_posts INTEGER NOT NULL,
  since TEXT NOT NULL,
  plan TEXT NOT NULL -- JSON: { info, befores, sampled, latestId, startId }
);

-- One row per judged preview page. Rows of earlier runs stay: they are the store of answers,
-- so a later run pays only for posts it has not seen.
CREATE TABLE pages (
  channel TEXT NOT NULL,
  before INTEGER NOT NULL, -- 0 = the newest page
  day TEXT NOT NULL,
  lowest INTEGER NOT NULL, -- lowest post id on the page
  found INTEGER NOT NULL,  -- posts on the page, whatever their date
  posts TEXT NOT NULL,     -- JSON: [{ id, date, views, text, kind?, kindConfidence, isAd, clickbait, pressure }]
  usd REAL NOT NULL,
  tokens INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  PRIMARY KEY (channel, before)
);
CREATE INDEX pages_day ON pages (day);

CREATE TABLE cards (
  channel TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  max_posts INTEGER NOT NULL,
  card TEXT NOT NULL -- JSON: { info, stats, meta }
);

-- Who started fresh runs today, for the per-address limit. The address is stored hashed.
CREATE TABLE runs (
  visitor TEXT NOT NULL,
  day TEXT NOT NULL,
  channel TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX runs_visitor ON runs (visitor, day);
