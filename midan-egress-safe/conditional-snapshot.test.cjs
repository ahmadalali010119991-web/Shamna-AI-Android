'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readSnapshotParts } = require('./conditional-snapshot.cjs');
const a = 'a'.repeat(32), b = 'b'.repeat(32), c = 'c'.repeat(32);
const cache = { version: a, revision: 1 };
const full = (part, version = b, revision = 2) => ({ part, version, revision, unchanged: false, segments: [{ segment: part }], receipts: [], richArticles: [] });
const same = (part, version = a, revision = 1) => ({ part, version, revision, unchanged: true });
function transport(handler) {
  const calls = [];
  return { calls, fetch: async (part, version) => { calls.push([part, version]); return handler(part, version, calls.length); } };
}
test('unchanged global version uses exactly one request', async () => {
  const t = transport(n => same(n));
  assert.deepEqual(await readSnapshotParts(t.fetch, cache), { unchanged: true, version: a, revision: 1 });
  assert.deepEqual(t.calls, [[0,a]]);
});
test('cold cache retrieves all four parts', async () => {
  const t = transport(n => full(n));
  assert.equal((await readSnapshotParts(t.fetch)).parts.length, 4);
  assert.deepEqual(t.calls, [[0,null],[1,null],[2,null],[3,null]]);
});
test('changed global revision reuses full probe and reads remaining parts', async () => {
  const t = transport(n => full(n));
  const r = await readSnapshotParts(t.fetch, cache);
  assert.equal(r.version,b); assert.equal(r.revision,2);
  assert.deepEqual(t.calls, [[0,a],[1,null],[2,null],[3,null]]);
});
test('revision drift retries all parts once, returning only coherent data', async () => {
  const t = transport((n,v,i) => i === 1 ? full(n,b,2) : full(n,c,3));
  const r = await readSnapshotParts(t.fetch,cache);
  assert.equal(r.version,c); assert.equal(r.parts.length,4); assert.equal(t.calls.length,8);
});
test('repeated drift fails without returning mixed or stale content as current', async () => {
  const t = transport(n => n === 0 ? full(n,b,2) : full(n,c,3));
  await assert.rejects(readSnapshotParts(t.fetch,cache), /incoherent_snapshot/);
  assert.equal(t.calls.length,8);
});
test('invalid unchanged marker fails closed', async () => {
  const t = transport(n => same(n,b,2));
  await assert.rejects(readSnapshotParts(t.fetch,cache), /invalid_unchanged/);
  assert.equal(t.calls.length,1);
});
test('incorrect part index rejected', async () => {
  const t = transport(n => full(n+1));
  await assert.rejects(readSnapshotParts(t.fetch,cache), /invalid_part/);
});
test('malformed arrays rejected', async () => {
  const t = transport(n => ({...full(n),receipts:null}));
  await assert.rejects(readSnapshotParts(t.fetch,cache), /invalid_part_rows/);
});
test('network error propagates to existing recovery guard; no retry storm', async () => {
  const t = transport(() => { throw new Error('HTTP 503'); });
  await assert.rejects(readSnapshotParts(t.fetch,cache), /HTTP 503/);
  assert.equal(t.calls.length,1);
});
test('invalid local cache cannot cause erroneous unchanged result', async () => {
  const t = transport(n => full(n));
  await readSnapshotParts(t.fetch,{version:a,revision:NaN});
  assert.equal(t.calls.length,4); assert.equal(t.calls[0][1],null);
});
test('unchanged response without valid cache never treated as data', async () => {
  const t = transport(n => same(n));
  await assert.rejects(readSnapshotParts(t.fetch), /incoherent_snapshot/);
  assert.equal(t.calls.length,8);
});
