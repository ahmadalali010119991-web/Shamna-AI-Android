-- Production migration applied to midan-al-khabar-media on 2026-11-14.
-- Keep source-only outcomes distinct from confirmed native Telegram videos.
ALTER TABLE public.midan_media_retry_jobs
 DROP CONSTRAINT IF EXISTS midan_media_retry_jobs_state_check;
ALTER TABLE public.midan_media_retry_jobs
 ADD CONSTRAINT midan_media_retry_jobs_state_check
 CHECK (state IN ('pending','leased','completed','dead','source_linked'));
ALTER TABLE public.midan_media_retry_jobs
 ADD COLUMN IF NOT EXISTS source_link_url text;
CREATE OR REPLACE FUNCTION public.midan_retry_link_source(
 p_key text,p_token uuid,p_telegram_message_id bigint,p_source_url text
) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp
AS $$
DECLARE n integer; current_source text;
BEGIN
 IF p_telegram_message_id IS NULL OR p_telegram_message_id<1 OR p_source_url IS NULL
    OR p_source_url !~ '^https://t[.]me/[a-zA-Z0-9_]{5,32}/[1-9][0-9]{0,12}$'
 THEN RAISE EXCEPTION 'INVALID_ORIGINAL_SOURCE_RECEIPT'; END IF;
 SELECT payload->>'source' INTO current_source FROM public.midan_media_retry_jobs
 WHERE job_key=p_key AND state='leased' AND lease_token=p_token
 AND lease_until>now() FOR UPDATE;
 IF NOT FOUND OR current_source IS DISTINCT FROM p_source_url THEN RETURN false; END IF;
 UPDATE public.midan_media_retry_jobs SET
 state='source_linked',payload='{}'::jsonb,source_link_url=p_source_url,
 telegram_message_id=p_telegram_message_id,telegram_file_id=NULL,
 lease_token=NULL,lease_until=NULL,completed_at=now(),updated_at=now(),
 last_error='native_video_unavailable_original_link_confirmed'
 WHERE job_key=p_key AND state='leased' AND lease_token=p_token AND lease_until>now();
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n=1;
END $$;
REVOKE ALL ON FUNCTION public.midan_retry_link_source(text,uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.midan_retry_link_source(text,uuid,bigint,text) TO service_role;