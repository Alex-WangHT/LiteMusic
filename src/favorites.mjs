import { HttpError, readJson, bearer, hash } from './http.mjs';
import { parseVideo } from './video-input.mjs';
export async function favorites(request, env, url) {
  if (!['GET', 'HEAD', 'POST', 'DELETE'].includes(request.method)) throw new HttpError(405, '收藏接口仅支持 GET / HEAD / POST / DELETE');
  if (['POST', 'DELETE'].includes(request.method) && request.headers.has('Origin') && request.headers.get('Origin') !== url.origin) throw new HttpError(403, '请从本站操作收藏');
  const key = bearer(request);
  if (!/^lp_[a-f0-9]{64}$/.test(key || '')) throw new HttpError(401, '请设置有效的收藏密钥');
  if (!env.DB) throw new HttpError(503, '收藏数据库尚未配置');
  const owner = await hash(key);
  if (['GET', 'HEAD'].includes(request.method)) {
    const { results } = await env.DB.prepare('SELECT bvid, page, title, author, part_title, created_at FROM stream_favorites WHERE owner_hash=? ORDER BY created_at DESC, bvid, page').bind(owner).all();
    return Response.json({ favorites: results });
  }
  const body = await readJson(request);
  const parsed = parseVideo(body.input || body.bvid);
  const { bvid } = parsed;
  const page = Number(body.page ?? parsed.page);
  if (!Number.isSafeInteger(page) || page < 1) throw new HttpError(400, '分 P 无效');
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM stream_favorites WHERE owner_hash=? AND bvid=? AND page=?').bind(owner, bvid, page).run();
    return Response.json({ ok: true });
  }
  const text = (value, fallback) => {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value !== 'string' || value.length > 500) throw new HttpError(400, '收藏标题或作者无效');
    return value;
  };
  const title = text(body.title, bvid), author = text(body.author, ''), partTitle = text(body.part_title, `P${page}`);
  await env.DB.prepare(`INSERT INTO stream_favorites (owner_hash, bvid, page, title, author, part_title, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_hash, bvid, page) DO UPDATE SET
    title=CASE WHEN excluded.title=excluded.bvid THEN stream_favorites.title ELSE excluded.title END,
    author=CASE WHEN excluded.author='' THEN stream_favorites.author ELSE excluded.author END,
    part_title=CASE WHEN excluded.part_title=('P' || excluded.page) THEN stream_favorites.part_title ELSE excluded.part_title END`)
    .bind(owner, bvid, page, title, author, partTitle, Date.now()).run();
  return Response.json({ ok: true }, { status: 201 });
}
