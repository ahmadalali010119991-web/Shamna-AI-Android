-- Staging migration checkpoint. Requires import-d1-batch-v1.sql.
-- A reached_end flag means one keyset scan ended, not that a changing D1 source is fully synchronized. A final consistency check is mandatory before production cutover.
BEGIN;
CREATE TABLE midan_queue.migration_checkpoints_v1(
 run_id text NOT NULL CHECK(run_id~'^[a-zA-Z0-9_-]{1,50}$'),
 source_table text NOT NULL,
 cursor jsonb CHECK(cursor IS NULL OR jsonb_typeof(cursor)='array'),
 previous_cursor jsonb CHECK(previous_cursor IS NULL OR jsonb_typeof(previous_cursor)='array'),
 pages integer NOT NULL DEFAULT 0 CHECK(pages>=0),
 matched_rows bigint NOT NULL DEFAULT 0 CHECK(matched_rows>=0),
 last_digest text CHECK(last_digest IS NULL OR last_digest~'^[0-9a-f]{64}$'),
 reached_end boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 PRIMARY KEY(run_id,source_table)
);
CREATE OR REPLACE FUNCTION midan_queue.apply_migration_page_v1(p_run text, p_table text, p_cursor jsonb, p_payload text, p_limit integer, p_digest text)
 RETURNS TABLE(cursor jsonb, pages integer, matched_rows bigint, reached_end boolean, replayed boolean)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'midan_queue'
AS $function$
DECLARE old midan_queue.migration_checkpoints_v1%ROWTYPE; item jsonb; payload jsonb; n int; keys text[]; k text; v text; prev bytea[]; current_key bytea[]; last_key jsonb; r record; end_of_scan boolean;
BEGIN
 IF p_run IS NULL OR p_run!~'^[a-zA-Z0-9_-]{1,50}$' OR p_table IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_payload IS NULL OR octet_length(p_payload)>900000 OR p_digest IS NULL OR p_digest!~'^[0-9a-f]{64}$' OR encode(sha256(convert_to(p_payload,'UTF8')),'hex')<>p_digest THEN RAISE EXCEPTION 'invalid_page_envelope' USING ERRCODE='22023'; END IF;
 CASE p_table WHEN 'source_candidates' THEN keys:=ARRAY['source_key']; WHEN 'candidate_enrichment' THEN keys:=ARRAY['source_key']; WHEN 'candidate_source_payloads' THEN keys:=ARRAY['source_key']; WHEN 'candidate_image_checks' THEN keys:=ARRAY['source_key','url']; WHEN 'candidate_publication_plans' THEN keys:=ARRAY['source_key']; WHEN 'restored_source_registry' THEN keys:=ARRAY['source_id']; WHEN 'restored_source_items' THEN keys:=ARRAY['source_key']; WHEN 'source_discovery_runs' THEN keys:=ARRAY['run_key']; ELSE RAISE EXCEPTION 'invalid_source_table' USING ERRCODE='22023'; END CASE;
 IF p_cursor IS NOT NULL AND (jsonb_typeof(p_cursor)<>'array' OR jsonb_array_length(p_cursor)<>cardinality(keys) OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_cursor) x WHERE jsonb_typeof(x)<>'string' OR x#>>'{}'='')) THEN RAISE EXCEPTION 'invalid_cursor' USING ERRCODE='22023'; END IF;
 payload:=p_payload::jsonb;
 IF jsonb_typeof(payload)<>'array' OR jsonb_array_length(payload)>p_limit THEN RAISE EXCEPTION 'invalid_page_count' USING ERRCODE='22023'; END IF;
 n:=jsonb_array_length(payload); end_of_scan:=n<p_limit; last_key:=p_cursor;
 IF p_cursor IS NOT NULL THEN SELECT array_agg(convert_to(x,'UTF8') ORDER BY ord) INTO prev FROM jsonb_array_elements_text(p_cursor) WITH ORDINALITY z(x,ord); END IF;
 FOR item IN SELECT x FROM jsonb_array_elements(payload) x LOOP
  IF jsonb_typeof(item)<>'object' THEN RAISE EXCEPTION 'invalid_row' USING ERRCODE='22023'; END IF;
  current_key:=ARRAY[]::bytea[];last_key:='[]';
  FOREACH k IN ARRAY keys LOOP
   IF jsonb_typeof(item->k) IS DISTINCT FROM 'string' OR coalesce(item->>k,'')='' THEN RAISE EXCEPTION 'invalid_row_key' USING ERRCODE='22023'; END IF;
   v:=item->>k;current_key:=array_append(current_key,convert_to(v,'UTF8'));last_key:=last_key||jsonb_build_array(v);
  END LOOP;
  IF prev IS NOT NULL AND current_key<=prev THEN RAISE EXCEPTION 'unordered_or_repeated_key' USING ERRCODE='22023'; END IF;
  prev:=current_key;
 END LOOP;
 PERFORM pg_advisory_xact_lock(hashtextextended('midan_queue_import_d1_v1',0));
 INSERT INTO midan_queue.migration_checkpoints_v1(run_id,source_table) VALUES(p_run,p_table) ON CONFLICT DO NOTHING;
 SELECT * INTO old FROM midan_queue.migration_checkpoints_v1 c WHERE c.run_id=p_run AND c.source_table=p_table FOR UPDATE;
 IF old.pages>0 AND old.previous_cursor IS NOT DISTINCT FROM p_cursor AND old.last_digest=p_digest AND old.cursor IS NOT DISTINCT FROM last_key AND old.reached_end=end_of_scan THEN
  IF n>0 THEN SELECT * INTO r FROM midan_queue.import_d1_batch_v1(p_run||':'||p_table||':'||p_digest,p_table,p_payload,n,p_digest); IF r.matched_rows<>n THEN RAISE EXCEPTION 'replay_count_mismatch'; END IF; END IF;
  RETURN QUERY SELECT old.cursor,old.pages,old.matched_rows,old.reached_end,true; RETURN;
 END IF;
 IF old.reached_end OR old.cursor IS DISTINCT FROM p_cursor THEN RAISE EXCEPTION 'checkpoint_conflict'; END IF;
 IF n>0 THEN SELECT * INTO r FROM midan_queue.import_d1_batch_v1(p_run||':'||p_table||':'||p_digest,p_table,p_payload,n,p_digest); IF r.matched_rows<>n THEN RAISE EXCEPTION 'import_count_mismatch'; END IF; END IF;
 UPDATE midan_queue.migration_checkpoints_v1 c SET cursor=last_key,previous_cursor=p_cursor,pages=c.pages+1,matched_rows=c.matched_rows+n,last_digest=p_digest,reached_end=end_of_scan,updated_at=statement_timestamp() WHERE c.run_id=p_run AND c.source_table=p_table RETURNING * INTO old;
 RETURN QUERY SELECT old.cursor,old.pages,old.matched_rows,old.reached_end,false;
END $function$;
REVOKE EXECUTE ON FUNCTION midan_queue.apply_migration_page_v1(text,text,jsonb,text,integer,text) FROM PUBLIC;
COMMIT;
