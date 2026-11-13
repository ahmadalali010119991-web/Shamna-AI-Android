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
