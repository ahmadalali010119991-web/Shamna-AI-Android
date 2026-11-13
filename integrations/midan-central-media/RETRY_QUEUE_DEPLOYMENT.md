# Midan Telegram media retry queue — staged, NOT deployed

Date: 2026-11-13.

## Verified current production blockers
- Bridge project: `dallalna-telegram-bridge` on Vercel.
- Previous Vercel Blob store `dallalna-telegram-bridge-state` is **limits-exceeded-suspended**.
- The current Supabase state Edge Function belongs to an account outside the accessible Supabase connector.
- Authenticated publisher sync has reported `mediaRecovery.skipped=state_write_failed`, with underlying suspended Blob seed failure.
- Existing news publishing must remain live and must not be duplicated.

## Delivered on this feature branch
- `migrations/003_media_retry_queue.sql`: PostgreSQL server-only queue, atomic unique admission, exclusive expiring leases, exponential retry, dead-letter state, completion receipts and payload scrubbing.
- `media-retry-queue.cjs`: Node.js RPC client. Require both Telegram message ID and confirmed native video file ID to complete.
- `media-retry-queue.test.cjs`: isolated test contracts.
- `.github/workflows/midan-media-regression.yml`: executes tests for this change.

## Production acceptance requirements (NOT MET)
1. Select and authorize a writable PostgreSQL database owned by the project. Do not apply this migration to unrelated `shamna-kc` or inaccessible `ftzmeimurgsqzvmcahhs`.
2. Confirm any billing and take a backup before migration. Apply only after reviewing RLS and service role.
3. Provision server-only Supabase credentials to the bridge; never expose secrets to Android, browsers, or logs.
4. Wire the existing `voice-video-first` retry recorder and recovery worker to this queue. Preserve the current news publisher and its independent deduplication state.
5. Disable the *old media retry worker* at the exact switch-over to avoid dual workers. Keep text/photo sync and all channel content untouched.
6. Test duplicate webhook, concurrent claims, expired leases, failed downloads, Telegram native video receipt, ambiguous delivery and rollback in staging, then a verified live message. No automatic repost when Telegram delivery is uncertain.
7. Retain compact completed job receipts against duplicates. Discard temporary video bytes immediately on confirmed delivery or TTL expiry.

**Do not merge or deploy this staging work as though the production media fault is fixed.** Unit tests are mock-backed, not a live database or Telegram delivery test.


## Production status — 2026-11-14

- Supabase project `pjmjhlwwjmtcrtlabpoz` (`midan-al-khabar-media`) created in user-owned Shamna AI organization; `003_media_retry_queue.sql` applied with RLS enabled and no anonymous/authenticated read privileges.
- Supabase Edge gateway `midan-media-retry` deployed with shared-secret request authentication; dedicated sensitive `MIDAN_MEDIA_RETRY_BRIDGE_KEY` stored on Vercel, not exposed to browsers or clients.
- Existing bridge production deployment `dpl_DwEFnLNWCTQiFURD4bgfQ1kqyKBz` activated with `MIDAN_MEDIA_RETRY_ENABLED=true`. Canonical `https://dallalna-telegram-bridge.vercel.app` health and status-v2 returned HTTP 200.
- Authenticated GitHub Actions sync run `43512022828` returned `mediaRecovery.backend=midan-postgres-retry-queue`, scanned=0, failed=0.
- Authenticated production sync `43512368528` exercised a **disposable synthetic, non-channel** failed-video job; Supabase row recorded attempts=1, state=pending, error=`source_video_not_detected: post_not_found`, and a delayed `run_after`. The test row was then deleted, and the database verified empty.
- **This validates the real intake/claim/error-persistence pipeline, not a successful native-video edit.** No real Telegram video message has yet been confirmed repaired by this backend. Do not claim proof of a successful video edit without a Telegram message ID, confirmed video file ID, and verified source correspondence.
- Pre-existing warning from `news-embed-video-buttons` continues to return `HTTP_503` intermittently, also seen on older deployments before the migration. News sync is not blocked by that auxiliary watcher.
- News deduplication remains in the original Supabase state system; only the video-repair queue moved. Roll back promptly by setting the production Vercel environment flag `MIDAN_MEDIA_RETRY_ENABLED=false` and redeploying if a regression occurs.
- Production secret values must never appear in the repository or logs. Retry-completion receipts persist with payload scrubbed; temporary media bytes are not stored in this queue.

