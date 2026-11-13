# Midan Central Media Pipeline — staged integration

This feature branch holds a **non-production** media contract and tests. It does not replace the current Vercel Telegram publisher, which is deployed separately from this Android repository. There are no production changes until the site and bot implement their corresponding API handlers and storage.

## Two paths
- Text/photos: site publishes approved article; Telegram bot receives same attributed event and original photos.
- Video: site sends article to the media broker; video must be obtained/validated first, then both website and Telegram are independently published using a shared idempotent article identifier.

## Required components before enabling
1. Authenticated HTTPS event contract between the existing Midan website and the Telegram bridge.
2. Durable relational queue with atomic leases, unique key for (article, destination), retries/backoff, dead-letter monitoring, and reliable completion acknowledgement.
3. Source-specific permitted media adapters; no claim that 100 independent adapters exist.
4. Video upload to durable media hosting with MIME and file-signature checks, CDN playback check, then Telegram Bot API delivery and confirmation.
5. Legacy publisher guard: only disable old route after progressive integration test proves no duplicate posts and no missed articles.
6. Auditable provenance and source links; image is an allowed final fallback only when verified original image exists, all active video routes are exhausted and none is waiting for retry.

Run: `node integrations/midan-central-media/media-contract.test.cjs`.

The full locally-tested integration scaffold is distributed separately; this PR is the version-controlled starting point, not completion of end-to-end integration.


