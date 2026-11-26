-- Staging-only diagnostic preview, never authorization to publish.
-- Apply after media-events-v1.sql. Reassess live state and archive before any production handoff.
BEGIN;
CREATE TABLE midan_queue.readiness_preview_v1 (
 source_key text PRIMARY KEY REFERENCES midan_queue.source_candidates(source_key),
 text_sha256 text NOT NULL CHECK(text_sha256 ~ '^[0-9a-f]{64}$'),
 state text NOT NULL CHECK(state IN ('invalid','expired','text_required','media_required','review_required')),
 photo_count integer NOT NULL CHECK(photo_count>=0),
 expected_photos integer NOT NULL CHECK(expected_photos BETWEEN 0 AND 30),
 blockers jsonb NOT NULL CHECK(jsonb_typeof(blockers)='array'),
 assessed_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 CHECK(photo_count<=expected_photos)
);

CREATE OR REPLACE FUNCTION midan_queue.assess_readiness_v1(p_source_key text)
 RETURNS TABLE(state text, photo_count integer, expected_photos integer, blockers jsonb)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'midan_queue'
AS $function$
DECLARE c midan_queue.source_candidates%ROWTYPE; e midan_queue.candidate_enrichment%ROWTYPE; p midan_queue.candidate_source_payloads%ROWTYPE; st text; fulltext text; good int:=0; expected int:=0; reasons jsonb:='[]'; source_label text; chars int; blocks int;
BEGIN
 SELECT * INTO c FROM midan_queue.source_candidates WHERE source_key=p_source_key FOR UPDATE;
 IF NOT FOUND OR c.state<>'pending' OR c.source_id NOT IN ('sana','aljazeera') THEN RETURN; END IF;
 SELECT * INTO e FROM midan_queue.candidate_enrichment WHERE source_key=c.source_key FOR UPDATE;
 IF NOT FOUND OR e.text_sha256 IS NULL OR e.text_sha256 !~ '^[0-9a-f]{64}$' THEN RETURN; END IF;
 SELECT * INTO p FROM midan_queue.candidate_source_payloads WHERE source_key=c.source_key;
 IF NOT FOUND THEN RETURN; END IF;
 st:='invalid';
 IF e.state IN ('ready_for_review','needs_text','needs_media') AND e.title IS NOT NULL AND length(trim(e.title)) BETWEEN 1 AND 600 AND e.images_json IS NOT NULL AND jsonb_typeof(e.images_json)='array' AND jsonb_array_length(e.images_json)<=30 AND e.video_required IN (0,1)
 AND jsonb_array_length(p.paragraphs_json)<=250
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p.paragraphs_json||e.images_json) x WHERE jsonb_typeof(x)<>'string')
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(p.paragraphs_json) v WHERE length(trim(v))=0)
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(e.images_json) v WHERE length(v)>2048 OR v NOT LIKE 'https://%')
 AND (SELECT count(DISTINCT v) FROM jsonb_array_elements_text(e.images_json) v)=jsonb_array_length(e.images_json) THEN
 SELECT coalesce(string_agg(v,E'\n\n' ORDER BY ord),'') INTO fulltext FROM jsonb_array_elements_text(p.paragraphs_json) WITH ORDINALITY z(v,ord);
 IF encode(sha256(convert_to(fulltext,'UTF8')),'hex')=e.text_sha256 AND length(fulltext)=e.text_chars AND jsonb_array_length(p.paragraphs_json)=e.paragraph_count THEN
 expected:=jsonb_array_length(e.images_json);
 SELECT count(*) INTO good FROM jsonb_array_elements_text(e.images_json) v JOIN midan_queue.candidate_image_checks i ON i.source_key=c.source_key AND i.url=v WHERE i.state='available' AND i.mime IN ('image/jpeg','image/png','image/webp','image/gif') AND i.http_status IN (200,206) AND greatest(i.width,i.height)>=640 AND least(i.width,i.height)>=360 AND i.width BETWEEN 1 AND 30000 AND i.height BETWEEN 1 AND 30000;
 source_label:=CASE WHEN c.source_id='sana' THEN 'الوكالة العربية السورية للأنباء (سانا)' ELSE 'الجزيرة نت' END;
 chars:=length(e.title||E'\n'||fulltext||E'\nالمصدر: '||source_label);
 blocks:=1+e.paragraph_count+good+1;
 IF e.source_published_at IS NULL OR e.source_published_at NOT BETWEEN statement_timestamp()-interval '6 hours' AND statement_timestamp()+interval '1 minute' THEN st:='expired'; reasons:='["outside_freshness_window"]';
 ELSIF length(fulltext)<100 OR e.state='needs_text' OR chars>32768 OR blocks>500 THEN st:='text_required'; reasons:='["text_missing_or_rich_limit"]';
 ELSIF e.video_required=1 OR expected=0 OR good<>expected THEN st:='media_required'; IF e.video_required=1 THEN reasons:=reasons||'["native_video_not_verified"]'::jsonb; END IF; IF expected=0 OR good<>expected THEN reasons:=reasons||'["photos_not_all_verified"]'::jsonb; END IF;
 ELSE st:='review_required'; reasons:='["editorial_and_republication_review","generated_title_card_missing","release_approval_required","archive_duplicate_check_required","staging_only"]';
 END IF;
 END IF;
 END IF;
 IF st='invalid' THEN reasons:='["payload_integrity_or_plan_error"]'; END IF;
 INSERT INTO midan_queue.readiness_preview_v1(source_key,text_sha256,state,photo_count,expected_photos,blockers,assessed_at) VALUES(c.source_key,e.text_sha256,st,good,expected,reasons,statement_timestamp())
 ON CONFLICT(source_key) DO UPDATE SET text_sha256=excluded.text_sha256,state=excluded.state,photo_count=excluded.photo_count,expected_photos=excluded.expected_photos,blockers=excluded.blockers,assessed_at=excluded.assessed_at;
 RETURN QUERY SELECT st,good,expected,reasons;
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
 PERFORM midan_queue.assess_readiness_v1(k);
 RETURN true;
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
 PERFORM midan_queue.assess_readiness_v1(m.source_key);
 RETURN true;
END $function$;
REVOKE EXECUTE ON FUNCTION midan_queue.assess_readiness_v1(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION midan_queue.commit_extraction_v2(bigint,uuid,text,timestamptz,jsonb,jsonb,jsonb,boolean,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION midan_queue.finish_media_v1(bigint,uuid,boolean,text,integer,integer,integer,text) FROM PUBLIC;
COMMIT;
