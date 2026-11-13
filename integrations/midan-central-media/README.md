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
