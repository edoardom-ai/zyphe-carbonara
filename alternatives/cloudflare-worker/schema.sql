CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  role_other TEXT,
  segment TEXT NOT NULL,
  segment_other TEXT,
  need_kyc INTEGER NOT NULL DEFAULT 0,
  need_kyb INTEGER NOT NULL DEFAULT 0,
  need_aml INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  provider_name TEXT,
  terms INTEGER NOT NULL DEFAULT 0,
  marketing INTEGER NOT NULL DEFAULT 0,
  consent_at TEXT,
  consent_version TEXT,
  consent_text TEXT,
  consent_ip TEXT,
  user_agent TEXT,
  plays INTEGER NOT NULL DEFAULT 0,
  best_score INTEGER NOT NULL DEFAULT 0,
  best_at TEXT,
  last_played TEXT,
  disqualified INTEGER NOT NULL DEFAULT 0,
  lead_source TEXT
);
CREATE INDEX IF NOT EXISTS idx_leads_board ON leads (disqualified, best_score DESC, best_at);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  played_at TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  wrong INTEGER NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS draws (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drawn_at TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  company TEXT NOT NULL,
  pool_size INTEGER NOT NULL,
  forced INTEGER NOT NULL DEFAULT 0
);
