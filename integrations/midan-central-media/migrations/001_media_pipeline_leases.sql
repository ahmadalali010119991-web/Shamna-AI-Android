-- Staged migration only: do not apply to unrelated Supabase projects.
-- Service-role-only RPCs for a per-article lease and compare-and-set state.
CREATE TABLE IF NOT EXISTS public.midan_media_pipeline_jobs (
 article_key text PRIMARY KEY CHECK(length(article_key)=64),
 state jsonb NOT NULL DEFAULT '{}'::jsonb,
 lease_token uuid,
 lease_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.midan_media_pipeline_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.midan_media_pipeline_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.midan_media_pipeline_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.midan_media_claim(p_key text,p_seconds integer DEFAULT 300)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE claimed public.midan_media_pipeline_jobs%ROWTYPE;
BEGIN
 IF p_key !~ '^[a-f0-9]{64}$' OR p_seconds < 30 OR p_seconds > 900 THEN
  RAISE EXCEPTION 'INVALID_CLAIM_ARGUMENTS';
 END IF;
 INSERT INTO public.midan_media_pipeline_jobs(article_key) VALUES(p_key)
 ON CONFLICT(article_key) DO NOTHING;
 UPDATE public.midan_media_pipeline_jobs
 SET lease_token=gen_random_uuid(), lease_until=now()+make_interval(secs=>p_seconds),updated_at=now()
 WHERE article_key=p_key AND (lease_until IS NULL OR lease_until <= now())
 RETURNING * INTO claimed;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('state',claimed.state,'token',claimed.lease_token::text);
END $$;
CREATE OR REPLACE FUNCTION public.midan_media_renew(p_key text,p_token uuid,p_seconds integer DEFAULT 300)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
 IF p_seconds < 30 OR p_seconds > 900 THEN RAISE EXCEPTION 'INVALID_LEASE_SECONDS'; END IF;
 UPDATE public.midan_media_pipeline_jobs
 SET lease_until=now()+make_interval(secs=>p_seconds),updated_at=now()
 WHERE article_key=p_key AND lease_token=p_token AND lease_until>now();
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n=1;
END $$;
CREATE OR REPLACE FUNCTION public.midan_media_save(p_key text,p_token uuid,p_state jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
 IF p_state IS NULL OR jsonb_typeof(p_state)<>'object' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
 UPDATE public.midan_media_pipeline_jobs
 SET state=p_state,updated_at=now()
 WHERE article_key=p_key AND lease_token=p_token AND lease_until>now();
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n=1;
END $$;
CREATE OR REPLACE FUNCTION public.midan_media_release(p_key text,p_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
 UPDATE public.midan_media_pipeline_jobs SET lease_token=NULL,lease_until=NULL,updated_at=now()
 WHERE article_key=p_key AND lease_token=p_token;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n=1;
END $$;
REVOKE ALL ON FUNCTION public.midan_media_claim(text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.midan_media_renew(text,uuid,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.midan_media_save(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.midan_media_release(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.midan_media_claim(text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.midan_media_renew(text,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.midan_media_save(text,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.midan_media_release(text,uuid) TO service_role;