## Live verification and clean-up — 2026-11-14

### Native Telegram media delivery and durable receipt: CONFIRMED
- A one-time GitHub-OIDC-authenticated test executed from the existing Vercel Telegram bridge, against the actual `@maydan_alkhabar` channel.
- It created temporary test message **663**, edited that same message to native video using MDN's CC0 flower.mp4, and received a Telegram `video.file_id`.
- The new Supabase queue accepted and claimed the job, and its completion RPC committed the Telegram receipt: `videoConfirmed=true`, `queueStored=true`, `queueCompleted=true`.
- Telegram returned `deleted=true` for message 663 in the same invocation. GitHub Actions run: https://github.com/ahmadalali010119991-web/Shamna-AI-Android/actions/runs/43517960771 — success.
- The disposable completed Supabase row with `telegram_message_id=663` was deleted, and a fresh row count confirmed **0**.
- The temporary QA endpoint was fully removed from production (original `api/push-test.js` restored, `lib/native-telegram-qa.js` absent), and the one-time GitHub workflow step was removed; run https://github.com/ahmadalali010119991-web/Shamna-AI-Android/actions/runs/43518071397 succeeded.
- **Scope:** Confirms actual Telegram media editing and database receipt, but not guaranteed extraction of videos from every third-party media platform, nor a successful real-media retry from this worker for a pre-existing failed news message. Retain original source and licensing restrictions.

### Optional video-watch HTTP 503 hardening
- `news-video-watcher-retry.cjs` preserves the existing watcher and tries a secondary native fetch on HTTP 503, then bounded backoff. Regression run https://github.com/ahmadalali010119991-web/Shamna-AI-Android/actions/runs/43516788878 passed.
- One real production sync (https://github.com/ahmadalali010119991-web/Shamna-AI-Android/actions/runs/43517178203) scanned 60 channel messages without HTTP 503.
- Intermittent HTTP 503 subsequently recurred on minute-based background checks. This is an optional watcher and never blocks news.
- `video-watch-cadence.cjs` runs the watcher in UTC ten-minute windows (or immediately when new articles were sent) while leaving the main engine every-minute publishing and media queue untouched. Regression run `43518633736` passed.
- Final restored production deployment: **`dpl_21mVccwmrN8d537pozAeZhE3BQxB`**, READY at `dallalna-telegram-bridge.vercel.app`. The canonical health and state endpoints both returned HTTP 200.
- Post-rollout GitHub OIDC sync https://github.com/ahmadalali010119991-web/Shamna-AI-Android/actions/runs/43518945765 succeeded. Its watcher response was `skipped:10_minute_window`, while the queue backend remained `midan-postgres-retry-queue` with no job errors.
- **Caveat:** This reduces optional upstream request load; it does not prove that all future upstream HTTP 503 responses have been eliminated. If they recur on the ten-minute window, investigate site API reliability separately.

### Confirmed unchanged
- News publishing, deduplication, original messages, original linked sources, native APK files and Firebase notification configuration were not changed in this rollout.
- The previous news-state Supabase remains the news source of truth; the user-owned `pjmjhlwwjmtcrtlabpoz` database handles the media-repair queue only.
- Restore rollback by targeting deployment `dpl_GKwjdYq6BPboMtARJeSxCt9Rf3y5` (previous working production) if the optional watcher cadence causes regression. The media queue feature flag can be turned off and redeployed separately if needed.
