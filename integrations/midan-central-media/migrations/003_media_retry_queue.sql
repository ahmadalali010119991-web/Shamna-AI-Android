-- STAGING ONLY. Apply exclusively to the verified production media database after backup.
-- No video bytes stored; completion receipts retained to prevent replay.
CREATE TABLE IF NOT EXISTS public.midan_media_retry_jobs(
 job_key text PRIMARY KEY CHECK(job_key ~ '^[a-f0-9]{64}$'),
 payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(payload)='object'),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','leased','completed','dead')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 run_after timestamptz NOT NULL DEFAULT now(),
 lease_token uuid,lease_until timestamptz,last_error text,
 telegram_message_id bigint,telegram_file_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz);
CREATE INDEX IF NOT EXISTS midan_media_retry_due_idx ON public.midan_media_retry_jobs(run_after,created_at)
 WHERE state IN ('pending','leased');
ALTER TABLE public.midan_media_retry_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.midan_media_retry_jobs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.midan_media_retry_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.midan_retry_enqueue(p_key text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v public.midan_media_retry_jobs%ROWTYPE; created boolean;
BEGIN
 IF p_key !~ '^[a-f0-9]{64}$' OR jsonb_typeof(p_payload)<>'object'
 OR octet_length(p_payload::text)>24000 THEN RAISE EXCEPTION 'INVALID_RETRY_PAYLOAD'; END IF;
 INSERT INTO public.midan_media_retry_jobs(job_key,payload) VALUES(p_key,p_payload)
 ON CONFLICT(job_key) DO NOTHING;
 created:=FOUND;
 SELECT * INTO v FROM public.midan_media_retry_jobs WHERE job_key=p_key;
 IF v.state IN ('pending','leased','dead') AND v.payload IS DISTINCT FROM p_payload THEN
   RAISE EXCEPTION 'RETRY_KEY_PAYLOAD_CONFLICT';
 END IF;
 RETURN jsonb_build_object('accepted',true,'state',v.state,'alreadyExists',NOT created);
END $$;

CREATE OR REPLACE FUNCTION public.midan_retry_claim(p_seconds integer DEFAULT 120)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v public.midan_media_retry_jobs%ROWTYPE;
BEGIN
 IF p_seconds<30 OR p_seconds>600 THEN RAISE EXCEPTION 'INVALID_LEASE_SECONDS'; END IF;
 WITH candidate AS (
 SELECT job_key FROM public.midan_media_retry_jobs
 WHERE (state='pending' AND run_after<=now())
 OR (state='leased' AND lease_until<=now())
 ORDER BY run_after,created_at FOR UPDATE SKIP LOCKED LIMIT 1
 )
 UPDATE public.midan_media_retry_jobs j SET
 state='leased',lease_token=gen_random_uuid(),
 lease_until=now()+make_interval(secs=>p_seconds),
 attempts=attempts+1,updated_at=now()
 FROM candidate c WHERE j.job_key=c.job_key RETURNING j.* INTO v;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('jobKey',v.job_key,'payload',v.payload,'leaseToken',v.lease_token::text,
 'leaseUntil',v.lease_until,'attempts',v.attempts);
END $$;

CREATE OR REPLACE FUNCTION public.midan_retry_renew(p_key text,p_token uuid,p_seconds integer DEFAULT 120)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
 IF p_seconds<30 OR p_seconds>600 THEN RAISE EXCEPTION 'INVALID_LEASE_SECONDS'; END IF;
 UPDATE public.midan_media_retry_jobs
 SET lease_until=now()+make_interval(secs=>p_seconds),updated_at=now()
 WHERE job_key=p_key AND state='leased' AND lease_token=p_token AND lease_until>now();
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n=1;
END $$;

CREATE OR REPLACE FUNCTION public.midan_retry_complete(p_key text,p_token uuid,
 p_telegram_message_id bigint DEFAULT NULL,p_telegram_file_id text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
 IF p_telegram_message_id IS NULL OR p_telegram_message_id<=0 THEN
 RAISE EXCEPTION 'TELEGRAM_RECEIPT_REQUIRED'; END IF;
 UPDATE public.midan_media_retry_jobs
 SET state='completed',payload='{}'::jsonb,lease_token=NULL,lease_until=NULL,
 telegram_message_id=p_telegram_message_id,telegram_file_id=left(p_telegram_file_id,512),
 completed_at=now(),updated_at=now(),last_error=NULL
 WHERE job_key=p_key AND state='leased' AND lease_token=p_token AND lease_until>now();
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n=1;
END $$;

CREATE OR REPLACE FUNCTION public.midan_retry_fail(p_key text,p_token uuid,p_error text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
 UPDATE public.midan_media_retry_jobs
 SET state=CASE WHEN attempts>=8 THEN 'dead' ELSE 'pending' END,
 run_after=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7))::integer)),
 lease_token=NULL,lease_until=NULL,last_error=left(coalesce(p_error,'unknown'),240),updated_at=now()
 WHERE job_key=p_key AND state='leased' AND lease_token=p_token AND lease_until>now();
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n=1;
END $$;

REVOKE ALL ON FUNCTION public.midan_retry_enqueue(text,jsonb),public.midan_retry_claim(integer),
public.midan_retry_renew(text,uuid,integer),public.midan_retry_complete(text,uuid,bigint,text),
public.midan_retry_fail(text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.midan_retry_enqueue(text,jsonb),public.midan_retry_claim(integer),
public.midan_retry_renew(text,uuid,integer),public.midan_retry_complete(text,uuid,bigint,text),
public.midan_retry_fail(text,uuid,text) TO service_role;
-- Do not remove completed receipts before a separate durable publication guard exists.
