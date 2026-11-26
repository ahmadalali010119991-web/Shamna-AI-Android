-- Private audit for existing Supabase historical publication segments. Never a publication authorization.
BEGIN;
CREATE SCHEMA midan_archive_audit_v1;
REVOKE ALL ON SCHEMA midan_archive_audit_v1 FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION midan_archive_audit_v1.manifest()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
WITH seg AS (
 SELECT segment,revision,updated_at,document,
 encode(sha256(convert_to(document::text,'UTF8')),'hex') AS sha,
 CASE WHEN jsonb_typeof(document->'articles')='array' THEN jsonb_array_length(document->'articles') END AS n
 FROM public.midan_publication_segments
), art AS (
 SELECT s.segment, a.value AS a, CASE WHEN a.value->>'channelMessageId' ~ '^[1-9][0-9]{0,14}$' THEN (a.value->>'channelMessageId')::bigint END AS mid
 FROM seg s CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.document->'articles')='array' THEN s.document->'articles' ELSE '[]'::jsonb END) a
), metrics AS (
 SELECT count(*) AS records,count(DISTINCT mid) AS distinct_messages,max(mid) AS highest_message,
 count(*) FILTER(WHERE mid IS NULL) AS invalid_message_ids,
 count(*) FILTER(WHERE mid IS NOT NULL AND mid/100<>segment) AS segment_mismatches,
 count(*) FILTER(WHERE nullif(btrim(a->>'fullText'),'') IS NULL) AS missing_full_text,
 count(*) FILTER(WHERE a->>'hasOriginalVideo'='true') AS video_marked,
 count(*) FILTER(WHERE EXISTS(SELECT 1 FROM public.midan_channel_tombstones t WHERE t.channel_message_id=art.mid OR (nullif(t.article_id,'') IS NOT NULL AND t.article_id=art.a->>'id') OR (nullif(t.source_url,'') IS NOT NULL AND t.source_url=art.a->>'sourceUrl'))) AS tombstone_matches
 FROM art
)
SELECT jsonb_build_object(
 'schema',1,'mode','historical_recovery_audit','publicationAllowed',false,'checkedAt',statement_timestamp(),
 'revision',(SELECT to_jsonb(r) FROM public.midan_feed_revision r WHERE id=1),
 'segments',coalesce((SELECT jsonb_agg(jsonb_build_object('segment',segment,'revision',revision,'updatedAt',updated_at,'count',n,'sha256',sha,'complete',document->'complete','stale',document->'stale') ORDER BY segment) FROM seg),'[]'::jsonb),
 'metrics',(SELECT to_jsonb(metrics) FROM metrics),
 'tombstones',(SELECT jsonb_build_object('count',count(*),'latest',max(removed_at),'sha256',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY channel_message_id),'[]'::jsonb)::text,'UTF8')),'hex')) FROM public.midan_channel_tombstones t),
 'requiredChecks',jsonb_build_array('current_archive_revision','current_channel_tombstones','current_channel_message_verification','freshness','no_duplicate_publication')
);
$function$;
REVOKE ALL ON FUNCTION midan_archive_audit_v1.manifest() FROM PUBLIC, anon, authenticated;
COMMIT;
