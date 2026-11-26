-- Staging runtime smoke-test ledger. Never contains article content or credentials.
BEGIN;
CREATE TABLE IF NOT EXISTS midan_queue.media_runtime_runs_v1 (
  slot timestamptz PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  finished_at timestamptz,
  state text NOT NULL CHECK(state IN ('running','completed','failed')),
  result jsonb CHECK(result IS NULL OR jsonb_typeof(result)='object')
);
COMMIT;
