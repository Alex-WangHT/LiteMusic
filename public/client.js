import { playbackModes, nextTrackIndex } from './playback-modes.mjs';

import { parseVideo } from './video-input.mjs';

const $ = id => document.getElementById(id);
const desktop = !!window.whalePlayer;
let playlist = [], video, loadingTrack = false, playbackMode = 'order';
let renderRevision = 0, lastPlaylistJSON = '', syncRevision = 0;
let activePlaylist = '';
let mutationQueue = Promise.resolve();
function changeCloud(task) { const job = mutationQueue.then(task); mutationQueue = job.catch(() => {}); return job; }
const metadataJobs = new Map();
let desktopStylesReady = Promise.resolve();
try {
  localStorage.removeItem('liteplayer-local-playlist');
  localStorage.removeItem('liteplayer-playlist-cache');
  sessionStorage.removeItem('liteplayer-local-playlist');
  sessionStorage.removeItem('liteplayer-playlist-cache');
  $('cloud-url').value = localStorage.getItem('liteplayer-cloud-url') || localStorage.getItem('liteplayer-workers-url') || '';
  localStorage.removeItem('liteplayer-library-key');
  const saved = localStorage.getItem('liteplayer-playback-mode');
  if (playbackModes.includes(saved)) playbackMode = saved;
} catch { message('无法清理旧列表缓存或读取连接设置，请检查应用存储权限。', true); }
if (desktop) {
  document.body.classList.add('desktop-player');
  const sheet = document.createElement('link'); sheet.rel = 'stylesheet'; sheet.href = '/pet/playlist.css';
  desktopStylesReady = new Promise(resolve => { sheet.onload = resolve; sheet.onerror = resolve; });
  document.head.append(sheet);
  $('close-list').hidden = false;
}
function message(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
function publishPlayback() {
  const playing = !$('audio').paused && !$('audio').ended && !$('audio').error;
  for (const row of $('favorites').querySelectorAll('.queue-row')) {
    const active = row.dataset.track === `${video?.bvid}:${$('pages').value}`;
    row.classList.toggle('current', active); row.classList.toggle('is-playing', active && playing);
    row.querySelector('.queue-number').textContent = active ? '♫' : row.dataset.number;
    row.querySelector('.queue-play').setAttribute('aria-current', active ? 'true' : 'false');
  }
  window.whalePlayer?.publish({ title: loadingTrack ? '正在加载音频…' : (video?.title || '选择一首歌，我陪你听'), playing, busy: loadingTrack, mode: playbackMode });
}
function createRow(item, index) {
  const origin = activePlaylist;
  const row = document.createElement('article'); row.className = 'queue-row'; row.dataset.track = `${item.bvid}:${item.page}`; row.dataset.number = String(index + 1).padStart(2, '0');
  const number = document.createElement('span'); number.className = 'queue-number'; number.textContent = row.dataset.number;
  const play = document.createElement('button'); play.className = 'queue-play'; play.setAttribute('aria-label', `播放：${item.title}`); play.title = `${item.title} · ${item.bvid} P${item.page}`;
  const title = document.createElement('strong'); title.textContent = item.title;
  const info = document.createElement('small'); info.textContent = [item.author, item.bvid, `P${item.page}`].filter(Boolean).join(' · ');
  play.append(title, info); play.onclick = () => loadVideo(`https://www.bilibili.com/video/${item.bvid}/?p=${item.page}`, true);
  const remove = document.createElement('button'); remove.className = 'queue-remove'; remove.textContent = '×'; remove.setAttribute('aria-label', `移出列表：${item.title}`); remove.title = '移出播放列表';
  remove.onclick = async () => { remove.disabled = true; try { await changeCloud(async () => { if (origin !== activePlaylist) return; await cloud('DELETE', { bvid: item.bvid, page: item.page }); await syncPlaylist(); }); } catch (error) { message(error.message, true); } finally { remove.disabled = false; } };
  row.append(number, play, remove); return row;
}
async function renderPlaylist(items) {
  playlist = items; $('queue-count').textContent = `${items.length} 首`;
  const json = JSON.stringify(items);
  if (json !== lastPlaylistJSON) {
    lastPlaylistJSON = json;
    const revision = ++renderRevision;
    $('favorites').replaceChildren();
    for (let start = 0; start < items.length; start += 80) {
      if (revision !== renderRevision) return;
      const fragment = document.createDocumentFragment();
      for (let index = start; index < Math.min(start + 80, items.length); index++) fragment.append(createRow(items[index], index));
      $('favorites').append(fragment);
      if (start + 80 < items.length) await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  $('library-message').textContent = items.length ? '' : '播放列表为空，点击“添加 BV”开始。';
  $('library-message').hidden = !!items.length;
  publishPlayback();
}
function enrichTrack(bvid, page) {
  const origin = activePlaylist;
  const id = `${origin}:${bvid}:${page}`;
  if (metadataJobs.has(id)) return;
  const job = (async () => {
    try {
      const response = await fetch('/api/video?' + new URLSearchParams({ input: `https://www.bilibili.com/video/${bvid}/?p=${page}` }), { signal: AbortSignal.timeout(15000) });
      if (!response.ok) return;
      const data = await response.json();
      await changeCloud(async () => { if (origin === activePlaylist && playlist.some(item => item.bvid === bvid && item.page === page)) { await cloud('POST', { bvid, page, title: data.title, author: data.author, part_title: data.pages.find(part => part.page === page)?.title }); await syncPlaylist(); } });
    } catch { /* Metadata failure does not alter the cloud playlist. */ }
  })().finally(() => metadataJobs.delete(id));
  metadataJobs.set(id, job);
}
$('form').addEventListener('submit', async event => {
  event.preventDefault(); $('load').disabled = true;
  try {
    const input = $('video-input').value.trim(), parsed = parseVideo(input);
    await changeCloud(async () => { if (!activePlaylist) await refreshLists(); if (!activePlaylist) throw new Error('请先新建播放列表'); await cloud('POST', { input }); await syncPlaylist(); });
    $('video-input').value = '';
    $('add-bv').open = false;
    message('已同步到云端播放列表，标题将在后台更新。');
    enrichTrack(parsed.bvid, parsed.page);
  } catch (error) { message(error.message, true); }
  finally { $('load').disabled = false; }
});
function selectPage() {
  $('audio').pause();
  $('audio').src = '/api/audio?' + new URLSearchParams({ bvid: video.bvid, p: $('pages').value });
  $('audio').load();
  $('source').href = `https://www.bilibili.com/video/${video.bvid}/?p=${$('pages').value}`;
  message('已选择音频，点击播放器开始播放。'); publishPlayback();
}
async function loadVideo(input, autoplay = false) {
  if (loadingTrack) return;
  loadingTrack = true; publishPlayback();
  $('audio').pause(); $('audio').removeAttribute('src'); $('audio').load(); $('player').hidden = true;
  message('正在获取视频信息…');
  try {
    const response = await fetch('/api/video?' + new URLSearchParams({ input }), { signal: AbortSignal.timeout(20000) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '获取失败');
    video = data; $('title').textContent = video.title; $('author').textContent = video.author;
    $('pages').replaceChildren(...data.pages.map(part => { const option = document.createElement('option'); option.value = part.page; option.textContent = `P${part.page} · ${part.title}`; return option; }));
    $('pages').value = String(data.page); $('player').hidden = false; selectPage();
    if (autoplay) await $('audio').play();
    const part = data.pages.find(part => part.page === data.page);
  } catch (error) { message(error.message, true); }
  finally { loadingTrack = false; publishPlayback(); }
}
async function stepTrack(direction, ended = false) {
  if (loadingTrack) return;
  if (!playlist.length) { window.whalePlayer?.needsSelection(); return message('请先在播放列表中添加 BV。'); }
  const index = playlist.findIndex(item => item.bvid === video?.bvid && item.page === Number($('pages').value));
  const next = nextTrackIndex({ mode: playbackMode, index, length: playlist.length, direction, ended });
  if (next < 0) { message(direction < 0 ? '已经是第一首。' : '已播放到列表末尾。'); publishPlayback(); return; }
  const item = playlist[next]; await loadVideo(`https://www.bilibili.com/video/${item.bvid}/?p=${item.page}`, true);
}
function openSettings() { if (!$('settings').open) $('settings').showModal(); }
$('close-settings').onclick = () => { $('settings').close(); window.whalePlayer?.closePlaylist(); };
$('settings').addEventListener('close', () => { document.body.classList.remove('settings-only'); });
async function command(value) {
  if (value === 'settings') { document.body.classList.add('settings-only'); openSettings(); return; }
  if (value === 'playlist') { if ($('settings').open) $('settings').close(); document.body.classList.remove('settings-only'); return; }
  if (value === 'mode') {
    playbackMode = playbackModes[(playbackModes.indexOf(playbackMode) + 1) % playbackModes.length];
    try { localStorage.setItem('liteplayer-playback-mode', playbackMode); } catch { message('无法保存播放模式。', true); }
    publishPlayback(); return;
  }
  if (loadingTrack) return;
  if (value === 'previous') return stepTrack(-1);
  if (value === 'next') return stepTrack(1);
  if (value === 'toggle') {
    if (!$('audio').getAttribute('src')) return stepTrack(1);
    if ($('audio').paused) { try { await $('audio').play(); } catch (error) { message(error.message, true); } }
    else $('audio').pause();
  }
}
window.whalePlayer?.onCommand(command);
$('queue-add').onclick = () => { $('add-bv').open = !$('add-bv').open; if ($('add-bv').open) $('video-input').focus(); };
$('close-list').onclick = () => window.whalePlayer?.closePlaylist();
$('play-all').onclick = () => playlist.length ? loadVideo(`https://www.bilibili.com/video/${playlist[0].bvid}/?p=${playlist[0].page}`, true) : message('请先在播放列表中添加 BV。');
$('refresh').onclick = () => syncPlaylist().catch(error => message(error.message, true));
$('pages').addEventListener('change', selectPage);
$('reload').addEventListener('click', selectPage);
$('audio').addEventListener('ended', () => stepTrack(1, true));
$('audio').addEventListener('playing', () => message('正在播放'));
$('audio').addEventListener('pause', () => { if (!loadingTrack && $('audio').getAttribute('src')) message('已暂停'); });
$('audio').addEventListener('error', () => { if ($('audio').getAttribute('src')) message('音频加载失败，请检查本地网络或视频限制。', true); });
for (const name of ['playing', 'pause', 'ended', 'emptied', 'error', 'loadedmetadata']) $('audio').addEventListener(name, publishPlayback);
async function cloud(method = 'GET', body, resource = 'favorites') {
  const query = new URLSearchParams({ resource, playlist: activePlaylist || 'default' });
  const response = await fetch('/api/playlist?' + query, {
    method, cache: 'no-store', signal: AbortSignal.timeout(25000),
    headers: { 'X-Playlist-API': $('cloud-url').value.trim(), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '云端同步失败');
  return data;
}
async function syncPlaylist() {
  if (!activePlaylist) return;
  const revision = ++syncRevision;
  const data = await cloud();
  if (revision !== syncRevision) return;
  if (!Array.isArray(data.favorites)) throw new Error('云端列表格式无效');
  await renderPlaylist(data.favorites); message('云端列表已同步');
}
async function refreshLists(preferred = activePlaylist) {
  ++syncRevision;
  const data = await cloud('GET', undefined, 'playlists');
  if (!Array.isArray(data.playlists)) throw new Error('云端列表格式无效，请更新 Workers');
  $('playlist-select').replaceChildren(...data.playlists.map(item => {
    const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; return option;
  }));
  activePlaylist = data.playlists.some(item => item.id === preferred) ? preferred : (data.playlists[0]?.id || '');
  $('playlist-select').value = activePlaylist;
  await renderPlaylist([]);
  $('playlist-delete').disabled = !activePlaylist;
  $('load').disabled = !activePlaylist;
  if (activePlaylist) await syncPlaylist();
  else message('请新建一个播放列表。');
}
$('playlist-select').onchange = () => changeCloud(() => refreshLists($('playlist-select').value)).catch(error => message(error.message, true));
$('playlist-create').onclick = () => changeCloud(async () => {
  const result = await cloud('POST', { name: $('playlist-name').value }, 'playlists');
  $('playlist-name').value = ''; await refreshLists(result.id);
}).catch(error => message(error.message, true));
$('playlist-delete').onclick = () => {
  if (!activePlaylist || !confirm('删除当前播放列表及其中的全部歌曲？')) return;
  changeCloud(async () => { await cloud('DELETE', { id: activePlaylist }, 'playlists'); await refreshLists(); }).catch(error => message(error.message, true));
};
$('cloud-url').addEventListener('change', () => {
  try { localStorage.setItem('liteplayer-cloud-url', $('cloud-url').value.trim()); } catch {}
  changeCloud(() => refreshLists('')).catch(error => message(error.message, true));
});
$('connection-form').onsubmit = async event => {
  event.preventDefault(); await renderPlaylist([]);
  try {
    await changeCloud(() => refreshLists());
    localStorage.setItem('liteplayer-cloud-url', $('cloud-url').value.trim());
    localStorage.removeItem('liteplayer-workers-url');
    $('connection').open = false;
  } catch (error) { message(error.message, true); }
};
await renderPlaylist([]);
$('load').disabled = true;
if ($('cloud-url').value.trim()) {
  changeCloud(() => refreshLists()).catch(error => { message(error.message, true); $('connection').open = true; }).finally(() => { $('load').disabled = !activePlaylist; });
} else {
  message('请从托盘菜单打开设置，填写你的云端地址。');
}
publishPlayback();
// Reveal the window only after its compact layout has been painted. Cloud I/O
// continues independently so a slow connection cannot block opening the list.
await desktopStylesReady;
if (desktop) requestAnimationFrame(() => requestAnimationFrame(() => window.whalePlayer.ready()));
