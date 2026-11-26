-- Staging import, exact payload SHA-256 and row equality; no production data.
BEGIN;
CREATE OR REPLACE FUNCTION midan_queue.import_d1_batch_v1(p_batch_id text, p_table text, p_payload text, p_expected integer, p_digest text)
 RETURNS TABLE(matched_rows integer, inserted_rows integer, replayed boolean)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'midan_queue'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE rel regclass; keys text[]; columns text[]; payload jsonb; existing midan_queue.migration_batches%ROWTYPE; pred text; keyexpr text; n integer; matched integer; prior boolean;
BEGIN
 IF p_batch_id IS NULL OR p_batch_id !~ '^[a-zA-Z0-9:_-]{1,160}$' OR p_expected IS NULL OR p_expected NOT BETWEEN 1 AND 100 OR p_payload IS NULL OR octet_length(p_payload)>1048576 OR p_digest IS NULL OR p_digest !~ '^[0-9a-f]{64}$' OR encode(sha256(convert_to(p_payload,'UTF8')),'hex')<>p_digest THEN RAISE EXCEPTION 'invalid_batch_envelope' USING ERRCODE='22023'; END IF;
 CASE p_table
 WHEN 'source_candidates' THEN keys:=ARRAY['source_key'];
 WHEN 'candidate_enrichment' THEN keys:=ARRAY['source_key'];
 WHEN 'candidate_source_payloads' THEN keys:=ARRAY['source_key'];
 WHEN 'candidate_image_checks' THEN keys:=ARRAY['source_key','url'];
 WHEN 'candidate_publication_plans' THEN keys:=ARRAY['source_key'];
 WHEN 'restored_source_registry' THEN keys:=ARRAY['source_id'];
 WHEN 'restored_source_items' THEN keys:=ARRAY['source_key'];
 WHEN 'source_discovery_runs' THEN keys:=ARRAY['run_key'];
 ELSE RAISE EXCEPTION 'invalid_source_table' USING ERRCODE='22023';
 END CASE;
 rel:=to_regclass(format('midan_queue.%I',p_table));
 IF rel IS NULL THEN RAISE EXCEPTION 'missing_target_table'; END IF;
 payload:=p_payload::jsonb;
 IF jsonb_typeof(payload)<>'array' OR jsonb_array_length(payload)<>p_expected THEN RAISE EXCEPTION 'invalid_batch_count' USING ERRCODE='22023'; END IF;
 SELECT array_agg(attname::text ORDER BY attname) INTO columns FROM pg_attribute WHERE attrelid=rel AND attnum>0 AND NOT attisdropped;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(payload) AS v(x) WHERE jsonb_typeof(v.x)<>'object') THEN RAISE EXCEPTION 'invalid_batch_row' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(payload) AS v(x) WHERE ARRAY(SELECT k FROM jsonb_object_keys(v.x) k ORDER BY k) IS DISTINCT FROM columns OR EXISTS(SELECT 1 FROM unnest(keys) k WHERE v.x->>k IS NULL OR v.x->>k='')) THEN RAISE EXCEPTION 'invalid_batch_columns' USING ERRCODE='22023'; END IF;
 SELECT string_agg(format('t.%I IS NOT DISTINCT FROM s.%I',k,k),' AND '),string_agg(format('s.%I',k),',') INTO pred,keyexpr FROM unnest(keys) k;
 EXECUTE format('SELECT count(*) FROM (SELECT %s FROM jsonb_populate_recordset(NULL::%s,$1) s GROUP BY %s HAVING count(*)>1) d',keyexpr,rel,keyexpr) INTO n USING payload;
 IF n>0 THEN RAISE EXCEPTION 'duplicate_batch_keys' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('midan_queue_import_d1_v1',0));
 SELECT * INTO existing FROM midan_queue.migration_batches WHERE batch_id=p_batch_id;
 prior:=FOUND;
 IF prior AND (existing.source_table<>p_table OR existing.expected_rows<>p_expected OR existing.digest<>p_digest OR existing.state<>'verified' OR existing.imported_rows<>p_expected) THEN RAISE EXCEPTION 'batch_id_conflict'; END IF;
 n:=0;
 IF NOT prior THEN
 EXECUTE format('INSERT INTO %s SELECT * FROM jsonb_populate_recordset(NULL::%s,$1) ON CONFLICT DO NOTHING',rel,rel) USING payload;
 GET DIAGNOSTICS n=ROW_COUNT;
 END IF;
 EXECUTE format('SELECT count(*) FROM jsonb_populate_recordset(NULL::%s,$1) s JOIN %s t ON %s WHERE to_jsonb(t)=to_jsonb(s)',rel,rel,pred) INTO matched USING payload;
 IF matched<>p_expected THEN RAISE EXCEPTION 'target_row_conflict_or_missing'; END IF;
 IF NOT prior THEN INSERT INTO midan_queue.migration_batches(batch_id,source_table,expected_rows,imported_rows,digest,state) VALUES(p_batch_id,p_table,p_expected,matched,p_digest,'verified'); END IF;
 RETURN QUERY SELECT matched,n,prior;
END $function$;
REVOKE EXECUTE ON FUNCTION midan_queue.import_d1_batch_v1(text,text,text,integer,text) FROM PUBLIC;
COMMIT;
