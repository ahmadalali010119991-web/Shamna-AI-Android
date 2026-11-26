-- Staging-only export, never authorization to publish. Requires readiness-events-v1.sql.
BEGIN;
CREATE OR REPLACE FUNCTION midan_queue.export_prepared_article_v1(p_source_key text)
 RETURNS TABLE(envelope jsonb, payload_sha256 text)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'midan_queue'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE c midan_queue.source_candidates%ROWTYPE; e midan_queue.candidate_enrichment%ROWTYPE; p midan_queue.candidate_source_payloads%ROWTYPE; r record; body text; data jsonb; article_id text; source_label text; observed_photos jsonb;
BEGIN
 IF p_source_key IS NULL OR length(p_source_key)>1500 THEN RAISE EXCEPTION 'invalid_source_key' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM midan_queue.assess_readiness_v1(p_source_key);
 IF NOT FOUND OR r.state<>'review_required' OR r.photo_count<>r.expected_photos OR r.expected_photos<1 THEN RETURN; END IF;
 SELECT * INTO c FROM midan_queue.source_candidates WHERE source_key=p_source_key;
 SELECT * INTO e FROM midan_queue.candidate_enrichment WHERE source_key=p_source_key;
 SELECT * INTO p FROM midan_queue.candidate_source_payloads WHERE source_key=p_source_key;
 IF c.state<>'pending' OR e.video_required<>0 OR jsonb_array_length(p.video_links_json)<>0 OR abs(extract(epoch FROM e.source_published_at-c.published_at))>3600 THEN RETURN; END IF;
 IF c.source_id='sana' THEN
  IF c.source_key !~ '^sana:[0-9]{6,9}$' OR c.source_url !~ ('^https://(www[.])?sana[.]sy/([a-zA-Z0-9-]+/){1,4}'||split_part(c.source_key,':',2)||'/?$') OR r.expected_photos>=30 THEN RETURN; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(e.images_json) v WHERE v !~ '^https://cdn[.]sananews[.]sy/20[0-9]{2}/[0-9]{2}/[^?#[:space:]]+[.](jpg|jpeg|png|webp)$') THEN RETURN; END IF;
  article_id:='sana-'||split_part(c.source_key,':',2); source_label:='سانا';
 ELSIF c.source_id='aljazeera' THEN
  -- No automatic publisher integration for this source without separate approval.
  RETURN;
 ELSE RETURN;
 END IF;
 SELECT string_agg(v,E'\n\n' ORDER BY ord) INTO body FROM jsonb_array_elements_text(p.paragraphs_json) WITH ORDINALITY z(v,ord);
 IF octet_length(e.title||body)>30000 OR e.paragraph_count+r.photo_count+1>450 OR encode(sha256(convert_to(body,'UTF8')),'hex')<>e.text_sha256 THEN RETURN; END IF;
 SELECT jsonb_agg(jsonb_build_object('url',i.url,'mime',i.mime,'width',i.width,'height',i.height,'verifiedAt',i.updated_at) ORDER BY z.ord) INTO observed_photos
 FROM jsonb_array_elements_text(e.images_json) WITH ORDINALITY z(v,ord)
 JOIN midan_queue.candidate_image_checks i ON i.source_key=c.source_key AND i.url=z.v
 WHERE i.state='available' AND i.http_status IN (200,206) AND i.mime IN ('image/jpeg','image/png','image/webp') AND greatest(i.width,i.height)>=640 AND least(i.width,i.height)>=360 AND i.updated_at>=e.claimed_at;
 IF observed_photos IS NULL OR jsonb_array_length(observed_photos)<>r.expected_photos THEN RETURN; END IF;
 data:=jsonb_build_object('schema',1,'mode','staging_preview','publicationAllowed',false,'sourceKey',c.source_key,'sourceId',c.source_id,'sourceUrl',c.source_url,'id',article_id,'source',source_label,'title',e.title,'publishedAt',e.source_published_at,'category',e.category,'fullText',body,'sourceTextSha256',e.text_sha256,'paragraphs',p.paragraphs_json,'images',e.images_json,'photoProofs',observed_photos,'hasOriginalVideo',false,'sourceMediaKind','photo','blockers',r.blockers);
 RETURN QUERY SELECT data,encode(sha256(convert_to(data::text,'UTF8')),'hex');
END $function$;
REVOKE EXECUTE ON FUNCTION midan_queue.export_prepared_article_v1(text) FROM PUBLIC;
COMMIT;
