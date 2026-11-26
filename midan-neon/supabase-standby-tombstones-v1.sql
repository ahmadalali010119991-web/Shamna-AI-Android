CREATE TABLE midan_standby_v1.historical_tombstones(
 manifest_digest text PRIMARY KEY REFERENCES midan_standby_v1.historical_manifests(digest),
 digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 payload_text text NOT NULL CHECK(octet_length(payload_text) BETWEEN 2 AND 2097152),
 stored_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
ALTER TABLE midan_standby_v1.historical_tombstones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON midan_standby_v1.historical_tombstones FROM PUBLIC,anon,authenticated;
CREATE FUNCTION midan_standby_v1.store_tombstones(p_manifest text,p_text text) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,midan_standby_v1 AS $fn$
DECLARE expected jsonb; d text; j jsonb;
BEGIN
 IF p_text IS NULL OR octet_length(p_text) NOT BETWEEN 2 AND 2097152 THEN RAISE EXCEPTION 'invalid_tombstones_size' USING ERRCODE='22023'; END IF;
 SELECT payload->'tombstones' INTO expected FROM midan_standby_v1.historical_manifests WHERE digest=p_manifest;
 IF expected IS NULL THEN RAISE EXCEPTION 'manifest_missing' USING ERRCODE='22023'; END IF;
 d:=encode(sha256(convert_to(p_text,'UTF8')),'hex');
 IF d IS DISTINCT FROM expected->>'sha256' THEN RAISE EXCEPTION 'tombstone_hash_mismatch' USING ERRCODE='22023'; END IF;
 j:=p_text::jsonb;
 IF jsonb_typeof(j) IS DISTINCT FROM 'array' OR jsonb_array_length(j) IS DISTINCT FROM (expected->>'count')::integer THEN RAISE EXCEPTION 'tombstone_count_mismatch' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(j) t WHERE jsonb_typeof(t) IS DISTINCT FROM 'object' OR coalesce(t->>'channel_message_id','')!~'^[1-9][0-9]{0,14}$' OR nullif(t->>'removed_at','') IS NULL) THEN RAISE EXCEPTION 'invalid_tombstone' USING ERRCODE='22023'; END IF;
 IF (SELECT count(DISTINCT (t->>'channel_message_id')::bigint) FROM jsonb_array_elements(j) t)<>jsonb_array_length(j) THEN RAISE EXCEPTION 'duplicate_tombstone' USING ERRCODE='22023'; END IF;
 INSERT INTO midan_standby_v1.historical_tombstones(manifest_digest,digest,payload_text) VALUES(p_manifest,d,p_text) ON CONFLICT DO NOTHING;
 RETURN EXISTS(SELECT 1 FROM midan_standby_v1.historical_tombstones t WHERE t.manifest_digest=p_manifest AND t.digest=d AND t.payload_text=p_text);
END $fn$;
REVOKE ALL ON FUNCTION midan_standby_v1.store_tombstones(text,text) FROM PUBLIC,anon,authenticated;