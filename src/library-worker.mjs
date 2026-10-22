import { HttpError } from './http.mjs';
import { favorites } from './favorites.mjs';

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    let response;
    try {
      if (url.pathname === '/api/favorites') response = await favorites(request, env, url);
      else if (!['GET', 'HEAD'].includes(request.method)) throw new HttpError(405, '不支持此请求方法');
      else if (url.pathname === '/health') response = Response.json({ ok: true, mode: 'cloud-library' });
      else if (url.pathname === '/api/config') response = Response.json({ mode: 'cloud-library' });
      else if (url.pathname.startsWith('/api/')) throw new HttpError(404, '云端仅提供收藏服务，请在本地播放器中播放');
      else if (env.ASSETS) response = await env.ASSETS.fetch(request);
      else throw new HttpError(404, '页面不存在');
    } catch (error) {
      response = Response.json({ error: error.status ? error.message : '收藏服务暂不可用' }, { status: error.status || 502 });
    }
    const result = new Response(request.method === 'HEAD' ? null : response.body, response);
    result.headers.set('Cache-Control', 'private, no-store');
    result.headers.set('X-Content-Type-Options', 'nosniff');
    result.headers.set('Referrer-Policy', 'no-referrer');
    return result;
  },
};
