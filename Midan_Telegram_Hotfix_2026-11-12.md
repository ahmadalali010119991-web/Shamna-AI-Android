# ميدان الخبر — سجل الإصلاح الإنتاجي لبوت تيليجرام (2026-11-12)

## الإصدار الإنتاجي الحالي
- Vercel project: `dallalna-telegram-bridge` (`prj_oWnZko96P0cvw1FkxAg6ObAXHZAA`)
- Final production deployment: `dpl_63e8dz1mc9qQYVeasRqMDKVmxNMq` (READY)
- Prior safe release / immediate rollback: `dpl_Bh9uhH1wD9YN5Nin4ZgJLz1szNaX`
- Prior baseline before media hotfix: `dpl_GTJdiRpv9Zf3BYNs8HJ5KWbgHVBU`
- Canonical domain: `https://dallalna-telegram-bridge.vercel.app`.
- Source branch: `midan-news-original-photo-20261111`
- Media fix source: `telegram-shared/news-original-photo.js`; commit `fd307a6219ca78faee00eaaacb4c8f9b7f2b7330`
- Trusted voice source: `telegram-shared/trusted-voices.js`; installed by `lib/sync-v3-engine.js` in latest Vercel production build.

## Root cause and fix
Before the patch, the Telegram sendMessage wrapper threw on an original image that could not be fetched, repeatedly stalling an already-publishable story. It now attempts to preserve the original image but uses the already-approved, attributed text and original source URL when media fetching fails. Telegram HTTP delivery failures still belong to the existing publisher queue.

After the first media fix was deployed, production runtime logs on 2026-11-12 16:48 UTC showed `Original news photo unavailable; publishing attributed text fallback`, replacing the older repeated blocking error.

The second patch adds a conservative Telegram-message presentation filter for these six named sources:
- عهد الصليبي؛ صهيب الجابر؛ زين العابدين العكيدي؛ صهيب اليعربي؛ أمجد الساري؛ إبراهيم الحبش.

It removes an optional trailing standalone `متداول` or `#متداول` only when a message *explicitly identifies* a listed person as the source. Simply mentioning the name in article text does not authorize attribution changes. Original text, quotes, dates, and claims are otherwise preserved.

## Verification
- First preview: 94 production files, exactly one changed file `lib/news-original-photo.js`, built READY.
- Node mock tests: unavailable image sends Telegram `sendMessage`, valid JPEG sends `sendPhoto` (PASS).
- First production: `dpl_Bh9uhH1wD9YN5Nin4ZgJLz1szNaX`, READY, health HTTP 200, `configured:true`.
- Second preview: 95 files, unchanged 94 except `lib/sync-v3-engine.js`, plus `lib/trusted-voices.js`, built READY.
- Voice source attribution unit tests: PASS.
- Latest production: `dpl_63e8dz1mc9qQYVeasRqMDKVmxNMq`, READY. Health and status-v2 HTTP 200; `configured:true`, Supabase initialized.
- GitHub workflow `midan-telegram-sync.yml` (without the internal space): successful push run `43262196351`.
- Publisher policy CI run `43260388553` succeeded.

## Limitations and next tasks
- An HTTP 200/CI success alone does **not** confirm every article was posted to the Telegram channel. Audit `message_id` receipts against the full news database, and backfill only missing IDs with idempotency guards.
- A dedicated sports tab and strict server-side exclusion from all other sections is **not yet live**.
- The expanded Hasakah/Qamishli/Deir ez-Zor/Raqqa and asylum feeds are **not yet live**; source verification and integration needed.
- The text-label change is active in bot publishing only; it is **not yet applied to all website article/source displays**.
- Roll back via Vercel project deployment rollback to `dpl_Bh9uhH1wD9YN5Nin4ZgJLz1szNaX` if an adverse regression is confirmed.

## Invariants
Do not change Vercel projects, channel, Firebase notifications, website App Links, Dallalna APK URLs, keystores, or existing jobs unless separately required by an independently verified defect.
