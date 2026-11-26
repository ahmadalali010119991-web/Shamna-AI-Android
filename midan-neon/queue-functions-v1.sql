-- Midan Al Khabar: tested queue functions, exported from the Neon staging branch.
-- Requires existing midan_queue tables. Apply only in a reviewed migration.
-- No connection credentials, source contents, or production data included.
BEGIN;

CREATE OR REPLACE FUNCTION midan_queue.claim_jobs_v1(p_kind text, p_limit integer DEFAULT 3, p_lease_seconds integer DEFAULT 120)
 RETURNS TABLE(job_id bigint, source_key text, kind text, input_sha256 text, attempts smallint, lease_token uuid, lease_until timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'midan_queue'
AS $function$
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN ('extract','verify_media','plan') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 3 OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN RAISE EXCEPTION 'invalid_claim_parameters' USING ERRCODE='22023'; END IF;
 RETURN QUERY WITH chosen AS (
 SELECT j.job_id FROM midan_queue.processing_jobs j JOIN midan_queue.source_candidates c ON c.source_key=j.source_key
 WHERE j.kind=p_kind AND c.state='pending' AND j.attempts<3 AND ((j.state IN ('pending','retry') AND j.available_at<=statement_timestamp()) OR (j.state='leased' AND j.lease_until<=statement_timestamp()))
 ORDER BY j.priority DESC,j.available_at,j.job_id LIMIT p_limit FOR UPDATE OF j SKIP LOCKED
 ), claimed AS (
 UPDATE midan_queue.processing_jobs j SET state='leased',attempts=j.attempts+1,lease_token=gen_random_uuid(),lease_until=statement_timestamp()+make_interval(secs=>p_lease_seconds),updated_at=statement_timestamp(),last_error=NULL FROM chosen WHERE j.job_id=chosen.job_id
 RETURNING j.job_id,j.source_key,j.kind,j.input_sha256,j.attempts,j.lease_token,j.lease_until
 ) SELECT x.job_id,x.source_key,x.kind,x.input_sha256,x.attempts,x.lease_token,x.lease_until FROM claimed x;
END $function$;

CREATE OR REPLACE FUNCTION midan_queue.finish_job_v1(p_job_id bigint, p_token uuid, p_success boolean, p_error text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'midan_queue'
AS $function$
DECLARE n integer;
BEGIN
 IF p_job_id IS NULL OR p_token IS NULL OR p_success IS NULL OR length(coalesce(p_error,''))>240 THEN RAISE EXCEPTION 'invalid_finish_parameters' USING ERRCODE='22023'; END IF;
 UPDATE midan_queue.processing_jobs j SET state=CASE WHEN p_success THEN 'done' WHEN j.attempts>=3 THEN 'blocked' ELSE 'retry' END, lease_token=NULL,lease_until=NULL,available_at=CASE WHEN NOT p_success AND j.attempts<3 THEN statement_timestamp()+interval '15 minutes' ELSE j.available_at END,last_error=CASE WHEN p_success THEN NULL ELSE coalesce(nullif(p_error,''),'processing_failed') END,updated_at=statement_timestamp()
 WHERE j.job_id=p_job_id AND j.state='leased' AND j.lease_token=p_token AND j.lease_until>statement_timestamp() AND EXISTS(SELECT 1 FROM midan_queue.source_candidates c WHERE c.source_key=j.source_key AND c.state='pending');
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n=1;
END $function$;

CREATE OR REPLACE FUNCTION midan_queue.recover_exhausted_jobs_v1(p_limit integer DEFAULT 20)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'midan_queue'
AS $function$
DECLARE n integer;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'invalid_recovery_limit' USING ERRCODE='22023'; END IF;
 WITH chosen AS (SELECT j.job_id FROM midan_queue.processing_jobs j WHERE j.state='leased' AND j.attempts>=3 AND j.lease_until<=statement_timestamp() ORDER BY j.lease_until,j.job_id LIMIT p_limit FOR UPDATE SKIP LOCKED)
 UPDATE midan_queue.processing_jobs j SET state='blocked',lease_token=NULL,lease_until=NULL,last_error='claim_expired_final_attempt',updated_at=statement_timestamp() FROM chosen WHERE j.job_id=chosen.job_id;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $function$;

COMMIT;
