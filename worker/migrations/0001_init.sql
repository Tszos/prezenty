-- One row per gift list (person). key_hash = SHA-256 hex of the owner's admin key.
CREATE TABLE lists (
  person   TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL
);

CREATE TABLE items (
  person TEXT NOT NULL REFERENCES lists(person),
  id     TEXT NOT NULL,
  title  TEXT NOT NULL,
  descr  TEXT NOT NULL DEFAULT '',
  price  TEXT NOT NULL DEFAULT '',
  shop   TEXT NOT NULL DEFAULT '',
  url    TEXT NOT NULL DEFAULT '',
  grp    TEXT NOT NULL DEFAULT '',
  pos    INTEGER NOT NULL,
  PRIMARY KEY (person, id)
);

-- One reservation per gift: the primary key makes two people claiming at once impossible.
CREATE TABLE claims (
  person     TEXT NOT NULL,
  item_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  token      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (person, item_id)
);
