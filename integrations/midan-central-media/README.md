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