## Durable state implementation added (2026-11-13)
- \`migrations/001_media_pipeline_leases.sql\` defines a service-role-only table and compare-and-set RPC claim/renew/save/release operations. **Not applied to any database.** The accessible Supabase project \`shamna-kc\` is unrelated and inactive; never modify it for this integration.
- \`supabase-lease-store.cjs\` implements \`transaction(key,callback)\` with an exclusive expiring lease and durable checkpoint saves. Only use it on a **server** with an appropriately scoped Supabase service role key.
- The broker calls lease renewal before performing media recovery or delivery. A release is attempted on completion or failure.
- GitHub Actions tests run all contract/handoff/lease cases. These are isolated deterministic tests, **not proof of a live delivery**.

### Production integration gate
1. Identify the **actual** production database/storage for \`dallalna-telegram-bridge\`; do not apply the example migration to an unrelated project.
2. Deploy schema only after backups and reviewing row-level permissions.
3. Wire the website's authenticated new-article event and the bridge's adapters to this store; source adapters must be permitted and verified.
4. Implement destination-side reconciliation: an HTTP timeout after Telegram accepts a send can leave its message ID unknown. No backend lease alone can promise exactly-once delivery against Telegram.
5. Validate one text, one photo, and one video end-to-end in staging; include a source failure and duplicate webhook test.
6. Gradually enable with a feature flag; keep the legacy publisher active until the new pipeline is demonstrably complete, with a clear sole-owner cutoff to prevent dual posting.

### Known limits
- Leases expire, so long-running network operations must renew and ensure ownership. A late response after lease expiry is not an atomic distributed transaction.
- \`recover\` adapters in the staged engine are interfaces only. There is **no production video extractor or 100 independent services** bundled with this branch.
- Until actual Vercel services, credentials, and production store are wired and tested, this code is **not an enabled news publisher**.


## Verified current runtime topology (2026-11-13)
- Existing bridge: \`dallalna-telegram-bridge.vercel.app\`; its \`state-v3.js\` uses a dedicated \`telegram-bridge-state\` Supabase Edge Function with bot-token bearer authentication. It is **not** the unrelated \`shamna-kc\` database visible in the available Supabase connector.
- Existing site: \`midan-al-khabar.vercel.app\`; its \`private-store.js\` persists records through private Vercel Blob. Its \`api/media.js\` is not a trusted event-ingest endpoint for this staged protocol.
- Both current GET probes \`/api/health\` (bridge) and \`/api/news\` (website) returned HTTP 200 when last checked. No POST requests or publication were triggered.
- \`signed-handoff.cjs\` adds an HMAC-SHA256 protocol with a 5-minute clock window and per-request random nonce. Verification requires a **durable, atomic** nonce consumer; an in-memory Set is never adequate for serverless production and is used only in unit tests.
- Signing key and bridge token must remain server-only and must never be printed or embedded in the website frontend.
- The source repository for this PR does **not** contain the existing Vercel production bridge/site deployments. Merging PR #1 alone will not activate the new protocol.

## Signed HTTP ingress and durable admission (staged)
- handoff-http-handler.cjs builds an HTTP POST ingress handler that validates raw-body HMAC signatures, rejects replay, clock skew and tampering, and only acknowledges after durable enqueue.
- ingress-persistence.cjs and migrations/002_media_ingress.sql provide atomic nonce insert and idempotent enqueue on a Supabase Postgres database. Not applied to production.
- An enqueue failure needs a newly signed nonce on the same article key before retrying.
- HTTP middleware must preserve the exact raw request bytes for signature verification.
- Never expose the service-role key or shared signing secret to the browser.
- A queued job is NOT a published news article. Actual site/Telegram publishing, media extraction, and reconciliation require additional production integration.
- These are staged library modules, not deployed HTTP endpoints on either existing Vercel application.

## End-to-end mocked regression
- Run `node integrations/midan-central-media/end-to-end.test.cjs`.
- Uses test-only simulated ingress, queue, media recovery, website and Telegram publishing.
- Covers video, photo and text publication, replays, video recovery, partial Telegram outage and independent destination replay protection.
- **No real Telegram message was sent, no actual video was downloaded, and no deployed Vercel application is modified by this test.**
- Staging rollout requires the actual Vercel project source and production state integration, not only this Android-repository branch.

## Staged real Telegram Bot API transport adapter
- `telegram-bot-publisher.cjs` implements actual HTTPS Bot API request formation for `sendVideo`, `sendPhoto`, and `sendMessage`; it is tested through a mock HTTP transport so nothing is posted to the real channel.
- The adapter only accepts video/photo candidates with `verified:true`. A downloader/validation service must set this after validating the media, **not** based only on a page URL or filename.
- `fileId` must be obtained from a trusted incoming Bot API media message, or an already accessible, validated HTTPS direct media URL must be provided.
- The required `ledger.reserve`, `ledger.markSent`, and `ledger.markUncertain` operations are an *interface*. A production persistent backend and reconciliation process have not been written or deployed.
- Ambiguous post-submission timeouts are frozen as `uncertain` to prevent automatic duplicate posts. Recovery requires reconciling the actual Telegram message ID against records.
- This adapter does not automatically fetch third-party videos, change the existing site, or claim successful live Telegram sending. Do not enable it while the existing sync-v3 publisher owns the channel.

## Source HTML video discovery (staged)
- `official-source-video-discovery.cjs` reads OpenGraph video metadata, Twitter video streams and HTML `<video>`/`<source>` references from explicitly allowlisted news publishers.
- Does not follow redirects, caps HTML response size, and returns candidate links with `verified:false`.
- A separate secure downloader/validator is mandatory before assigning `verified:true`; passing candidate links directly to the Telegram Bot API is forbidden by the staged publisher.
- This is one HTML discovery connector, **not** comprehensive extraction for every social/video site; source authorizations and platform-specific access remain necessary.
- Source pages and video URLs may be inaccessible from the deployment environment; no live publisher extraction is claimed.

## 2026-11-13 verified live video download and staged storage
- NEW: video-download-verify.cjs performs a real bounded HTTPS media download (no redirects), explicit CDN host allowlist, Content-Type validation, MP4/WebM signature checks, byte count, and SHA256 hashing; bad/oversized files fail closed.
- LIVE PREVIEW TEST (no channel posting): https://dallalna-telegram-bridge-qda8ye3ro-ahmadalali010119991-6976.vercel.app/api/health downloaded the openly licensed MDN flower.mp4 and returned 200 with verified=true, video/mp4, size=1128375, SHA256=0cd83d944a6ca7822b4a8306cecc60a36e859b041f6702c6a1ad9ead78924451.
- NEW: verified-video-store.cjs checks the SHA256 again before storage, and requires a trusted HTTPS storage receipt. The configured put callback is an interface, not a live shared media store.
- NEW: source-video-recovery.cjs composes source discovery -> download -> validation -> durable store with candidate fallbacks. It requires explicit source reuse permission and preserves temporary failures for retries.
- All fourteen deterministic GitHub Actions regression groups passed in workflow run https://github.com/ahmadalali010119991-web/Shamna-AI-Android/actions/runs/43438165061.
- The MDN preview demonstrates an actual downloaded binary on a Vercel server. The preview endpoint is a test fixture and does not publish a news item or upload it to shared storage.
- Production channel and website are NOT switched to this staged generic video adapter. Previous direct Source99 photos 6/7 are separate verified live publications.
- All-platform ingestion cannot be represented as universal: each platform needs an authorized access method and source-specific adapter. Social networks with access restrictions cannot be downloaded from a public URL alone.
- Before promoting: configure a server-only approved shared video store, verify read-after-write/playback, wire signed site notification and Telegram delivery, then test media and duplicate reconciliation end-to-end with a real news source.

## 2026-11-13 durable readback and fencing safety
- `verified-video-store.cjs` now requires an independent HEAD/read-after-write confirmation of the exact storage pathname, URL, media size and Content-Type. A successful PUT alone is not a publication acknowledgement.
- `vercel-blob-video-store.cjs` binds this contract to Vercel Blob `put` and `head`, with a backend-only token and an explicit approved public blob hostname. It is tested against the service interface, not a live configured Blob store.
- This adapter requires a PUBLIC media-capable Blob store or separately designed private media relay. The existing private store must not be presumed to return public playback URLs. No new Blob store has been purchased/created or connected.
- `handoff-engine.cjs` now aborts on `ARTICLE_LEASE_LOST` instead of converting lost lease ownership into a recoverable provider error. Stale workers cannot continue to publish after losing their fence.
- GitHub Actions run https://github.com/ahmadalali010119991-web/Shamna-AI-Android/actions/runs/43439110348 passed all regression groups including storage readback and lease fencing.
- Next production gates: verify Blob access policy and shared media delivery, run a real write/read/delete smoke test without publishing, wire a guarded video URL consumer on the site, and use source-specific permitted media ingestion adapters before enabling public automatic video publication.

## Public playback and shared-video handoff, 2026-11-13
- `public-video-playback-check.cjs` checks anonymous HTTP HEAD, matching size/MIME, a `206` response to a byte range request, and video magic bytes; it does not transmit private tokens. This helps ensure both web browsers and Telegram can fetch the same public media.
- A LIVE Vercel STAGING request to https://dallalna-telegram-bridge-p8dia1oqy-ahmadalali010119991-6976.vercel.app/api/health returned HTTP 200 with publiclyPlayable=true for MDN's public-domain flower.mp4 test fixture (1,128,375 bytes). It was not uploaded to the project's Blob store and was not posted as news.
- `source-video-recovery.cjs` now requires `playback.check` before acknowledging a stored media URL. Invalid or inaccessible playback remains a retryable failure rather than publishing corrupted video or automatically replacing it with a photo.
- `video-full-handoff.test.cjs` connects discovery, validated recovery, durable URL, anonymous playback receipt, and independent website/Telegram mock destinations. Proves Telegram retry cannot trigger a second website post, and completed video need not be re-downloaded.
- GitHub Actions run https://github.com/ahmadalali010119991-web/Shamna-AI-Android/actions/runs/43440891822 passed all 17 test groups after these changes.
- Existing production Vercel applications remain unchanged by this stage. Real shared Blob write/read and live video publishing to both destinations are still not verified. This feature branch is NOT the deployed Vercel project source.

## 2026-11-13 suspension diagnosis and Blob-independent route
- Vercel Storage metadata revealed both currently connected Blob stores are **private and suspended** (`status=limits-exceeded-suspended`, `billingState=suspended`, `usageQuotaExceeded=true`). Site: `store_RtmnMmchMuVlfgL4`, bridge: `store_KF89l5yNOWoIrHvH`. They cannot serve as the assumed shared public playback store; no new paid resources were created.
- NEW `direct-video-url-policy.cjs`: allowlisted HTTPS direct file path, no query parameters/expiring signatures, never untrusted webpage URLs. This is a conservative stability heuristic, not a durability guarantee.
- NEW `direct-video-recovery.cjs`: authorized source -> already-discovered direct video -> actual verified binary download -> anonymous playable-source URL. Does not rely on suspended Blob; records `durability:source-dependent` and strips binary bytes from public metadata.
- Live STAGING Vercel test `https://dallalna-telegram-bridge-govrq6vvu-ahmadalali010119991-6976.vercel.app/api/health` returned HTTP 200, verified=true, playable=true and 1,128,375 bytes for MDN's public-license flower.mp4. Media discovery was fixture-driven; download and public playback requests were real. No channel post occurred.
- NEW `handoff-engine.cjs` external-media guard: requires independent `checkExternal` on every outstanding destination send or retry. It freezes a stale/expired URL instead of sending it, and skips destinations already marked sent. When no destination is sent, an invalidated external media URL can be rediscovered next cycle; when one is already sent, cross-destination update needs coordinated replacement.
- GitHub Actions workflow https://github.com/ahmadalali010119991-web/Shamna-AI-Android/actions/runs/43442286551 passed 19 test groups, including source-dependent video expiry and no replay.
- Live news video publication to both site and Telegram is still NOT tested, and generic code is still in a GitHub feature branch rather than wired into the existing production Vercel runtime. The published Source99 photo flow remains independent.

