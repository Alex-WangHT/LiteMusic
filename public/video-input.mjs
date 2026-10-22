import { HttpError } from './errors.mjs';
const BV = /^BV[0-9A-Za-z]{10}$/;
export function parseVideo(input) {
  let bvid = String(input || '').trim(), page = 1;
  if (!BV.test(bvid)) {
    let url;
    try { url = new URL(bvid); } catch { throw new HttpError(400, '请输入有效 BV 号或 B 站链接'); }
    if (url.protocol !== 'https:' || !['www.bilibili.com','bilibili.com','m.bilibili.com'].includes(url.hostname)) throw new HttpError(400, '仅支持 B 站 HTTPS 视频链接');
    bvid = /^\/video\/(BV[0-9A-Za-z]{10})\/?$/.exec(url.pathname)?.[1];
    page = Number(url.searchParams.get('p') || 1);
  }
  if (!BV.test(bvid || '') || !Number.isSafeInteger(page) || page < 1) throw new HttpError(400, 'BV 号或分 P 无效');
  return { bvid, page };
}
