-- Tested staging migration; apply after the base queue and extraction functions.
-- No secrets or news records are included.
BEGIN;
CREATE TABLE midan_queue.media_job_inputs_v1(job_id bigint PRIMARY KEY REFERENCES midan_queue.processing_jobs(job_id),source_key text NOT NULL,url text NOT NULL,text_sha256 text NOT NULL CHECK(text_sha256 ~ '^[0-9a-f]{64}$'),FOREIGN KEY(source_key,url) REFERENCES midan_queue.candidate_image_checks(source_key,url),UNIQUE(source_key,url,text_sha256));

CREATE OR REPLACE FUNCTION midan_queue.enqueue_media_v1(p_source_key text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'midan_queue'
AS $function$
DECLARE c midan_queue.source_candidates%ROWTYPE; e midan_queue.candidate_enrichment%ROWTYPE; n int;
BEGIN
 SELECT * INTO c FROM midan_queue.source_candidates WHERE source_key=p_source_key FOR UPDATE;
 IF NOT FOUND OR c.state<>'pending' OR c.source_id NOT IN ('sana','aljazeera') THEN RETURN 0; END IF;
 SELECT * INTO e FROM midan_queue.candidate_enrichment WHERE source_key=c.source_key FOR UPDATE;
 IF NOT FOUND OR e.state NOT IN ('ready_for_review','needs_media') OR e.text_sha256 IS NULL OR e.text_sha256 !~ '^[0-9a-f]{64}$' OR e.images_json IS NULL OR jsonb_array_length(e.images_json)>30 THEN RETURN 0; END IF;
 WITH eligible AS (
 SELECT i.source_key,i.url,i.attempts,encode(sha256(convert_to(jsonb_build_array(i.source_key,e.text_sha256,i.url)::text,'UTF8')),'hex') AS h
 FROM midan_queue.candidate_image_checks i WHERE i.source_key=c.source_key AND i.state IN ('pending','retry') AND i.attempts<3 AND e.images_json ? i.url
 ), created AS (
 INSERT INTO midan_queue.processing_jobs(source_key,kind,input_sha256,attempts,available_at)
 SELECT x.source_key,'verify_media',x.h,x.attempts,CASE WHEN i.state='retry' THEN greatest(statement_timestamp(),i.updated_at+interval '15 minutes') ELSE statement_timestamp() END
 FROM eligible x JOIN midan_queue.candidate_image_checks i ON i.source_key=x.source_key AND i.url=x.url
 ON CONFLICT(source_key,kind,input_sha256) DO NOTHING RETURNING job_id,source_key,input_sha256
 )
 INSERT INTO midan_queue.media_job_inputs_v1(job_id,source_key,url,text_sha256)
 SELECT j.job_id,x.source_key,x.url,e.text_sha256 FROM created j JOIN eligible x ON x.source_key=j.source_key AND x.h=j.input_sha256;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $function$;

CREATE OR REPLACE FUNCTION midan_queue.claim_media_v1(p_limit integer DEFAULT 3, p_lease_seconds integer DEFAULT 120)
 RETURNS TABLE(job_id bigint, source_key text, source_url text, source_id text, url text, text_sha256 text, attempts smallint, lease_token uuid, lease_until timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'midan_queue'
AS $function$
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 3 OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN RAISE EXCEPTION 'invalid_claim_parameters' USING ERRCODE='22023'; END IF;
 RETURN QUERY WITH picked AS (
 SELECT j.job_id,m.source_key,m.url,m.text_sha256,c.source_url,c.source_id FROM midan_queue.processing_jobs j JOIN midan_queue.media_job_inputs_v1 m ON m.job_id=j.job_id
 JOIN midan_queue.source_candidates c ON c.source_key=m.source_key JOIN midan_queue.candidate_enrichment e ON e.source_key=m.source_key
 JOIN midan_queue.candidate_image_checks i ON i.source_key=m.source_key AND i.url=m.url
 WHERE j.kind='verify_media' AND c.state='pending' AND e.state IN ('ready_for_review','needs_media') AND e.text_sha256=m.text_sha256 AND e.images_json ? m.url AND j.attempts=i.attempts AND j.attempts<3
 AND ((j.state IN ('pending','retry') AND i.state IN ('pending','retry') AND j.available_at<=statement_timestamp()) OR (j.state='leased' AND i.state='checking' AND j.lease_until<=statement_timestamp()))
 ORDER BY j.priority DESC,j.available_at,j.job_id LIMIT p_limit FOR UPDATE OF j,i SKIP LOCKED
 ), leased AS (
 UPDATE midan_queue.processing_jobs j SET state='leased',attempts=j.attempts+1,lease_token=gen_random_uuid(),lease_until=statement_timestamp()+make_interval(secs=>p_lease_seconds),updated_at=statement_timestamp(),last_error=NULL
 FROM picked p WHERE j.job_id=p.job_id RETURNING j.job_id,j.attempts,j.lease_token,j.lease_until
 ), checks AS (
 UPDATE midan_queue.candidate_image_checks i SET state='checking',attempts=l.attempts,updated_at=statement_timestamp(),error=NULL FROM picked p JOIN leased l ON l.job_id=p.job_id WHERE i.source_key=p.source_key AND i.url=p.url RETURNING i.source_key,i.url
 )
 SELECT l.job_id,p.source_key,p.source_url,p.source_id,p.url,p.text_sha256,l.attempts,l.lease_token,l.lease_until FROM picked p JOIN leased l ON l.job_id=p.job_id JOIN checks x ON x.source_key=p.source_key AND x.url=p.url;
END $function$;

CREATE OR REPLACE FUNCTION midan_queue.finish_media_v1(p_job_id bigint, p_token uuid, p_ok boolean, p_mime text, p_width integer, p_height integer, p_http integer, p_error text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'midan_queue'
AS $function$
DECLARE m midan_queue.media_job_inputs_v1%ROWTYPE; j midan_queue.processing_jobs%ROWTYPE; c midan_queue.source_candidates%ROWTYPE; e midan_queue.candidate_enrichment%ROWTYPE; s text; n int;
BEGIN
 IF p_job_id IS NULL OR p_token IS NULL OR p_ok IS NULL OR length(coalesce(p_error,''))>100 OR (p_http IS NOT NULL AND p_http NOT BETWEEN 100 AND 599) THEN RAISE EXCEPTION 'invalid_media_result' USING ERRCODE='22023'; END IF;
 IF p_ok AND (p_http IS NULL OR p_http NOT IN (200,206) OR p_mime IS NULL OR p_mime NOT IN ('image/jpeg','image/png','image/webp','image/gif') OR p_width IS NULL OR p_height IS NULL OR p_width NOT BETWEEN 1 AND 30000 OR p_height NOT BETWEEN 1 AND 30000) THEN RAISE EXCEPTION 'invalid_verified_media' USING ERRCODE='22023'; END IF;
 SELECT * INTO m FROM midan_queue.media_job_inputs_v1 WHERE job_id=p_job_id; IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO c FROM midan_queue.source_candidates WHERE source_key=m.source_key FOR UPDATE; IF NOT FOUND OR c.state<>'pending' THEN RETURN false; END IF;
 SELECT * INTO e FROM midan_queue.candidate_enrichment WHERE source_key=m.source_key FOR UPDATE; IF NOT FOUND OR e.text_sha256 IS DISTINCT FROM m.text_sha256 OR e.state NOT IN ('ready_for_review','needs_media') OR NOT coalesce(e.images_json ? m.url,false) THEN RETURN false; END IF;
 SELECT * INTO j FROM midan_queue.processing_jobs WHERE job_id=p_job_id FOR UPDATE; IF NOT FOUND OR j.state<>'leased' OR j.lease_token IS DISTINCT FROM p_token OR j.lease_until<=statement_timestamp() THEN RETURN false; END IF;
 s:=CASE WHEN p_ok THEN CASE WHEN greatest(p_width,p_height)>=640 AND least(p_width,p_height)>=360 THEN 'available' ELSE 'low_resolution' END WHEN j.attempts>=3 THEN 'blocked' ELSE 'retry' END;
 UPDATE midan_queue.candidate_image_checks SET state=s,mime=CASE WHEN p_ok THEN p_mime ELSE NULL END,width=CASE WHEN p_ok THEN p_width ELSE NULL END,height=CASE WHEN p_ok THEN p_height ELSE NULL END,http_status=p_http,error=CASE WHEN p_ok THEN NULL ELSE coalesce(nullif(p_error,''),'image_check_failed') END,updated_at=statement_timestamp()
 WHERE source_key=m.source_key AND url=m.url AND state='checking' AND attempts=j.attempts;
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RETURN false; END IF;
 UPDATE midan_queue.processing_jobs SET state=CASE WHEN p_ok THEN 'done' WHEN j.attempts>=3 THEN 'blocked' ELSE 'retry' END,lease_token=NULL,lease_until=NULL,available_at=CASE WHEN NOT p_ok AND j.attempts<3 THEN statement_timestamp()+interval '15 minutes' ELSE j.available_at END,last_error=CASE WHEN p_ok THEN NULL ELSE coalesce(nullif(p_error,''),'image_check_failed') END,updated_at=statement_timestamp() WHERE job_id=p_job_id;
 RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION midan_queue.recover_media_v1(p_limit integer DEFAULT 20)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'midan_queue'
AS $function$
DECLARE n int;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'invalid_recovery_limit' USING ERRCODE='22023'; END IF;
 WITH picked AS (
 SELECT j.job_id,m.source_key,m.url FROM midan_queue.processing_jobs j JOIN midan_queue.media_job_inputs_v1 m ON m.job_id=j.job_id
 JOIN midan_queue.candidate_image_checks i ON i.source_key=m.source_key AND i.url=m.url
 WHERE j.state='leased' AND j.attempts=3 AND j.lease_until<=statement_timestamp() AND i.state='checking' AND i.attempts=j.attempts
 ORDER BY j.lease_until,j.job_id LIMIT p_limit FOR UPDATE OF j,i SKIP LOCKED
 ), blocked AS (
 UPDATE midan_queue.processing_jobs j SET state='blocked',lease_token=NULL,lease_until=NULL,last_error='claim_expired_final_attempt',updated_at=statement_timestamp()
 FROM picked p WHERE j.job_id=p.job_id RETURNING j.job_id
 )
 UPDATE midan_queue.candidate_image_checks i SET state='blocked',error='claim_expired_final_attempt',updated_at=statement_timestamp()
 FROM picked p JOIN blocked j ON j.job_id=p.job_id WHERE i.source_key=p.source_key AND i.url=p.url;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $function$;

CREATE OR REPLACE FUNCTION midan_queue.commit_extraction_v2(p_job_id bigint, p_token uuid, p_title text, p_at timestamp with time zone, p_paragraphs jsonb, p_images jsonb, p_videos jsonb, p_video_required boolean, p_category text, p_text_sha256 text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'midan_queue'
AS $function$
DECLARE k text;
BEGIN
 IF NOT midan_queue.commit_extraction_v1(p_job_id,p_token,p_title,p_at,p_paragraphs,p_images,p_videos,p_video_required,p_category,p_text_sha256) THEN RETURN false; END IF;
 SELECT source_key INTO k FROM midan_queue.processing_jobs WHERE job_id=p_job_id;
 PERFORM midan_queue.enqueue_media_v1(k);
 RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION midan_queue.claim_jobs_v1(p_kind text, p_limit integer DEFAULT 3, p_lease_seconds integer DEFAULT 120)
 RETURNS TABLE(job_id bigint, source_key text, kind text, input_sha256 text, attempts smallint, lease_token uuid, lease_until timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'midan_queue'
AS $function$
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN ('extract','verify_media','plan') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 3 OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN RAISE EXCEPTION 'invalid_claim_parameters' USING ERRCODE='22023'; END IF;
 RETURN QUERY WITH chosen AS (
 SELECT j.job_id FROM midan_queue.processing_jobs j JOIN midan_queue.source_candidates c ON c.source_key=j.source_key
 WHERE j.kind=p_kind AND NOT EXISTS(SELECT 1 FROM midan_queue.media_job_inputs_v1 m WHERE m.job_id=j.job_id) AND c.state='pending' AND j.attempts<3 AND ((j.state IN ('pending','retry') AND j.available_at<=statement_timestamp()) OR (j.state='leased' AND j.lease_until<=statement_timestamp()))
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
 WHERE j.job_id=p_job_id AND NOT EXISTS(SELECT 1 FROM midan_queue.media_job_inputs_v1 m WHERE m.job_id=j.job_id) AND j.state='leased' AND j.lease_token=p_token AND j.lease_until>statement_timestamp() AND EXISTS(SELECT 1 FROM midan_queue.source_candidates c WHERE c.source_key=j.source_key AND c.state='pending');
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
 WITH chosen AS (SELECT j.job_id FROM midan_queue.processing_jobs j WHERE NOT EXISTS(SELECT 1 FROM midan_queue.media_job_inputs_v1 m WHERE m.job_id=j.job_id) AND j.state='leased' AND j.attempts>=3 AND j.lease_until<=statement_timestamp() ORDER BY j.lease_until,j.job_id LIMIT p_limit FOR UPDATE SKIP LOCKED)
 UPDATE midan_queue.processing_jobs j SET state='blocked',lease_token=NULL,lease_until=NULL,last_error='claim_expired_final_attempt',updated_at=statement_timestamp() FROM chosen WHERE j.job_id=chosen.job_id;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $function$;

REVOKE EXECUTE ON FUNCTION midan_queue.enqueue_media_v1(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION midan_queue.claim_media_v1(integer,integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION midan_queue.finish_media_v1(bigint,uuid,boolean,text,integer,integer,integer,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION midan_queue.recover_media_v1(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION midan_queue.commit_extraction_v2(bigint,uuid,text,timestamptz,jsonb,jsonb,jsonb,boolean,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION midan_queue.claim_jobs_v1(text,integer,integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION midan_queue.finish_job_v1(bigint,uuid,boolean,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION midan_queue.recover_exhausted_jobs_v1(integer) FROM PUBLIC;
COMMIT;
