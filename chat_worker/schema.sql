CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  visitor_token_hash TEXT NOT NULL,
  visitor_name TEXT NOT NULL DEFAULT '',
  visitor_email TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_message_at TEXT
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  sender_type TEXT NOT NULL CHECK(sender_type IN ('visitor','agent')),
  body TEXT NOT NULL,
  client_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT,
  UNIQUE(conversation_id,sender_type,client_id)
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id,id);
CREATE TABLE IF NOT EXISTS agent_sessions (
  token_hash TEXT PRIMARY KEY,
  csrf TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (
  rate_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
