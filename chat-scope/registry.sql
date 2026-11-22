-- Apply only to the separate chat catalog after its base topic schema.
CREATE TABLE chat_scopes (
  owner TEXT NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  PRIMARY KEY (owner, fingerprint)
);
