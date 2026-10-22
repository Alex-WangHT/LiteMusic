import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker, parseVideo } from '../src/bilibili-worker.mjs';
const bv = 'BV1EAYszPEP9';
const info = { code: 0, data: { title: '测试', owner: { name: 'UP' }, pages: [{ page: 1, cid: 10, part: '一' }, { page: 2, cid: 20, part: '二' }] } };
function mock(options = {}) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    if (url.includes('/view?')) return Response.json(info);
    if (url.includes('/playurl?')) return Response.json({ code: 0, data: options.noAudio ? {} : { dash: { audio: [{ mimeType: 'audio/mp4', baseUrl: options.source || 'https://a.bilivideo.com/audio.m4s' }] } } });
    return new Response(init.method === 'HEAD' ? null : new Uint8Array([1,2]), { status: options.status || 206, headers: { 'Content-Length': '2', 'Content-Range': 'bytes 0-1/100', 'Accept-Ranges': 'bytes' } });
  };
  return { worker: createWorker(fetcher), calls };
}
test('BV links retain part; arbitrary origins and malformed inputs rejected', () => {
  assert.deepEqual(parseVideo(`https://www.bilibili.com/video/${bv}/?p=2`), { bvid: bv, page: 2 });
  for (const input of ['https://evil.com/video/' + bv, 'https://www.bilibili.com/video/' + bv + '?p=-1', 'av123', 'https://v.douyin.com/123']) assert.throws(() => parseVideo(input));
});
test('metadata exposes parts; unknown part rejected', async () => {
  const { worker } = mock();
  const r = await worker.fetch(new Request(`https://test/api/video?input=${bv}`));
  assert.equal((await r.json()).pages.length, 2);
  assert.equal((await worker.fetch(new Request(`https://test/api/video?input=${encodeURIComponent(`https://www.bilibili.com/video/${bv}?p=3`)}`))).status,404);
});
test('upstream connection failures return a useful network error', async () => {
  const worker = createWorker(async () => { const error = new TypeError('fetch failed'); error.cause = Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' }); throw error; });
  const response = await worker.fetch(new Request(`https://test/api/video?input=${bv}`));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: '无法连接 B 站接口（ECONNREFUSED）' });
});
test('range streams bytes, forwards validators and uses selected cid', async () => {
  const { worker, calls } = mock();
  const r = await worker.fetch(new Request(`https://test/api/audio?bvid=${bv}&p=2`, { headers: { Range: 'bytes=0-1', 'If-Range': 'etag' } }));
  assert.equal(r.status,206); assert.equal(r.headers.get('Content-Range'),'bytes 0-1/100');
  assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[1,2]);
  assert.match(calls[1].url,/cid=20/); assert.equal(calls[2].init.headers.get('Range'),'bytes=0-1');
  assert.equal(calls[2].init.headers.get('If-Range'),'etag');
  assert.ok(calls.every(call => call.init.redirect === 'manual'));
});
test('HEAD has no body and preserves upstream metadata', async () => {
  const { worker } = mock(); const r = await worker.fetch(new Request(`https://test/api/audio?bvid=${bv}`,{ method:'HEAD' }));
  assert.equal(await r.text(),''); assert.equal(r.headers.get('Content-Length'),'2');
});
test('SSRF and restricted videos fail without fetching arbitrary URLs', async () => {
  const { worker, calls } = mock({ source: 'https://127.0.0.1/internal' });
  assert.equal((await worker.fetch(new Request(`https://test/api/audio?bvid=${bv}`))).status,502); assert.equal(calls.length,2);
  const restricted = mock({ noAudio: true }); assert.equal((await restricted.worker.fetch(new Request(`https://test/api/audio?bvid=${bv}`))).status,422);
});
test('range failures retain 416 and assets use binding', async () => {
  const { worker } = mock({ status: 416 });
  assert.equal((await worker.fetch(new Request(`https://test/api/audio?bvid=${bv}`,{ headers:{ Range:'bytes=999-'} }))).status,416);
  assert.equal(await (await worker.fetch(new Request('https://test/'),{ ASSETS:{ fetch:async()=>new Response('page') } })).text(),'page');
  assert.equal((await worker.fetch(new Request('https://test/api/unknown'))).status,404);
});
test('API and CDN redirects are rejected without following Location', async () => {
  const worker = createWorker(async (url, init) => {
    assert.equal(init.redirect, 'manual');
    return new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/private' } });
  });
  assert.equal((await worker.fetch(new Request(`https://test/api/video?input=${bv}`))).status, 502);
  const redirected = mock({ status: 302 });
  assert.equal((await redirected.worker.fetch(new Request(`https://test/api/audio?bvid=${bv}`))).status, 502);
  assert.equal(redirected.calls.length, 3);
});
