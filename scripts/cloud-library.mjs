import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ProxyAgent } from 'undici';
import { HttpError, readJson, bearer } from '../src/http.mjs';

export async function createCloudLibrary() {
  const base = new URL(process.env.CLOUD_LIBRARY_URL || 'https://liteplayer.alexwang010112.workers.dev');
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname))) throw new Error('CLOUD_LIBRARY_URL 必须使用 HTTPS');
  if (base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('CLOUD_LIBRARY_URL 必须为不带路径和凭据的站点地址');
  let proxy = process.env.CLOUD_PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (!proxy && process.platform === 'win32') {
    try {
      const { stdout } = await promisify(execFile)('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'], { windowsHide: true });
      if (/ProxyEnable\s+REG_DWORD\s+0x1\b/.test(stdout)) {
        const value = /ProxyServer\s+REG_SZ\s+([^\r\n]+)/.exec(stdout)?.[1].trim();
        proxy = value?.includes('=') ? /(?:^|;)https=([^;]+)/.exec(value)?.[1] : value;
      }
    } catch { /* Direct connections remain available without a Windows proxy. */ }
  }
  const dispatcher = proxy && proxy !== 'direct' ? new ProxyAgent(proxy.includes('://') ? proxy : `http://${proxy}`) : undefined;
  return {
    async fetch(request) {
      const url = new URL(request.url);
      if (!['GET', 'HEAD', 'POST', 'DELETE'].includes(request.method)) throw new HttpError(405, '不支持此请求方法');
      if (['POST', 'DELETE'].includes(request.method) && request.headers.has('Origin') && request.headers.get('Origin') !== url.origin) throw new HttpError(403, '请从本站操作收藏');
      const key = bearer(request);
      if (!/^lp_[a-f0-9]{64}$/.test(key || '')) throw new HttpError(401, '请设置有效的收藏密钥');
      const headers = { Authorization: `Bearer ${key}` };
      const init = { method: request.method, headers, redirect: 'manual', signal: AbortSignal.timeout(25000), ...(dispatcher ? { dispatcher } : {}) };
      if (['POST', 'DELETE'].includes(request.method)) {
        init.body = JSON.stringify(await readJson(request));
        headers['Content-Type'] = 'application/json';
      }
      let upstream;
      try { upstream = await fetch(new URL('/api/favorites', base), init); }
      catch { throw new HttpError(502, '无法连接云端收藏，请检查网络或 CLOUD_PROXY_URL 代理设置'); }
      if (upstream.status >= 300 && upstream.status < 400) { await upstream.body?.cancel(); throw new HttpError(502, '云端收藏地址发生重定向，请检查配置'); }
      return new Response(upstream.body, { status: upstream.status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' } });
    },
  };
}
