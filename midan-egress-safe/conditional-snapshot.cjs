'use strict';

// Candidate adapter for the existing four-part publication snapshot API.
// fetchPart(part, version) must use the existing authenticated GET transport.
// All four parts share a global revision. A successful unchanged probe is
// authoritative as of that read; it does not guarantee future freshness.
const VERSION = /^[0-9a-f]{32}$/;
const PARTS = [0, 1, 2, 3];
const validRevision = n => Number.isSafeInteger(n) && n >= 0;
const validVersion = v => typeof v === 'string' && VERSION.test(v);
function validate(part, index) {
  if (!part || part.part !== index || !validRevision(part.revision) || !validVersion(part.version)) {
    throw new Error('live_feed_invalid_part');
  }
  if (part.unchanged === true) return part;
  if ((part.unchanged !== false && part.unchanged !== undefined) ||
      !['segments', 'receipts', 'richArticles'].every(k => Array.isArray(part[k]))) {
    throw new Error('live_feed_invalid_part_rows');
  }
  return part;
}
function coherent(parts) {
  return parts.length === 4 && parts.every((p, i) => p.part === i && p.unchanged !== true &&
    p.version === parts[0].version && p.revision === parts[0].revision);
}
async function readSnapshotParts(fetchPart, cached = null) {
  const get = async (n, version) => validate(await fetchPart(n, version), n);
  const all = () => Promise.all(PARTS.map(n => get(n, null)));
  const usableCache = cached && validVersion(cached.version) && validRevision(cached.revision);
  let parts;
  if (usableCache) {
    const probe = await get(0, cached.version);
    if (probe.unchanged === true) {
      if (probe.version !== cached.version || probe.revision !== cached.revision) {
        throw new Error('live_feed_invalid_unchanged');
      }
      return { unchanged: true, version: cached.version, revision: cached.revision };
    }
    parts = [probe, ...await Promise.all(PARTS.slice(1).map(n => get(n, null)))];
  } else {
    parts = await all();
  }
  // Never combine parts from different revisions; retry at most once.
  if (!coherent(parts)) parts = await all();
  if (!coherent(parts)) throw new Error('live_feed_incoherent_snapshot');
  return { unchanged: false, parts, version: parts[0].version, revision: parts[0].revision };
}
module.exports = { readSnapshotParts };
