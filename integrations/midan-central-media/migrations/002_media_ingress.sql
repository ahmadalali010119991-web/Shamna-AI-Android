-- STAGED ONLY — apply to the verified production datastore, never shamna-kc.
-- 002: durable ingress replay prevention and job admission.
CREATE TABLE IF NOT EXISTS public.midan_media_ingress_nonces(
 nonce text PRIMARY KEY CHECK(nonce ~ '^[A-Za-z0-9_-]{16,80}$'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.midan_media_ingress_jobs(
 article_key text PRIMARY KEY CHECK(article_key ~ '^[a-f0-9]{64}$'),
 event jsonb NOT NULL,
 enqueued_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (jsonb_typeof(event) = 'object')
);
ALTER TABLE public.midan_media_ingress_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.midan_media_ingress_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.midan_media_ingress_nonces,public.midan_media_ingress_jobs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON public.midan_media_ingress_nonces TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.midan_media_ingress_jobs TO service_role;
CREATE OR REPLACE FUNCTION public.midan_media_consume_nonce(p_nonce text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_nonce !~ '^[A-Za-z0-9_-]{16,80}$' THEN RAISE EXCEPTION 'INVALID_NONCE'; END IF;
 INSERT INTO public.midan_media_ingress_nonces(nonce) VALUES(p_nonce) ON CONFLICT DO NOTHING;
 RETURN FOUND;
END $$;
CREATE OR REPLACE FUNCTION public.midan_media_enqueue(p_key text,p_event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE existing jsonb;
BEGIN
 IF p_key !~ '^[a-f0-9]{64}$' OR jsonb_typeof(p_event)<>'object' THEN RAISE EXCEPTION 'INVALID_EVENT'; END IF;
 INSERT INTO public.midan_media_ingress_jobs(article_key,event) VALUES(p_key,p_event)
 ON CONFLICT DO NOTHING;
 IF FOUND THEN RETURN jsonb_build_object('accepted',true,'jobId',p_key,'alreadyExists',false); END IF;
 SELECT event INTO existing FROM public.midan_media_ingress_jobs WHERE article_key=p_key;
 IF existing IS DISTINCT FROM p_event THEN RAISE EXCEPTION 'ARTICLE_KEY_PAYLOAD_CONFLICT'; END IF;
 RETURN jsonb_build_object('accepted',true,'jobId',p_key,'alreadyExists',true);
END $$;
REVOKE ALL ON FUNCTION public.midan_media_consume_nonce(text),public.midan_media_enqueue(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.midan_media_consume_nonce(text),public.midan_media_enqueue(text,jsonb) TO service_role;
-- Nonce retention: schedule periodic delete older than 1 day using approved job runner.
-- TTL must always exceed signature acceptance window; keep 24h unless revised.
-- Writes must be restricted to server-only credentials and monitored for abuse.
