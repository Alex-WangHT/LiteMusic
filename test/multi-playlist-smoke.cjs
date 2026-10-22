const { _electron } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const root = path.resolve(__dirname, '..');
  const worker = (await import('../LiteMusicServer-bilibili-stream/src/library-worker.mjs')).default;
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  for (const name of ['0001_favorites.sql', '0002_playlists.sql']) db.exec(await fs.readFile(path.join(root, 'LiteMusicServer-bilibili-stream/stream-migrations', name), 'utf8'));
  function prepare(sql) {
    let args = [];
    return { bind(...values) { args = values; return this; }, async first() { return db.prepare(sql).get(...args) || null; }, async all() { return { results: db.prepare(sql).all(...args) }; }, async run() { return db.prepare(sql).run(...args); } };
  }
  const bindings = { DB: { prepare, async batch(statements) { return Promise.all(statements.map(s => s.run())); } } };
  const output = path.join(root, 'test-results/multi-playlist');
  await fs.mkdir(output, { recursive: true });
  const profile = await fs.mkdtemp(path.join(output, 'profile-'));
  const env = { ...process.env, PET_PORT: '18790', PET_PROFILE: profile, LITEMUSIC_CLIENT_ROOT: root };
  delete env.ELECTRON_RUN_AS_NODE;
  if (process.env.PET_EXECUTABLE) delete env.LITEMUSIC_CLIENT_ROOT;
  let app;
  try {
    app = await _electron.launch({ ...(process.env.PET_EXECUTABLE ? { executablePath: process.env.PET_EXECUTABLE } : {}), args: process.env.PET_EXECUTABLE ? [] : [path.join(root, 'pet/music-shell/main.cjs')], env, timeout: 30000 });
    await app.firstWindow();
    let player;
    for (let i = 0; i < 100; i++) {
      player = app.windows().find(p => /:18790\/$/.test(p.url()));
      if (player) break;
      await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(player, 'player window exists');
    await player.waitForLoadState('load');
    const errors = [];
    player.on('pageerror', e => errors.push(e.message));
    await player.route('**/api/playlist?*', async route => {
      const incoming = route.request(), query = new URL(incoming.url()).searchParams;
      const url = new URL(query.get('resource') === 'playlists' ? 'https://test/api/playlists' : 'https://test/api/favorites');
      url.searchParams.set('playlist', query.get('playlist'));
      const response = await worker.fetch(new Request(url, { method: incoming.method(), ...(incoming.postData() ? { body: incoming.postData() } : {}) }), bindings);
      await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
    });
    await player.route('**/api/video?*', route => route.fulfill({ status: 503, json: { error: 'Metadata excluded from playlist test' } }));
    await player.reload({ waitUntil: 'domcontentloaded' });
    await player.waitForFunction(() => document.querySelector('#playlist-select').options.length === 1);
    const native = await app.browserWindow(player);
    await native.evaluate(w => w.show());
    await player.locator('#playlist-name').fill('测试 A');
    await player.locator('#playlist-create').click();
    await player.waitForFunction(() => document.querySelector('#playlist-select').selectedOptions[0]?.textContent === '测试 A');
    const idA = await player.locator('#playlist-select').inputValue();
    await player.locator('#queue-add').click();
    await player.locator('#video-input').fill('BV1zNGhzeEK4');
    await player.locator('#load').click();
    await player.locator('.queue-row').waitFor();
    await player.locator('#playlist-name').fill('测试 B');
    await player.locator('#playlist-create').click();
    await player.waitForFunction(() => document.querySelector('#playlist-select').selectedOptions[0]?.textContent === '测试 B' && !document.querySelector('.queue-row'));
    const idB = await player.locator('#playlist-select').inputValue();
    await player.locator('#playlist-select').selectOption(idA);
    await player.locator('.queue-row').waitFor();
    await player.reload({ waitUntil: 'domcontentloaded' });
    await player.waitForFunction(() => document.querySelector('#playlist-select').options.length === 3);
    await player.locator('#playlist-select').selectOption(idA);
    await player.locator('.queue-row').waitFor();
    await player.locator('.queue-remove').click();
    await player.waitForFunction(() => !document.querySelector('.queue-row'));
    await player.locator('#playlist-select').selectOption(idB);
    await player.waitForFunction(id => document.querySelector('#playlist-select').value === id && !document.querySelector('#load').disabled, idB);
    player.on('dialog', d => d.accept());
    await player.locator('#playlist-delete').click();
    await player.waitForFunction(() => document.querySelector('#playlist-select').options.length === 2);
    assert.deepEqual(errors, []);
    console.log('PASS: Electron startup; real Worker handlers + SQLite; create/switch/isolate/reload/remove/delete playlists; no renderer errors');
  } finally { if (app) await app.close(); db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