## 2026-11-13 production activation: original video routes and repair of false media candidates
- LIVE SITE deployment `dpl_Fj32SBHLRN1bbiNmJgxJLv3iVEdU` (production): site `api/news.js` branches for `videoFor=private-source99-N`, invokes `lib/private-source99-video.js`, verifies a public Telegram CDN MP4 via HTTP 206 range + ftyp, and returns `{ok:true,kind:'mp4',url}` for the existing `video-inline.js` player. Other news requests use the original route. The site still shows news and Source99 photo posts.
- LIVE BRIDGE deployment `dpl_DwZL2T48dRQgsHnXiaCn8HT3UqjB` (production): updated `lib/news-original-video.js` supports Telegram widget `data-video` / `data-src` and ignores missing video attributes rather than adding the news article URL as a false video candidate. The original native Telegram copyMessage and multipart MP4 routes are preserved, plus Source99 direct media publisher remains installed.
- Source99 publisher previously expanded to extract native Telegram video widget attributes and refuse sending WebM/QuickTime as MP4; the website Source99 resolver is retained as `private-source99-site-video.cjs`, while the bridge video engine is saved in `production-news-original-video.cjs` for recovery.
- GitHub Actions regression run https://github.com/ahmadalali010119991-web/Shamna-AI-Android/actions/runs/43448484398 completed 21 test groups successfully after the generic source video extraction bug was fixed.
- STAGING site positive test https://midan-al-khabar-5pytr4dfq-ahmadalali010119991-6976.vercel.app/api/status validated source99 video metadata using a synthetic MP4 206/ftyp fixture. STAGING bot video parser https://dallalna-telegram-bridge-ovpiegpwk-ahmadalali010119991-6976.vercel.app/api/health confirmed Telegram widget detection and unchanged OpenGraph support.
- Production health checks: bridge /api/health HTTP200 and `telegram.canPost=true`, bridge /api/status-v2 HTTP200 with advancing `news.lastPoll`, site /api/news HTTP200 and 177 returned news items, site /video-inline.js HTTP200.
- Read-only scan of 40 newest trusted source pages found no direct OG/HTML video; further videoFor probes also returned `no_embeddable_video`. Source99 posts 6 and 7 are photos, not video. Therefore do NOT claim a real news video has been successfully posted end-to-end yet.
- Both existing Vercel Blob stores remain private and suspended due to account limits. Direct public media paths avoid these stores but remain source-dependent. Do NOT create chargeable resources or claim multi-platform full coverage without appropriate authorized source adapters.
- To close: test an actual accessible *new, authorized news source video* posted across site + Telegram, verify site playback and channel message video type, then test simulated source outage/retry without duplication. If source platforms require authentication, implement platform-specific approved access rather than scraping inaccessible content.

