-- Staging-only extraction runtime preview. Apply after discovery and readiness migrations.
BEGIN;
CREATE TABLE midan_queue.extraction_runtime_runs_v1 (slot timestamptz PRIMARY KEY,started_at timestamptz NOT NULL DEFAULT statement_timestamp(),finished_at timestamptz,state text NOT NULL CHECK(state IN ('running','completed','failed')),result jsonb CHECK(result IS NULL OR jsonb_typeof(result)='object'));
CREATE OR REPLACE FUNCTION midan_queue.preview_extraction_v1(p_item jsonb, p_result jsonb)
 RETURNS TABLE(source_key text, text_sha256 text, paragraphs integer, photos integer, video_required boolean, readiness text)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'midan_queue'
AS $function$
DECLARE k text; j bigint; a record; r record; p jsonb; im jsonb; v jsonb; h text; n int; result_state text;
BEGIN
 IF p_item IS NULL OR jsonb_typeof(p_item)<>'object' OR p_result IS NULL OR jsonb_typeof(p_result)<>'object' OR octet_length(p_result::text)>250000 THEN RAISE EXCEPTION 'invalid_preview' USING ERRCODE='22023'; END IF;
 k:=p_item->>'key'; p:=p_result->'paragraphs'; im:=p_result->'images'; v:=p_result->'videos'; h:=p_result->>'hash';
 IF k IS NULL OR k !~ '^sana:[0-9]{6,9}$' OR EXISTS(SELECT 1 FROM midan_queue.source_candidates c WHERE c.source_key=k) OR EXISTS(SELECT 1 FROM midan_queue.processing_jobs WHERE state IN ('pending','retry','leased')) THEN RAISE EXCEPTION 'preview_requires_isolation'; END IF;
 BEGIN
 SELECT * INTO r FROM midan_queue.ingest_discovery_v1('sana',jsonb_build_array(p_item));
 IF r.inserted<>1 OR r.queued<>1 THEN RAISE EXCEPTION 'preview_ingest_failed'; END IF;
 SELECT * INTO a FROM midan_queue.claim_extraction_v1(1,120);
 IF a.source_key IS DISTINCT FROM k THEN RAISE EXCEPTION 'preview_claim_failed'; END IF;
 IF NOT midan_queue.commit_extraction_v2(a.job_id,a.lease_token,p_result->>'title',(p_result->>'at')::timestamptz,p,im,v,(p_result->>'requiresVideo')::boolean,p_result->>'category',h) THEN RAISE EXCEPTION 'preview_commit_failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM midan_queue.candidate_source_payloads x WHERE x.source_key=k AND x.paragraphs_json=p) OR NOT EXISTS(SELECT 1 FROM midan_queue.candidate_enrichment x WHERE x.source_key=k AND x.text_sha256=h AND x.images_json=im) THEN RAISE EXCEPTION 'preview_integrity_failed'; END IF;
 SELECT count(*) INTO n FROM midan_queue.media_job_inputs_v1 x WHERE x.source_key=k AND x.text_sha256=h;
 IF n<>jsonb_array_length(im) THEN RAISE EXCEPTION 'preview_media_mismatch'; END IF;
 SELECT state INTO result_state FROM midan_queue.readiness_preview_v1 x WHERE x.source_key=k;
 IF result_state IS NULL THEN RAISE EXCEPTION 'preview_readiness_missing'; END IF;
 RAISE EXCEPTION USING ERRCODE='ZX014',MESSAGE='preview_rollback';
 EXCEPTION WHEN SQLSTATE 'ZX014' THEN NULL;
 END;
 RETURN QUERY SELECT k,h,jsonb_array_length(p),n,(p_result->>'requiresVideo')::boolean,result_state;
END $function$;
REVOKE EXECUTE ON FUNCTION midan_queue.preview_extraction_v1(jsonb,jsonb) FROM PUBLIC;
COMMIT;
