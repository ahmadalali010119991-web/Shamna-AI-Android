# ميدان الخبر — تسليم نظام فيديو تيليجرام الأصلي
تاريخ: 12 نوفمبر 2026

## Production
- Vercel project: `dallalna-telegram-bridge` (`prj_oWnZko96P0cvw1FkxAg6ObAXHZAA`)
- Confirmed production deployment: `dpl_DvJvyXsWRXLCnTnA6pm1w8mEuTiU` (READY, live alias verified)
- Immediate rollback deployment: `dpl_63e8dz1mc9qQYVeasRqMDKVmxNMq`
- Production alias: https://dallalna-telegram-bridge.vercel.app
- Source branch: `midan-news-original-photo-20261111`
- Changed deployed source files: `lib/sync-v3-engine.js` and new `lib/news-original-video.js`. All existing 95 files retained (96 total).

## Behavior
1. Intercepts only already-approved outgoing Telegram `sendMessage` news with an explicitly linked original source.
2. Reads public source HTML for video metadata (og:video, Twitter stream, HTML5 video, JSON-LD VideoObject).
3. When a public Telegram channel source explicitly presents video, attempts `copyMessage` to create native channel video with new caption; this does not download any video.
4. Other direct, accessible MP4 source media are fetched with bounded streaming and uploaded via Telegram Bot API `sendVideo`, showing as an in-channel video, not an external preview.
5. Video payload max 46 MiB (under Bot API normal 50 MB limit); video bytes are held temporarily in process memory and dereferenced after the publish attempt. No permanent object-store or local disk copy is written by this module.
6. Captions retain text and a clickable `المصدر` link. Text beyond Telegram's 1,024-character caption constraint is sent as a reply to the posted video.
7. Existing photo, source-link and named activist behavior is unchanged when no usable video is available.
8. For inaccessible/private/unsupported platforms or codecs, native video cannot be guaranteed; original-source fallback is preserved. Do not bypass access controls or assume redistribution permission.

## Testing
- GitHub Actions run: https://github.com/ahmadalali010119991-web/Shamna-AI-Android/actions/runs/43271540721 (successful on rerun)
- Test cases: public Telegram-source copyMessage without download; native MP4 video upload; text-only original; inaccessible media fallback; long-caption full-text reply.
- Vercel preview: `dpl_HW4MdBWLRjoHxccN1C45eHYMoUVJ` READY.
- Verified source diff against previous production: only `lib/sync-v3-engine.js` modified + `lib/news-original-video.js` added; no files removed.
- Vercel production: health HTTP 200, configured=true, all channel configuration present.
- Vercel production: status-v2 HTTP 200, state store initialized in Supabase and lastPoll updated.
- Verified that the production alias resolves to `dpl_DvJvyXsWRXLCnTnA6pm1w8mEuTiU`.

## Important verification caveat
Automated tests use a simulated Telegram API. A real news item with an actual source video has NOT been observed successfully posted under the new code yet. Do not claim native video is verified in the live channel without a Telegram message_id and an actual video media object. Inspect runtime logs for `Midan Telegram-origin video copied natively` or `Midan video published natively` and cross-check the channel message. Review any source authorization and rights requirements.

## Next follow-up
- Monitor first approved public video news source and verify Telegram's resulting message_id/video.
- Expand official embed player for same video inside the Midan site/app, separately from the channel-side native upload.
- Keep no-downtime and do not change app APK, Firebase, media provenance, or current Dallalna download links unless specifically necessary.
