-- Staging extraction claims; apply after media-events-v1.sql.
BEGIN;
CREATE OR REPLACE FUNCTION midan_queue.claim_extraction_v1(p_limit integer DEFAULT 3, p_lease_seconds integer DEFAULT 120)
 RETURNS TABLE(job_id bigint, source_key text, source_id text, source_url text, published_at timestamp with time zone, attempts smallint, lease_token uuid, lease_until timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'midan_queue'
AS $function$
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 3 OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN RAISE EXCEPTION 'invalid_claim_parameters' USING ERRCODE='22023'; END IF;
 RETURN QUERY WITH picked AS (
 SELECT j.job_id,c.source_key,c.source_id,c.source_url,c.published_at FROM midan_queue.processing_jobs j JOIN midan_queue.source_candidates c ON c.source_key=j.source_key
 WHERE j.kind='extract' AND c.state='pending' AND c.source_id IN ('sana','aljazeera') AND c.published_at BETWEEN statement_timestamp()-interval '6 hours' AND statement_timestamp()+interval '1 minute'
 AND j.attempts<3 AND ((j.state IN ('pending','retry') AND j.available_at<=statement_timestamp()) OR (j.state='leased' AND j.lease_until<=statement_timestamp()))
 AND NOT EXISTS(SELECT 1 FROM midan_queue.candidate_enrichment e WHERE e.source_key=c.source_key AND e.state NOT IN ('processing','retry'))
 ORDER BY j.priority DESC,c.published_at DESC,j.available_at,j.job_id LIMIT p_limit FOR UPDATE OF j SKIP LOCKED
 ), leased AS (
 UPDATE midan_queue.processing_jobs j SET state='leased',attempts=j.attempts+1,lease_token=gen_random_uuid(),lease_until=statement_timestamp()+make_interval(secs=>p_lease_seconds),updated_at=statement_timestamp(),last_error=NULL FROM picked p WHERE j.job_id=p.job_id
 RETURNING j.job_id,j.attempts,j.lease_token,j.lease_until
 ) SELECT l.job_id,p.source_key,p.source_id,p.source_url,p.published_at,l.attempts,l.lease_token,l.lease_until FROM picked p JOIN leased l ON l.job_id=p.job_id;
END $function$;
REVOKE EXECUTE ON FUNCTION midan_queue.claim_extraction_v1(integer,integer) FROM PUBLIC;
COMMIT;