## 2026-11-13 production CDN MIME fixes (operational)
- Live source verification: Euronews original https://video.euronews.com/mp4/SHD/60/95/21/03/SHD_PYR_6095213_20261112160244.mp4 sends `binary/octet-stream` but its complete **17,102,241-byte** body is valid MP4 (SHA256 017fe4cf90ab8a759468248af94243999db51d4201d3c27e7f1078971d2ec72d). The previous strict MIME check in the preexisting news-video publisher rejected this response before signature validation.
- `video-download-verify.cjs` now allows `binary/octet-stream` and `application/octet-stream` only for a matching video file extension AND verified binary signature; malformed files and HTML are rejected. Staging live original download confirms success.
- Production bridge `dpl_6fgG3N364dJsmUdCR6CfhA6RLHTe` updates the **existing** `news-original-video.js` with an exact MIME allowlist patch, leaving its original 12,201-byte logic intact in `news-original-video-legacy.cjs`. The original underlying production file SHA256 is 37da261bc6e59e031e77dde97e6d82f4bbaff3ade694e3ae81f9d00cf24e274c. The exact existing publisher function `bounded` was tested on real Euronews video from an isolated Vercel preview.
- Production bridge `dpl_DpE9gU6mTQqsT8XGnzgTXSitJaWp` additionally fixes the **existing** Source99 video `mediaBlob` MIME guard. A generic MIME is promoted to `video/mp4` only after positive ftyp detection, with original photo publishing unchanged. Validated on 17,102,241-byte real MP4 in isolated Vercel staging.
- Production bridge health subsequently returned HTTP 200, configured=true, channel administrator and canPost=true; site news API remained HTTP 200. Reusable source and negative cases are tested in CI run https://github.com/ahmadalali010119991-web/Shamna-AI-Android/actions/runs/43461887742 (23 passing test groups).
- This fixes two observed classes of MIME rejection in production. **It is not proof that videos from all platforms can be ingested**, and no new actual news-video channel message or paired website article was created as part of these diagnostic tests. The original source and destination still need to expose a permitted accessible video.
- Suspended private Blob stores remain unsuitable for public durable video URLs; the existing direct/streaming video delivery route is preserved, not replaced with a simulated blob storage claim.

