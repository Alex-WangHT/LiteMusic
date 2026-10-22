const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
(async () => {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'test-results', 'desktop'); await fs.mkdir(output, { recursive: true });
  const profile = await fs.mkdtemp(path.join(output, 'profile-'));
  const petRoot = path.resolve(process.env.LITEMUSIC_PET_ROOT || path.join(root, 'pet'));
  const env = { ...process.env, PET_PORT: '18790', PET_PROFILE: profile, LITEMUSIC_CLIENT_ROOT: root }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ ...(process.env.PET_EXECUTABLE ? { executablePath: process.env.PET_EXECUTABLE } : {}), args: process.env.PET_EXECUTABLE ? [] : [path.join(petRoot, 'music-shell/main.cjs')], env, timeout: 30000 });
  let releaseMetadata = () => {};
  try {
    await app.firstWindow(); let pet, player;
    for (let index = 0; index < 300; index++) {
      pet = app.windows().find(page => page.url().endsWith('/pet/'));
      player = app.windows().find(page => /:18790\/$/.test(page.url()));
      if (pet && player) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(pet && player);
    // The playlist service is mocked; Bilibili audio requests remain real.
    let remote = [];
    await player.route('**/api/playlist', async route => {
      const request = route.request(), body = request.postDataJSON();
      if (request.method() === 'POST') {
        const bvid = body.bvid || body.input, page = body.page || 1;
        const existing = remote.find(item => item.bvid === bvid && item.page === page);
        if (existing) Object.assign(existing, body); else remote.push({ bvid, page, title: body.title || bvid });
      }
      if (request.method() === 'DELETE') remote = remote.filter(item => item.bvid !== body.bvid || item.page !== body.page);
      await route.fulfill({ json: request.method() === 'GET' ? { favorites: remote } : { ok: true } });
    });
    await player.locator('#cloud-key').fill('lp_' + 'a'.repeat(64));
    await player.locator('#connection-form button').click();
    const errors = [], requests = [];
    for (const page of [pet, player]) page.on('pageerror', error => errors.push(error.message));
    player.on('request', request => requests.push(new URL(request.url()).pathname));
    await pet.getByRole('button', { name: '播放列表和 BV 添加', exact: true }).click();
    await player.getByText('播放列表为空，点击“添加 BV”开始。', { exact: true }).waitFor();
    assert.deepEqual(await pet.evaluate(() => ({ width: innerWidth, height: innerHeight })), { width: 240, height: 340 });
    const metadataGate = new Promise(resolve => { releaseMetadata = resolve; }); let hold = true;
    await player.route('**/api/video?*', async route => { if (hold) await metadataGate; await route.continue(); });
    const firstMetadata = player.waitForRequest(request => request.url().includes('/api/video?'));
    for (const [index, bv] of ['BV1zNGhzeEK4', 'BV1zNGhzeEK4', 'BV17x411w7KC'].entries()) {
      await player.getByRole('button', { name: '＋ 添加 BV', exact: true }).click();
      await player.getByRole('textbox', { name: 'BV 号或视频链接' }).fill(bv);
      await player.getByRole('button', { name: '添加到列表', exact: true }).click();
      await player.locator('.queue-row').filter({ hasText: bv }).waitFor();
      await player.waitForFunction(() => !document.querySelector('#add-bv').open);
      if (index === 0) {
        await firstMetadata;
        assert.equal(await player.evaluate(() => localStorage.getItem('liteplayer-local-playlist')), null);
        hold = false; releaseMetadata();
      }
    }
    assert.equal(await player.locator('.queue-row').count(), 2);
    await player.locator('.queue-row').filter({ hasText: 'BV1zNGhzeEK4' }).locator('.queue-play').click();
    await player.waitForFunction(() => !document.querySelector('audio').paused && document.querySelector('audio').currentTime > 0);
    await pet.getByRole('button', { name: '暂停', exact: true }).click();
    await player.waitForFunction(() => document.querySelector('audio').paused);
    await pet.getByRole('button', { name: '播放模式：顺序', exact: true }).click();
    await pet.getByRole('button', { name: '下一首', exact: true }).click();
    await player.waitForFunction(() => document.querySelector('#source').href.includes('BV17x411w7KC') && !document.querySelector('audio').paused && document.querySelector('audio').currentTime > 0);
    await pet.getByRole('button', { name: '上一首', exact: true }).click();
    await player.waitForFunction(() => document.querySelector('#source').href.includes('BV1zNGhzeEK4') && !document.querySelector('audio').paused && document.querySelector('audio').currentTime > 0);
    await pet.getByRole('button', { name: '暂停', exact: true }).click();
    await player.waitForFunction(() => document.querySelector('audio').paused);
    await pet.screenshot({ path: path.join(output, 'local-pet.png') });
    await player.screenshot({ path: path.join(output, 'local-playlist.png') });
    await player.getByRole('button', { name: '关闭播放列表', exact: true }).click();
    await player.reload();
    await player.locator('.queue-row').nth(1).waitFor();
    await pet.getByRole('button', { name: '播放模式：列表循环', exact: true }).waitFor();
    const start = Date.now();
    await pet.getByRole('button', { name: '播放列表和 BV 添加', exact: true }).click();
    const native = await app.browserWindow(player); assert.equal(await native.evaluate(win => win.isVisible()), true);
    console.log(`PASS: cloud list opens (${Date.now() - start}ms), reloads from remote and does not wait for metadata`);
    assert.ok(requests.filter(route => route.startsWith('/api/')).every(route => ['/api/video', '/api/audio', '/api/config', '/api/playlist'].includes(route)));
    assert.deepEqual(errors, []);
    await player.locator('.queue-row').filter({ hasText: 'BV17x411w7KC' }).locator('.queue-remove').click({ force: true });
    await player.waitForFunction(() => document.querySelectorAll('.queue-row').length === 1);
    assert.equal(await player.evaluate(() => JSON.stringify(localStorage).includes('BV1zNGhzeEK4')), false);
    console.log('PASS: mocked cloud add/delete/duplicate prevention, real audio, previous/next, pause, mode persistence, no local BV persistence');
  } finally { releaseMetadata(); await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
