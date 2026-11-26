-- Tested staging functions; require queue-functions-v1.sql and existing schema.
BEGIN;
CREATE OR REPLACE FUNCTION midan_queue.commit_extraction_v1(p_job_id bigint, p_token uuid, p_title text, p_at timestamp with time zone, p_paragraphs jsonb, p_images jsonb, p_videos jsonb, p_video_required boolean, p_category text, p_text_sha256 text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'midan_queue'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE j midan_queue.processing_jobs%ROWTYPE; c midan_queue.source_candidates%ROWTYPE; fulltext text; h text; st text; n int;
BEGIN
 IF p_title IS NULL OR length(trim(p_title)) NOT BETWEEN 1 AND 600 OR p_at IS NULL OR p_category IS NULL OR length(p_category) NOT BETWEEN 1 AND 100 OR p_video_required IS NULL OR p_text_sha256 IS NULL OR p_text_sha256 !~ '^[0-9a-f]{64}$' OR p_paragraphs IS NULL OR p_images IS NULL OR p_videos IS NULL OR jsonb_typeof(p_paragraphs)<>'array' OR jsonb_typeof(p_images)<>'array' OR jsonb_typeof(p_videos)<>'array' THEN RAISE EXCEPTION 'invalid_extraction' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_paragraphs)>250 OR jsonb_array_length(p_images)>30 OR jsonb_array_length(p_videos)>30 OR octet_length(p_paragraphs::text)>200000 OR octet_length(p_images::text)>65536 OR octet_length(p_videos::text)>65536 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_paragraphs||p_images||p_videos) x WHERE jsonb_typeof(x)<>'string') THEN RAISE EXCEPTION 'invalid_extraction_shape' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_images||p_videos) u WHERE length(u)>2048 OR u NOT LIKE 'https://%') OR (SELECT count(DISTINCT x) FROM jsonb_array_elements_text(p_images) x)<>jsonb_array_length(p_images) THEN RAISE EXCEPTION 'invalid_media_reference' USING ERRCODE='22023'; END IF;
 SELECT coalesce(string_agg(v,E'\n\n' ORDER BY ord),'') INTO fulltext FROM jsonb_array_elements_text(p_paragraphs) WITH ORDINALITY z(v,ord);
 IF length(fulltext)>45000 OR encode(sha256(convert_to(fulltext,'UTF8')),'hex')<>p_text_sha256 THEN RAISE EXCEPTION 'text_hash_mismatch' USING ERRCODE='22023'; END IF;
 SELECT * INTO j FROM midan_queue.processing_jobs WHERE job_id=p_job_id AND kind='extract';
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO c FROM midan_queue.source_candidates WHERE source_key=j.source_key FOR UPDATE;
 IF NOT FOUND OR c.state<>'pending' OR c.source_id NOT IN ('sana','aljazeera') THEN RETURN false; END IF;
 SELECT * INTO j FROM midan_queue.processing_jobs WHERE job_id=p_job_id AND kind='extract' FOR UPDATE;
 IF NOT FOUND OR p_token IS NULL OR j.state<>'leased' OR j.lease_token IS DISTINCT FROM p_token OR j.lease_until<=statement_timestamp() THEN RETURN false; END IF;
 h:=encode(sha256(convert_to(jsonb_build_array(c.source_key,c.source_id,c.source_url,c.published_at)::text,'UTF8')),'hex');
 IF j.input_sha256<>h OR abs(extract(epoch FROM p_at-c.published_at))>3600 OR p_at>statement_timestamp()+interval '1 minute' THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM midan_queue.candidate_enrichment e WHERE e.source_key=c.source_key AND e.state NOT IN ('processing','retry')) THEN RETURN false; END IF;
 st:=CASE WHEN length(fulltext)<100 OR jsonb_array_length(p_paragraphs)=0 THEN 'needs_text' WHEN p_video_required OR jsonb_array_length(p_images)=0 THEN 'needs_media' ELSE 'ready_for_review' END;
 INSERT INTO midan_queue.candidate_enrichment(source_key,state,attempts,claimed_at,updated_at,title,source_published_at,paragraph_count,text_chars,text_sha256,images_json,video_required,category,error)
 VALUES(c.source_key,st,j.attempts,j.created_at,statement_timestamp(),p_title,p_at,jsonb_array_length(p_paragraphs),length(fulltext),p_text_sha256,p_images,p_video_required::integer,p_category,NULL)
 ON CONFLICT(source_key) DO UPDATE SET state=excluded.state,attempts=excluded.attempts,claimed_at=excluded.claimed_at,updated_at=excluded.updated_at,title=excluded.title,source_published_at=excluded.source_published_at,paragraph_count=excluded.paragraph_count,text_chars=excluded.text_chars,text_sha256=excluded.text_sha256,images_json=excluded.images_json,video_required=excluded.video_required,category=excluded.category,error=NULL WHERE midan_queue.candidate_enrichment.state IN ('processing','retry');
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'extraction_conflict'; END IF;
 INSERT INTO midan_queue.candidate_source_payloads(source_key,paragraphs_json,collected_at,video_links_json) VALUES(c.source_key,p_paragraphs,statement_timestamp(),p_videos) ON CONFLICT(source_key) DO UPDATE SET paragraphs_json=excluded.paragraphs_json,collected_at=excluded.collected_at,video_links_json=excluded.video_links_json;
 IF st IN ('ready_for_review','needs_media') THEN
 INSERT INTO midan_queue.candidate_image_checks(source_key,url,state) SELECT c.source_key,v,'pending' FROM jsonb_array_elements_text(p_images) v ON CONFLICT(source_key,url) DO NOTHING;
 END IF;
 UPDATE midan_queue.processing_jobs SET state='done',lease_token=NULL,lease_until=NULL,updated_at=statement_timestamp(),last_error=NULL WHERE job_id=j.job_id;
 RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION midan_queue.enqueue_extract_v1(p_source_key text, p_priority smallint DEFAULT 0)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'midan_queue'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE c midan_queue.source_candidates%ROWTYPE; h text; j bigint;