## 2026-11-13 automatic media-retry state and website video playback fixes
- **Confirmed defect:** Existing production `lib/voice-video-first.js` recorded newly failed native-video fallback messages ONLY into the suspended Vercel Blob store (`recordPending` required `BLOB_READ_WRITE_TOKEN`, blob.put). Its `retryPending` already had a Supabase fallback reader but there was NO matching fallback writer. This could permanently lose new pending media repair jobs.
- `voice-video-retry-supabase-compat.cjs` patches ONLY this writer (strict exact anchors). It keeps the original video routes and message-edit retry behavior, but uses the existing Supabase `state-v3` queue `midan_media_video_retries_v4` when Blob is missing/suspended. It performs bounded CAS write attempts, checks read-back, and uses channel/source/target message ID keys to avoid duplicated repair jobs.
- GitHub test `voice-video-retry-supabase-compat.test.cjs` verifies simulated suspended Blob, Supabase persistence, readback, duplicate suppression, failed writes, normal Blob success path and Blob permissions failure.
- **Production bridge deployment:** `dpl_BDCV7gjhAXa5vojBoyvbp3HHLgjB` (READY), retaining original serverless health and previous media publishers. Health returned HTTP 200, bot configured=true, bot administrator, canPost=true, site news remained HTTP 200.
- **Confirmed site gap:** `private-source99-video.js` accepted only `video/mp4` on CDN byte-range responses even when legitimate MP4 CDNs may return `binary/octet-stream`. It already validated the `ftyp` binary signature; generic MIME needed to be allowed only before that existing signature validation.
- `source99-site-video-compat.cjs` adds generic MIME compatibility under the same strict Telegram CDN whitelist/MP4 byte-range signature, and adds a second playback route: the verified original public Telegram post `https://t.me/Private_Source99/<postId>?embed=1` if its direct CDN URL is inaccessible and the **same original post** still has a video marker. No invented media and no reliance on Blob.
- **Production site deployment:** `dpl_APFxyuJzkJFzbiXGsoCUsKVYFzK6` (READY). Staging tested source99 original post embed fallback, existing France24 YouTube embed and unchanged news feed. Production site news remains HTTP 200; original France24 video metadata remains available.
- CI https://github.com/ahmadalali010119991-web/Shamna-AI-Android/actions/runs/43466298119 passed **25 test groups** for these updates.
- **Read-only real-public-channel audit:** among 140 visible posts from the public @maydan_alkhabar channel, message `/496` contained an actual native video and source attribution; more recent France24 messages `/625` and `/637` referenced publisher video pages but had no native video in their Telegram messages, while the corresponding website news video endpoint returned YouTube embeds. This proves why a web embed does not automatically imply a Telegram-native video upload.
- LIMIT: The suspended private Vercel Blob stores remain unusable as public durable media hosts. Non-native publisher embeds (e.g. YouTube/France24 iframe) cannot automatically be converted into an authorized rehostable MP4. Full source-to-both-destinations native-video equivalence for all platforms has NOT been proved; no new public messages were sent to test.

