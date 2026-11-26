-- Staging discovery ingestion and rollback-only preview. Requires extraction-events-v1.sql.
BEGIN;
CREATE OR REPLACE FUNCTION midan_queue.ingest_discovery_v1(p_source text, p_items jsonb)
 RETURNS TABLE(inserted integer, existing integer, queued integer)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'midan_queue'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE r record; prior midan_queue.source_candidates%ROWTYPE; added int:=0; known int:=0; jobs int:=0; n int; job bigint; pr smallint; at timestamptz;
BEGIN
 IF p_source IS NULL OR p_source NOT IN ('sana','aljazeera') OR p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)>20 OR octet_length(p_items::text)>65536 THEN RAISE EXCEPTION 'invalid_discovery_batch' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x WHERE jsonb_typeof(x)<>'object') THEN RAISE EXCEPTION 'invalid_item' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x WHERE (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(x) k) IS DISTINCT FROM ARRAY['at','key','url'] OR jsonb_typeof(x->'key')<>'string' OR jsonb_typeof(x->'url')<>'string' OR jsonb_typeof(x->'at')<>'string') THEN RAISE EXCEPTION 'invalid_item_shape' USING ERRCODE='22023'; END IF;
 IF (SELECT count(DISTINCT x->>'key') FROM jsonb_array_elements(p_items) x)<>jsonb_array_length(p_items) OR (SELECT count(DISTINCT x->>'url') FROM jsonb_array_elements(p_items) x)<>jsonb_array_length(p_items) THEN RAISE EXCEPTION 'duplicate_item' USING ERRCODE='22023'; END IF;
 FOR r IN SELECT x->>'key' AS k,x->>'url' AS u,x->>'at' AS d FROM jsonb_array_elements(p_items) x ORDER BY x->>'key' LOOP
 IF length(r.k)>1500 OR length(r.u)>1500 OR r.d !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$' THEN RAISE EXCEPTION 'invalid_item_fields' USING ERRCODE='22023'; END IF;
 at:=r.d::timestamptz;
 IF at NOT BETWEEN statement_timestamp()-interval '6 hours' AND statement_timestamp()+interval '1 minute' THEN RAISE EXCEPTION 'outside_freshness_window' USING ERRCODE='22023'; END IF;
 IF p_source='sana' THEN
  IF r.k !~ '^sana:[0-9]{6,9}$' OR r.u !~ ('^https://sana[.]sy/([a-z0-9-]+/){1,4}'||split_part(r.k,':',2)||'/$') THEN RAISE EXCEPTION 'invalid_sana_identity' USING ERRCODE='22023'; END IF;
  pr:=CASE WHEN r.u~ '/(locals|security|governorates)/' THEN 100 WHEN r.u~ '/(syria-and-the-world|economy)/' THEN 80 ELSE 60 END;
 ELSE
  IF r.k NOT LIKE 'aljazeera:/%' OR r.u<>'https://www.aljazeera.net'||substring(r.k FROM 11) OR substring(r.k FROM 11) !~ '^/[a-zA-Z-]+/[0-9]{4}/[0-9]{1,2}/[0-9]{1,2}/[^/?#[:space:]]+$' THEN RAISE EXCEPTION 'invalid_aj_identity' USING ERRCODE='22023'; END IF;
  pr:=CASE WHEN r.u~ '/(news|politics)/' THEN 40 ELSE 20 END;
 END IF;
 INSERT INTO midan_queue.source_candidates(source_key,source_id,source_url,published_at) VALUES(r.k,p_source,r.u,at) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n=0 THEN
 SELECT * INTO prior FROM midan_queue.source_candidates WHERE source_key=r.k;
 IF NOT FOUND OR prior.source_id<>p_source OR prior.source_url<>r.u THEN RAISE EXCEPTION 'candidate_identity_conflict'; END IF;
 known:=known+1;
 ELSE
 added:=added+1;
 job:=midan_queue.enqueue_extract_v1(r.k,pr);
 IF job IS NULL THEN RAISE EXCEPTION 'enqueue_failed'; END IF;
 jobs:=jobs+1;
 END IF;
 END LOOP;
 RETURN QUERY SELECT added,known,jobs;
END $function$;

CREATE OR REPLACE FUNCTION midan_queue.preview_discovery_v1(p_source text, p_items jsonb)
 RETURNS TABLE(inserted integer, existing integer, queued integer)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'midan_queue'
AS $function$
DECLARE r record;
BEGIN
 BEGIN
 SELECT * INTO r FROM midan_queue.ingest_discovery_v1(p_source,p_items);
 RAISE EXCEPTION USING ERRCODE='ZX012',MESSAGE='preview_rollback';
 EXCEPTION WHEN SQLSTATE 'ZX012' THEN NULL;
 END;
 RETURN QUERY SELECT r.inserted,r.existing,r.queued;
END $function$;
REVOKE EXECUTE ON FUNCTION midan_queue.ingest_discovery_v1(text,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION midan_queue.preview_discovery_v1(text,jsonb) FROM PUBLIC;
COMMIT;
