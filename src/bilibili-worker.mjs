import { HttpError } from './http.mjs';
import { parseVideo } from './video-input.mjs';
export { parseVideo } from './video-input.mjs';
async function api(path, params, fetcher) {
  let response, result;
  try {
    // workerd supports only follow/manual; 3xx responses are rejected below.
    response = await fetcher('https://api.bilibili.com' + path + '?' + new URLSearchParams(params), { headers: { Referer: 'https://www.bilibili.com/', 'User-Agent': 'Mozilla/5.0' }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
    if (response.ok) result = await response.json();
  } catch (error) {
    // Keep the browser message actionable without exposing internal URLs or stack traces.
    const cause = error?.cause?.code || error?.cause?.name || error?.name;
    throw new HttpError(502, `无法连接 B 站接口${cause ? `（${cause}）` : ''}`);
  }
  if (!result || result.code !== 0 || !result.data) throw new HttpError(502, 'B 站接口拒绝请求：' + String(result?.message || response.status).slice(0,200));
  return result.data;
}
async function metadata(bvid, fetcher) {
  const data = await api('/x/web-interface/view', { bvid }, fetcher);
  const pages = (data.pages || []).map(p => ({ page: p.page, cid: p.cid, title: p.part, duration: p.duration }));
  if (!pages.length) throw new HttpError(422, '视频没有可播放分 P');
  return { bvid, title: data.title, author: data.owner?.name || '', pages };
}
function trusted(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && ['bilivideo.com','bilivideo.cn','akamaized.net'].some(d => u.hostname.endsWith('.' + d)); } catch { return false; }
}
async function audio(request, bvid, page, fetcher) {
  const video = await metadata(bvid, fetcher), part = video.pages.find(p => p.page === page);
  if (!part) throw new HttpError(404, '分 P 不存在');
  const data = await api('/x/player/playurl', { bvid, cid: String(part.cid), fnval: '16', fnver: '0', fourk: '0' }, fetcher);
  const track = (data.dash?.audio || []).filter(t => (t.mimeType || t.mime_type) === 'audio/mp4').sort((a,b) => (b.bandwidth || 0) - (a.bandwidth || 0))[0];
  if (!track) throw new HttpError(422, '没有公开的独立音轨，视频可能需要登录或受到限制');
  const candidates = [...new Set([track.baseUrl,track.base_url,...(track.backupUrl || track.backup_url || [])].filter(trusted))].slice(0,3);
  const headers = new Headers({ Referer: `https://www.bilibili.com/video/${bvid}/`, 'User-Agent': 'Mozilla/5.0' });
  for (const key of ['Range','If-Range']) if (request.headers.has(key)) headers.set(key, request.headers.get(key));
  for (const candidate of candidates) {
    let upstream;
    try { upstream = await fetcher(candidate, { method: request.method, headers, redirect: 'manual', signal: AbortSignal.timeout(20000) }); } catch { continue; }
    if (![200,206,416].includes(upstream.status) || (request.headers.has('Range') && upstream.status === 200 && request.method === 'GET')) { await upstream.body?.cancel(); continue; }
    const output = new Headers({ 'Content-Type': 'audio/mp4', 'Cache-Control': 'private, no-store' });
    for (const key of ['Content-Length','Content-Range','Accept-Ranges','ETag','Last-Modified']) if (upstream.headers.has(key)) output.set(key, upstream.headers.get(key));
    return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers: output });
  }
  throw new HttpError(502, '音频源暂不可用或不支持该分段请求，请重新获取');
}
export function createWorker(fetcher = fetch) {
  return { async fetch(request, env = {}) {
    let response;
    try {
      const url = new URL(request.url);
      if (url.pathname === '/api/config') response = Response.json({ mode: 'local-player' });
      else if (!['GET','HEAD'].includes(request.method)) throw new HttpError(405, '仅支持 GET / HEAD');
      else if (url.pathname === '/health') response = Response.json({ ok: true, mode: 'bilibili-stream' });
      else if (url.pathname === '/api/video') {
        const { bvid, page } = parseVideo(url.searchParams.get('input'));
        const video = await metadata(bvid, fetcher);
        if (!video.pages.some(p => p.page === page)) throw new HttpError(404, '分 P 不存在');
        response = Response.json({ ...video, page });
      } else if (url.pathname === '/api/audio') {
        const { bvid } = parseVideo(url.searchParams.get('bvid'));
        const page = Number(url.searchParams.get('p') || 1);
        if (!Number.isSafeInteger(page) || page < 1) throw new HttpError(400, '分 P 无效');
        response = await audio(request, bvid, page, fetcher);
      } else if (url.pathname.startsWith('/api/')) throw new HttpError(404, '接口不存在');
      else if (env.ASSETS) response = await env.ASSETS.fetch(request);
      else throw new HttpError(404, '页面不存在');
    } catch (error) { response = Response.json({ error: error.status ? error.message : '服务暂不可用' }, { status: error.status || 502 }); }
    const result = new Response(request.method === 'HEAD' ? null : response.body, response);
    result.headers.set('X-Content-Type-Options','nosniff'); result.headers.set('Referrer-Policy','no-referrer');
    if (new URL(request.url).pathname.startsWith('/api/')) result.headers.set('Cache-Control','private, no-store');
    return result;
  } };
}
export default createWorker();
