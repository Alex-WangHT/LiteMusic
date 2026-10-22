import { fetch, ProxyAgent } from 'undici';
import { execFileSync } from 'node:child_process';

let proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (!proxy && process.platform === 'win32') {
  try {
    const settings = execFileSync('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'], { encoding: 'utf8', windowsHide: true });
    if (/ProxyEnable\s+REG_DWORD\s+0x1/.test(settings)) {
      const address = settings.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/)?.[1].trim();
      if (address && !address.includes('=')) proxy = `http://${address}`;
    }
  } catch {}
}
const dispatcher = proxy ? new ProxyAgent(proxy) : undefined;
export async function remotePlaylist(request) {
  if (!['GET', 'POST', 'DELETE'].includes(request.method)) return Response.json({ error: '不支持的请求方式' }, { status: 405 });
  try {
    const endpoint = new URL(request.headers.get('X-Playlist-API'));
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) throw new Error('请填写 HTTPS 云端服务根地址');
    const body = request.method === 'GET' ? undefined : await request.text();
    if (body && body.length > 16384) throw new Error('请求内容过长');
    const query = new URL(request.url).searchParams;
    const target = new URL(query.get('resource') === 'playlists' ? '/api/playlists' : '/api/favorites', endpoint);
    if (query.has('playlist')) target.searchParams.set('playlist', query.get('playlist'));
    const response = await fetch(target, { method: request.method, headers: { 'Content-Type': 'application/json' }, body, dispatcher, redirect: 'error', signal: AbortSignal.timeout(20000) });
    return new Response(await response.text(), { status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error.message || '云端同步失败' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
