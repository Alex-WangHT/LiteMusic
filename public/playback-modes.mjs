export const playbackModes = ['order', 'loop', 'single', 'random'];
export const modeNames = { order: '顺序', loop: '列表循环', single: '单曲循环', random: '随机' };

export function nextTrackIndex({ mode, index, length, direction = 1, ended = false, random = Math.random }) {
  if (!length) return -1;
  if (index < 0 || index >= length) return direction < 0 ? length - 1 : 0;
  if (mode === 'single' && ended) return index;
  if (mode === 'random') {
    if (length === 1) return 0;
    const candidate = Math.min(length - 2, Math.floor(random() * (length - 1)));
    return candidate >= index ? candidate + 1 : candidate;
  }
  const next = index + direction;
  if (mode === 'order' && (next < 0 || next >= length)) return -1;
  return (next + length) % length;
}
