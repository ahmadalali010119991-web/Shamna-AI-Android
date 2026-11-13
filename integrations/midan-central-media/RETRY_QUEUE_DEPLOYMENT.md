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
