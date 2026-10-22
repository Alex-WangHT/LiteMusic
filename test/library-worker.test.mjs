import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import worker from '../src/library-worker.mjs';

test('cloud library stores BV parts privately and exposes no video or audio API', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(await readFile(new URL('../stream-migrations/0001_favorites.sql', import.meta.url), 'utf8'));
  const env = { DB: { prepare(sql) { return { bind(...args) { return {
    async all() { return { results: sqlite.prepare(sql).all(...args) }; },
    async run() { return sqlite.prepare(sql).run(...args); },
  }; } }; } } };
  const key = 'lp_' + 'a'.repeat(64), otherKey = 'lp_' + 'b'.repeat(64);
  async function send(method = 'GET', body, token = key) {
    return worker.fetch(new Request('https://library/api/favorites', {
      method, headers: { Authorization: `Bearer ${token}` }, ...(body ? { body: JSON.stringify(body) } : {}),
    }), env);
  }
  try {
    for (const path of ['/api/video?input=BV1zNGhzeEK4', '/api/audio?bvid=BV1zNGhzeEK4']) {
      assert.equal((await worker.fetch(new Request('https://library' + path), env)).status, 404);
    }
    assert.deepEqual(await (await worker.fetch(new Request('https://library/api/config'), env)).json(), { mode: 'cloud-library' });
    assert.equal((await send('GET', undefined, '')).status, 401);
    const item = { input: 'https://www.bilibili.com/video/BV1zNGhzeEK4/?p=2', title: '测试收藏' };
    assert.equal((await send('POST', item)).status, 201);
    assert.equal((await send('POST', { input: item.input })).status, 201);
    const saved = (await (await send()).json()).favorites;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].page, 2);
    assert.equal(saved[0].title, '测试收藏');
    assert.equal('owner_hash' in saved[0], false);
    assert.deepEqual((await (await send('GET', undefined, otherKey)).json()).favorites, []);
    assert.equal((await send('DELETE', { bvid: saved[0].bvid, page: 2 }, otherKey)).status, 200);
    assert.equal((await (await send()).json()).favorites.length, 1);
    assert.equal((await send('DELETE', { bvid: saved[0].bvid, page: 2 })).status, 200);
    assert.deepEqual((await (await send()).json()).favorites, []);
  } finally { sqlite.close(); }
});