## 2026-11-13 production official embedded-video backlink repair
- Implemented `news-embed-video-buttons.cjs` with independent official-video watch links for existing Telegram posts rather than attempting to misuse an iframe URL as an MP4 upload. Requires exact canonical website/article source match, approved `www.youtube-nocookie.com/embed/{id}` metadata and verified public Telegram original message HTML.
- Existing inline buttons are preserved. A previously modified post is skipped; no duplicate news message is created. The module runs after the original V3 news sync via `sync-embed-video-watcher.cjs`, which retains the complete prior engine byte-for-byte in `sync-v3-engine-legacy.cjs`. Errors in the extra repair task do not interrupt news sync.
- All 27 regression groups passed in GitHub workflow https://github.com/ahmadalali010119991-web/Shamna-AI-Android/actions/runs/43469637651.
- Production bridge deployed READY as `dpl_HUXDChzuVGXKX5Vr9vssDC7mULeJ`; health verified HTTP 200, Telegram bot is channel administrator with `canPost=true`.
- Confirmed actual public Telegram channel post 625 was edited to add **شاهد الفيديو الأصلي** pointing to `https://www.youtube.com/watch?v=pyyVKhsRSDI`, while preserving the existing open-in-Midan button. Confirmed post 637 likewise links `https://www.youtube.com/watch?v=IrSUqa7MHYM`, while keeping the original button. No new messages were posted for the repair.
- This is official VIDEO WATCH LINK functionality, not a Telegram-native video file. Both stories' actual website video metadata are `kind:embed` from the France24/YouTube player, not a publisher-hosted direct MP4. Do not claim native Telegram video upload of these two stories.
- **Outstanding**: authorized source-specific extraction for other platforms where available, and test the full native-video pipeline with a real, newly received post that contains an independently accessible video file. Existing private suspended Vercel Blob stores still cannot provide public durable video storage; alternate original hosted video links remain source-dependent.

