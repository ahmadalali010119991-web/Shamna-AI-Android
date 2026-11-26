-- Staging archive-outage deferral; apply after extraction claims.
BEGIN;
CREATE OR REPLACE FUNCTION midan_queue.defer_extraction_v1(p_job_id bigint, p_token uuid, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'midan_queue'
AS $function$
DECLARE n integer;
BEGIN
 IF p_job_id IS NULL OR p_token IS NULL OR p_reason IS NULL OR p_reason NOT IN ('archive_lookup_incomplete','archive_unavailable','archive_known_review') THEN RAISE EXCEPTION 'invalid_deferral' USING ERRCODE='22023'; END IF;
 UPDATE midan_queue.processing_jobs j SET state=CASE WHEN p_reason='archive_known_review' THEN 'blocked' ELSE 'retry' END,attempts=CASE WHEN p_reason='archive_known_review' THEN j.attempts ELSE greatest(0,j.attempts-1) END,lease_token=NULL,lease_until=NULL,available_at=CASE WHEN p_reason='archive_known_review' THEN j.available_at ELSE statement_timestamp()+interval '30 minutes' END,last_error=p_reason,updated_at=statement_timestamp()
 WHERE j.job_id=p_job_id AND j.kind='extract' AND j.state='leased' AND j.lease_token=p_token AND j.lease_until>statement_timestamp() AND EXISTS(SELECT 1 FROM midan_queue.source_candidates c WHERE c.source_key=j.source_key AND c.state='pending');
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n=1;
END $function$;
REVOKE EXECUTE ON FUNCTION midan_queue.defer_extraction_v1(bigint,uuid,text) FROM PUBLIC;
COMMIT;
