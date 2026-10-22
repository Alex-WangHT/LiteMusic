import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import player from '../src/local-player.mjs';
import { remotePlaylist } from './remote-playlist.mjs';
const petRoot = path.resolve(process.env.LITEMUSIC_PET_ROOT || fileURLToPath(new URL('../pet/', import.meta.url)));

const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/client.js', ['client.js', 'text/javascript; charset=utf-8']],
  ['/playback-modes.mjs', ['playback-modes.mjs', 'text/javascript; charset=utf-8']],

  ['/video-input.mjs', ['video-input.mjs', 'text/javascript; charset=utf-8']],
  ['/errors.mjs', ['errors.mjs', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);
const assets = {
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (process.env.LITEPLAYER_PET === '1' && pathname.startsWith('/pet/')) {
      const asset = pathname.startsWith('/pet/assets/');
      const root = path.join(petRoot, asset ? 'assets' : 'music-shell');
      const relative = decodeURIComponent(pathname.slice(asset ? 12 : 5)) || 'pet.html';
      const target = path.resolve(root, relative);
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.moc3': 'application/octet-stream' };
      if (!target.startsWith(root + path.sep) || !types[path.extname(target)]) return new Response('Not found', { status: 404 });
      try { return new Response(await readFile(target), { headers: { 'Content-Type': types[path.extname(target)], 'Cache-Control': 'no-store' } }); }
      catch { return new Response('Not found', { status: 404 }); }
    }
    const file = files.get(new URL(request.url).pathname);
    if (!file) return new Response('Not found', { status: 404 });
    const body = await readFile(new URL(`../public/${file[0]}`, import.meta.url));
    return new Response(body, { headers: { 'Content-Type': file[1], 'Cache-Control': 'no-store' } });
  },
};
const port = Number(process.env.PORT || 8787);
export const server = createServer(async (incoming, outgoing) => {
  const controller = new AbortController();
  outgoing.on('close', () => { if (!outgoing.writableFinished) controller.abort(); });
  try {
    const init = { method: incoming.method, headers: incoming.headers, signal: controller.signal };
    if (!['GET', 'HEAD'].includes(incoming.method)) { init.body = incoming; init.duplex = 'half'; }
    const request = new Request(new URL(incoming.url, `http://127.0.0.1:${port}`), init);
    const response = new URL(request.url).pathname === '/api/playlist' ? await remotePlaylist(request) : await player.fetch(request, { assets });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) await pipeline(Readable.fromWeb(response.body), outgoing);
    else outgoing.end();
  } catch (error) {
    if (controller.signal.aborted) return;
    console.error('Local request failed:', error);
    if (!outgoing.headersSent) {
      outgoing.writeHead(error.status || 500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      outgoing.end(JSON.stringify({ error: error.status ? error.message : '本地服务请求失败，请查看终端日志' }));
    } else outgoing.destroy();
  }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? `端口 ${port} 已被占用，请停止旧的本地服务后重试，或设置 PORT 使用其他端口。`
    : error);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`LitePlayer: http://127.0.0.1:${port} (Node local runtime)`));