## 2026-11-13: temporary media files only — NO long-lived binary storage
- User explicitly confirmed video files only need temporary staging until Telegram native upload, then can be discarded. This is now the production-supported architecture: existing `news-original-video` downloads into `Buffer` for multipart `sendVideo` and clears `media.buffer` in a `finally`; existing `voice-video-first` downloads a bounded in-memory `Blob` and uploads to Telegram. No newly created permanent Blob video archive is required.
- Telegram's own posted native video is the durable delivery artifact for the channel; deleting the message/video **inside Telegram** would also break any website embed that uses it. The transient in-memory copy can be reclaimed immediately after upload; metadata/idempotency state (article/source/message identifier and retry status) must remain.
- ADDED `telegram-native-video-site-fallback.cjs`: the site scans a bounded number of recent public channel pages and accepts an existing native Telegram video only when the exact canonical source URL in that message matches the published news article. Returns `kind: embed`, `transport: telegram_channel`, `https://t.me/maydan_alkhabar/{messageId}?embed=1`. It does not upload or retain a binary video.
- ADDED `article-video-ephemeral-compat.cjs` as a byte-preserving wrapper around the production article-video handler: retains original publisher embeds/direct video and uses the Telegram native-video fallback only when source video discovery fails. Negative metadata caching is reduced to 20 seconds to allow newly published videos to appear.
- ADDED production site `video-inline.js` transport-specific caption and a direct **شاهد الفيديو في تيليجرام** link for a Telegram-hosted video. This is important if an iframe fails to load.
- Production website ready deployment `dpl_4FueWnH5fgmcvVisPLBjuT79raHu` validated HTTP 200, 178 articles, and existing France24 source-video embeds still work. Private Vercel Blob remains suspended, but this workflow does not depend on it.
- ADDED Telegram Source99 receipt validation to `source99-video-mime-compat.cjs`: `sendVideo` requires actual `result.video.file_id`, and `sendPhoto` requires actual photo `file_id`, before marking the source post delivered in persistent once/duplicate guard. That avoids silent success on a message_id alone.
- Production bot ready deployment `dpl_9SVUU9HscBMyPNsrqRoaBzGkyKdM` validated configured=true, canPost=true; channel sync last poll verified and site news API remained live.
- CI https://github.com/ahmadalali010119991-web/Shamna-AI-Android/actions/runs/43479892448 passed all 29 regression groups, including no-storage Telegram site fallback and Source99 actual-file receipt guard.
- Live source-video cross-destination publication remains conditional on an accessible native source video appearing and being delivered; no unrelated test clip was published to the public news channel. A bounded recent-channel scan is not a replacement for a permanent lightweight article/message metadata mapping. Supports publicly accessible and permitted media, NOT every access-restricted platform.

## 2026-11-13: duplicate/retry race-condition audit
- Tested idempotency and delayed repair recording with simultaneous attempts, not only consecutive attempts. GitHub Actions run https://github.com/ahmadalali010119991-web/Shamna-AI-Android/actions/runs/43482093826 PASSED all 29 groups. The exercised mock enforces revision comparison and deliberately interleaves distinct writes to cause an actual conflict; retry retains both entries and repeat requests for the same job do not add another.
- Identified an actual bug in the existing Blob->Supabase fallback: it performed state.read, then state.write; state.write performs a SECOND read and could overwrite another worker's changes. The fix calls `state.call('write', key, data, {expected_updated_at: previous?.updated_at ?? null})` directly with the first read revision. A conflict is retried with a new read, up to five times, and claims success only after a readback confirms its job.
- CI verifies storage failure, rejected write, readback, two distinct concurrent jobs, repeated same-job enqueue, and original Blob-success behavior.
- Staging deployment `dpl_E7H2wmjBTHfRLCnjt9ToxNW5tCdx` built READY and imported original publisher/exported functions safely. Production bridge deployed as `dpl_8NL9GzkU58XtHdE91nnXq7iNCLWS` (READY). Production health returned HTTP 200 with Telegram administrator `canPost=true`; status-v2 showed working news poll and site returned HTTP 200.
- **Validation boundary:** Supabase connector for project `ftzmeimurgsqzvmcahhs` returned permission denied on list_tables. No isolated live Supabase write/readback test was performed. The current test is a deterministic CAS simulation, not proof that Supabase production conflict behavior matches every edge case. Since no test-only messages were sent, actual Telegram duplicate publication was NOT induced to avoid spam. Mark full live-state assurance pending connector authorization/authorized test endpoint.
