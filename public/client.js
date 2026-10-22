const $ = id => document.getElementById(id);
const config = await (await fetch('/api/config')).json();
const localPlayer = config.mode === 'local-player';
document.querySelector('h1').textContent = localPlayer ? '本地播放 · 云端收藏' : '我的 BV 收藏';
document.querySelector('header p').textContent = localPlayer ? '从云端同步收藏，通过本机请求 B 站播放。' : '保存 BV 号与分 P。在本地启动播放器后，使用相同收藏密钥同步播放。';
if (!localPlayer) {
  $('load').textContent = '收藏 BV';
  $('save-input').hidden = true;
  document.querySelector('#form .hint').textContent = '云端仅保存收藏，不解析视频、不转发音频。播放请在电脑上启动本地播放器。';
}
let video;
function message(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
function selectPage() {
  $('audio').pause();
  $('audio').src = '/api/audio?' + new URLSearchParams({ bvid: video.bvid, p: $('pages').value });
  $('audio').load();
  $('source').href = `https://www.bilibili.com/video/${video.bvid}/?p=${$('pages').value}`;
  message('已选择音频，点击播放器开始播放。');
}
$('form').addEventListener('submit', async event => {
  event.preventDefault(); $('load').disabled = true;
  if (!localPlayer) {
    try { await libraryRequest('POST', { input: $('video-input').value }); await loadFavorites(); message('BV 已保存到云端收藏库。'); }
    catch (error) { message(error.message, true); }
    finally { $('load').disabled = false; }
    return;
  }
  $('audio').pause(); $('audio').removeAttribute('src'); $('audio').load(); $('player').hidden = true;
  message('正在获取视频信息…');
  try {
    const response = await fetch('/api/video?' + new URLSearchParams({ input: $('video-input').value }));
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '获取失败');
    video = data; $('title').textContent = video.title; $('author').textContent = video.author;
    $('pages').replaceChildren(...video.pages.map(p => { const o = document.createElement('option'); o.value = p.page; o.textContent = `P${p.page} · ${p.title}`; return o; }));
    $('pages').value = String(video.page); $('player').hidden = false; selectPage();
  } catch (error) { message(error.message, true); } finally { $('load').disabled = false; }
});
$('pages').addEventListener('change', selectPage);
$('reload').addEventListener('click', selectPage);
$('audio').addEventListener('playing', () => message('正在播放'));
$('audio').addEventListener('error', () => { if ($('audio').getAttribute('src')) message('音频加载失败，可能受到 B 站登录、地区或出口 IP 限制。请重新获取或在 B 站打开。', true); });

let libraryKey;
function libraryMessage(text, error = false) {
  $('library-message').textContent = text;
  $('library-message').classList.toggle('error', error);
}
async function libraryRequest(method = 'GET', body) {
  const response = await fetch('/api/favorites', {
    method, headers: { Authorization: `Bearer ${libraryKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '收藏操作失败');
  return data;
}
async function loadFavorites() {
  if (!libraryKey) return;
  const requestedKey = libraryKey;
  $('refresh').disabled = true;
  try {
    const { favorites } = await libraryRequest();
    if (requestedKey !== libraryKey) return;
    $('favorites').replaceChildren(...favorites.map(item => {
      const card = document.createElement('article'); card.className = 'card';
      const title = document.createElement('h3'); title.textContent = item.title;
      const info = document.createElement('p'); info.textContent = `${item.author} · P${item.page} · ${item.part_title}`;
      const actions = document.createElement('div'); actions.className = 'actions';
      const play = document.createElement(localPlayer ? 'button' : 'a');
      play.textContent = localPlayer ? '加载播放' : '在 B 站打开';
      if (localPlayer) play.addEventListener('click', () => { $('video-input').value = `https://www.bilibili.com/video/${item.bvid}/?p=${item.page}`; $('form').requestSubmit(); });
      else { play.href = `https://www.bilibili.com/video/${item.bvid}/?p=${item.page}`; play.target = '_blank'; play.rel = 'noopener noreferrer'; }
      const remove = document.createElement('button'); remove.textContent = '取消收藏'; remove.className = 'secondary';
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        try { await libraryRequest('DELETE', { bvid: item.bvid, page: item.page }); await loadFavorites(); }
        catch (error) { libraryMessage(error.message, true); remove.disabled = false; }
      });
      actions.append(play, remove); card.append(title, info, actions); return card;
    }));
    libraryMessage(favorites.length ? `共 ${favorites.length} 条收藏` : '暂无收藏，获取音频后可收藏当前分 P。');
  } catch (error) { if (requestedKey === libraryKey) libraryMessage(error.message, true); }
  finally { $('refresh').disabled = false; }
}
$('save').addEventListener('click', async () => {
  if (!video || !libraryKey) return;
  $('save').disabled = true;
  try {
    const page = Number($('pages').value);
    await libraryRequest('POST', { bvid: video.bvid, page, title: video.title, author: video.author, part_title: video.pages.find(p => p.page === page)?.title });
    await loadFavorites(); message('已保存到收藏库。');
  } catch (error) { message(error.message, true); }
  finally { $('save').disabled = false; }
});
$('refresh').addEventListener('click', loadFavorites);
$('save-input').addEventListener('click', async () => {
  if (!libraryKey) return;
  $('save-input').disabled = true;
  try {
    await libraryRequest('POST', { input: $('video-input').value });
    await loadFavorites(); message('BV 已保存到收藏库。');
  } catch (error) { message(error.message, true); }
  finally { $('save-input').disabled = false; }
});
$('apply-key').addEventListener('click', async () => {
  const key = $('library-key').value.trim();
  if (!/^lp_[a-f0-9]{64}$/.test(key)) return libraryMessage('收藏密钥格式无效，请粘贴完整密钥。', true);
  try { localStorage.setItem('liteplayer-library-key', key); libraryKey = key; $('favorites').replaceChildren(); await loadFavorites(); }
  catch { libraryMessage('浏览器无法保存密钥，请允许本站使用本地存储。', true); }
});
$('copy-key').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(libraryKey); libraryMessage('密钥已复制，请妥善保存。'); }
  catch { libraryMessage('无法复制，请从密钥输入框手动复制。', true); }
});
try {
  libraryKey = localStorage.getItem('liteplayer-library-key');
  if (!/^lp_[a-f0-9]{64}$/.test(libraryKey || '')) {
    libraryKey = 'lp_' + Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('liteplayer-library-key', libraryKey);
  }
  $('library-key').value = libraryKey;
  loadFavorites();
} catch { libraryKey = undefined; $('save').disabled = true; $('save-input').disabled = true; libraryMessage('浏览器无法保存收藏密钥，请允许本站使用本地存储后刷新。', true); }
