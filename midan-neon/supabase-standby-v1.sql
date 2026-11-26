CREATE SCHEMA midan_standby_v1;
REVOKE ALL ON SCHEMA midan_standby_v1 FROM PUBLIC,anon,authenticated;
CREATE TABLE midan_standby_v1.historical_manifests(
 digest text PRIMARY KEY CHECK(digest ~ '^[0-9a-f]{64}$'),
 source_revision bigint NOT NULL CHECK(source_revision>0),
 source_updated_at timestamptz NOT NULL,
 checked_at timestamptz NOT NULL,
 payload jsonb NOT NULL CHECK(payload->'publicationAllowed' IS NOT DISTINCT FROM 'false'::jsonb),
 stored_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE TABLE midan_standby_v1.historical_segments(
 manifest_digest text NOT NULL REFERENCES midan_standby_v1.historical_manifests(digest),
 segment integer NOT NULL CHECK(segment BETWEEN 0 AND 1000000),
 digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 payload_text text NOT NULL CHECK(octet_length(payload_text) BETWEEN 1 AND 2097152),
 stored_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 PRIMARY KEY(manifest_digest,segment)
);
ALTER TABLE midan_standby_v1.historical_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE midan_standby_v1.historical_segments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA midan_standby_v1 FROM PUBLIC,anon,authenticated;
CREATE FUNCTION midan_standby_v1.store_manifest(p_text text,p_digest text) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,midan_standby_v1 AS $fn$
DECLARE m jsonb; rev bigint; at timestamptz; observed timestamptz; n int; total bigint;
BEGIN
 IF p_text IS NULL OR octet_length(p_text)>65536 OR p_digest IS NULL OR p_digest!~'^[0-9a-f]{64}$' OR encode(sha256(convert_to(p_text,'UTF8')),'hex')<>p_digest THEN RAISE EXCEPTION 'manifest_hash_mismatch' USING ERRCODE='22023'; END IF;
 m:=p_text::jsonb;
 IF m->>'schema' IS DISTINCT FROM '1' OR m->>'mode' IS DISTINCT FROM 'historical_recovery_audit' OR m->'publicationAllowed' IS DISTINCT FROM 'false'::jsonb OR jsonb_typeof(m->'segments') IS DISTINCT FROM 'array' OR jsonb_typeof(m->'metrics') IS DISTINCT FROM 'object' OR coalesce(m->'tombstones'->>'sha256','')!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_manifest' USING ERRCODE='22023'; END IF;
 rev:=(m->'revision'->>'version')::bigint;at:=(m->'revision'->>'updated_at')::timestamptz;observed:=(m->>'checkedAt')::timestamptz;
 IF rev IS NULL OR rev<=0 OR at IS NULL OR observed IS NULL OR at>observed OR observed>statement_timestamp()+interval '1 minute' OR jsonb_array_length(m->'segments') NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'invalid_revision' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(m->'segments') s WHERE coalesce(s->>'sha256','')!~'^[0-9a-f]{64}$' OR coalesce(s->>'segment','')!~'^[0-9]{1,6}$' OR coalesce(s->>'count','')!~'^[0-9]{1,6}$') THEN RAISE EXCEPTION 'invalid_segment' USING ERRCODE='22023'; END IF;
 SELECT count(DISTINCT (s->>'segment')::int),sum((s->>'count')::bigint) INTO n,total FROM jsonb_array_elements(m->'segments') s;
 IF n<>jsonb_array_length(m->'segments') OR total IS DISTINCT FROM (m->'metrics'->>'records')::bigint THEN RAISE EXCEPTION 'manifest_count_mismatch' USING ERRCODE='22023'; END IF;
 INSERT INTO midan_standby_v1.historical_manifests(digest,source_revision,source_updated_at,checked_at,payload) VALUES(p_digest,rev,at,observed,m) ON CONFLICT DO NOTHING;
 RETURN EXISTS(SELECT 1 FROM midan_standby_v1.historical_manifests t WHERE t.digest=p_digest AND t.payload=m);
END $fn$;
CREATE FUNCTION midan_standby_v1.store_segment(p_manifest text,p_segment integer,p_text text) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,midan_standby_v1 AS $fn$
DECLARE expected jsonb; d text; j jsonb;
BEGIN
 IF p_text IS NULL OR octet_length(p_text) NOT BETWEEN 1 AND 2097152 THEN RAISE EXCEPTION 'invalid_segment_size' USING ERRCODE='22023'; END IF;
 SELECT s INTO expected FROM midan_standby_v1.historical_manifests m CROSS JOIN LATERAL jsonb_array_elements(m.payload->'segments') s WHERE m.digest=p_manifest AND (s->>'segment')::integer=p_segment;
 IF expected IS NULL THEN RAISE EXCEPTION 'manifest_segment_missing' USING ERRCODE='22023'; END IF;
 d:=encode(sha256(convert_to(p_text,'UTF8')),'hex');
 IF d IS DISTINCT FROM expected->>'sha256' THEN RAISE EXCEPTION 'segment_hash_mismatch' USING ERRCODE='22023'; END IF;
 j:=p_text::jsonb;
 IF jsonb_typeof(j->'articles') IS DISTINCT FROM 'array' OR j->>'segment' IS DISTINCT FROM p_segment::text OR jsonb_array_length(j->'articles') IS DISTINCT FROM (expected->>'count')::integer THEN RAISE EXCEPTION 'segment_shape_mismatch' USING ERRCODE='22023'; END IF;
 INSERT INTO midan_standby_v1.historical_segments(manifest_digest,segment,digest,payload_text) VALUES(p_manifest,p_segment,d,p_text) ON CONFLICT DO NOTHING;
 RETURN EXISTS(SELECT 1 FROM midan_standby_v1.historical_segments s WHERE s.manifest_digest=p_manifest AND s.segment=p_segment AND s.digest=d AND s.payload_text=p_text);
END $fn$;
CREATE FUNCTION midan_standby_v1.status() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,midan_standby_v1 AS $fn$
 SELECT jsonb_build_object('mode','historical_only','publicationAllowed',false,'manifest',m.digest,'sourceRevision',m.source_revision,'sourceUpdatedAt',m.source_updated_at,'expectedSegments',jsonb_array_length(m.payload->'segments'),'storedSegments',(SELECT count(*) FROM midan_standby_v1.historical_segments s WHERE s.manifest_digest=m.digest),'expectedRecords',m.payload->'metrics'->'records','storedRecords',(SELECT coalesce(sum(jsonb_array_length(s.payload_text::jsonb->'articles')),0) FROM midan_standby_v1.historical_segments s WHERE s.manifest_digest=m.digest)) FROM midan_standby_v1.historical_manifests m ORDER BY m.checked_at DESC LIMIT 1
$fn$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA midan_standby_v1 FROM PUBLIC,anon,authenticated;