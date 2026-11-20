-- Target schema for partner policy data (runs automatically on the first Postgres start)
CREATE TABLE IF NOT EXISTS policies (
  policy_id       TEXT PRIMARY KEY,
  partner         TEXT NOT NULL,
  customer_email  TEXT NOT NULL,
  product         TEXT NOT NULL,
  start_date      DATE NOT NULL,
  premium_eur     NUMERIC(10,2) NOT NULL CHECK (premium_eur > 0),
  loaded_at       TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rejected_rows (
  id          SERIAL PRIMARY KEY,
  run_id      TEXT NOT NULL,
  partner     TEXT NOT NULL,
  raw_row     JSONB NOT NULL,
  reason      TEXT NOT NULL,
  rejected_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS load_runs (
  run_id       TEXT PRIMARY KEY,
  rows_read    INT NOT NULL,
  rows_loaded  INT NOT NULL,
  rows_rejected INT NOT NULL,
  finished_at  TIMESTAMP NOT NULL DEFAULT now()
);
