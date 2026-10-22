import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const base = process.argv[2] || 'http://127.0.0.1:8789';
const key = 'lp_' + randomBytes(32).toString('hex');
const otherKey = 'lp_' + randomBytes(32).toString('hex');
const item = { bvid: 'BV1zNGhzeEK4', page: 1, title: '遥远的、遥远的、夏的彼方' };
async function send(method = 'GET', body, token = key, extra = {}) {
  return fetch(base + '/api/favorites', {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(40000),
  });
}
try {
  assert.equal((await send('GET', undefined, '')).status, 401);
  assert.equal((await send('POST', item, key, { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await send('POST', { bvid: item.bvid, page: -1 })).status, 400);
  for (let i = 0; i < 2; i++) {
    const r = await send('POST', item);
    assert.equal(r.status, 201, await r.text());
  }
  const saved = await (await send()).json();
  assert.equal(saved.favorites.length, 1);
  assert.equal(saved.favorites[0].bvid, item.bvid);
  assert.equal(saved.favorites[0].title, '遥远的、遥远的、夏的彼方');
  assert.equal('owner_hash' in saved.favorites[0], false);
  assert.equal((await send('POST', { input: `https://www.bilibili.com/video/${item.bvid}/?p=2` })).status, 201);
  assert.equal((await (await send()).json()).favorites.length, 2);
  assert.equal((await send('DELETE', { bvid: item.bvid, page: 2 })).status, 200);
  assert.deepEqual((await (await send('GET', undefined, otherKey)).json()).favorites, []);
  assert.equal((await send('DELETE', item, otherKey)).status, 200);
  assert.equal((await (await send()).json()).favorites.length, 1);
  const head = await send('HEAD'); assert.equal(head.status, 200); assert.equal(await head.text(), '');
  console.log('PASS: save, duplicate prevention, reload, private library isolation, HEAD, input validation and origin check');
} finally {
  const deleted = await send('DELETE', item);
  assert.equal(deleted.status, 200);
  assert.deepEqual((await (await send()).json()).favorites, []);
  console.log('PASS: test favorite removed');
}