BEGIN
 IF p_source_key IS NULL OR length(p_source_key)>1500 OR p_priority IS NULL OR p_priority NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'invalid_enqueue_parameters' USING ERRCODE='22023'; END IF;
 SELECT * INTO c FROM midan_queue.source_candidates WHERE source_key=p_source_key FOR UPDATE;
 IF NOT FOUND OR c.state<>'pending' OR c.source_id NOT IN ('sana','aljazeera') OR c.published_at<statement_timestamp()-interval '6 hours' OR c.published_at>statement_timestamp()+interval '1 minute' THEN RETURN NULL; END IF;
 IF c.source_id='sana' AND (c.source_key !~ '^sana:[0-9]{6,9}$' OR c.source_url !~ '^https://(www[.])?sana[.]sy/') OR c.source_id='aljazeera' AND (c.source_key NOT LIKE 'aljazeera:/%' OR c.source_url !~ '^https://(www[.])?aljazeera[.]net/') THEN RETURN NULL; END IF;
 h:=encode(sha256(convert_to(jsonb_build_array(c.source_key,c.source_id,c.source_url,c.published_at)::text,'UTF8')),'hex');
 INSERT INTO midan_queue.processing_jobs(source_key,kind,input_sha256,priority) VALUES(c.source_key,'extract',h,p_priority) ON CONFLICT(source_key,kind,input_sha256) DO NOTHING RETURNING job_id INTO j;
 IF j IS NULL THEN SELECT job_id INTO j FROM midan_queue.processing_jobs WHERE source_key=c.source_key AND kind='extract' AND input_sha256=h; END IF;
 RETURN j;
END $function$;
REVOKE EXECUTE ON FUNCTION midan_queue.enqueue_extract_v1(text,smallint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION midan_queue.commit_extraction_v1(bigint,uuid,text,timestamptz,jsonb,jsonb,jsonb,boolean,text,text) FROM PUBLIC;
COMMIT;
