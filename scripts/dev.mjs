import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import worker from '../src/bilibili-worker.mjs';
import { createCloudLibrary } from './cloud-library.mjs';
const cloudLibrary = await createCloudLibrary();

const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/client.js', ['client.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);
const assets = {
  async fetch(request) {
    const file = files.get(new URL(request.url).pathname);
    if (!file) return new Response('Not found', { status: 404 });
    const body = await readFile(new URL(`../public/${file[0]}`, import.meta.url));
    return new Response(body, { headers: { 'Content-Type': file[1], 'Cache-Control': 'no-store' } });
  },
};
const port = Number(process.env.PORT || 8787);
const server = createServer(async (incoming, outgoing) => {
  const controller = new AbortController();
  outgoing.on('close', () => { if (!outgoing.writableFinished) controller.abort(); });
  try {
    const init = { method: incoming.method, headers: incoming.headers, signal: controller.signal };
    if (!['GET', 'HEAD'].includes(incoming.method)) { init.body = incoming; init.duplex = 'half'; }
    const request = new Request(new URL(incoming.url, `http://127.0.0.1:${port}`), init);
    const response = new URL(request.url).pathname === '/api/favorites'
      ? await cloudLibrary.fetch(request)
      : await worker.fetch(request, { ASSETS: assets });
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
