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
