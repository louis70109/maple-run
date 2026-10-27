// 楓之谷逐格動畫：sprite sheet ＋ sprites.json（由 scripts/fetch_sprites.py 產生）
// 每一格記錄在 sheet 裡的位置 (x, y, w, h)、腳底原點 (ox, oy) 與顯示時間 d（毫秒）。
import { loadAll, getImage } from './assets.js';

let meta = {};

export async function loadSpriteMeta() {
  try {
    const res = await fetch('assets/sprites/sprites.json');
    if (res.ok) meta = await res.json();
  } catch { /* 沒有動畫資料時，遊戲會畫成色塊 */ }
  return meta;
}

// 測試用：直接塞資料
export const setSpriteMeta = (m) => { meta = m || {}; };

export const sheetSrc = (key) => `assets/sprites/${key}.png`;
export const previewSrc = (key) => `assets/sprites/preview/${key}.png`;
export const loadSheets = (keys) => loadAll(keys.map(sheetSrc));

export function hasAction(key, action) {
  return !!(meta[key] && meta[key][action] && meta[key][action].length);
}

export function actionDuration(key, action) {
  const frames = meta[key]?.[action];
  return frames ? frames.reduce((s, f) => s + f.d, 0) / 1000 : 0;
}

// 參考框：用預設動作第一格的大小，決定碰撞框與縮放
export function refFrame(key) {
  const m = meta[key];
  if (!m) return null;
  const first = m.move || m.walk || m.stand || Object.values(m)[0];
  return first && first[0];
}

export function aspectOf(key) {
  const f = refFrame(key);
  return f ? f.w / f.h : 1;
}

// t 秒時應該顯示哪一格；loop=false 時停在最後一格
export function frameAt(key, action, t, loop = true) {
  const frames = meta[key]?.[action];
  if (!frames || !frames.length) return null;
  const total = frames.reduce((s, f) => s + f.d, 0);
  let ms = t * 1000;
  ms = loop ? ((ms % total) + total) % total : Math.min(ms, total - 1);
  for (const f of frames) {
    if (ms < f.d) return f;
    ms -= f.d;
  }
  return frames[frames.length - 1];
}

// 以腳底 (x, y) 為基準畫一格。flip=true 會水平翻轉（楓之谷原圖面向左）。
export function drawSprite(ctx, key, action, t, x, y, scale, opts = {}) {
  const f = frameAt(key, action, t, opts.loop !== false);
  const img = getImage(sheetSrc(key));
  if (!f || !img) return false;
  const src = opts.tint ? tinted(img) : img;
  ctx.save();
  ctx.translate(x, y);
  if (opts.rotate) {
    ctx.translate(0, -opts.pivot * scale);
    ctx.rotate(opts.rotate);
    ctx.translate(0, opts.pivot * scale);
  }
  if (opts.flip) ctx.scale(-1, 1);
  if (opts.alpha != null) ctx.globalAlpha *= opts.alpha;
  ctx.drawImage(src, f.x, f.y, f.w, f.h, -f.ox * scale, -f.oy * scale, f.w * scale, f.h * scale);
  ctx.restore();
  return true;
}

// 受傷時的紅色剪影（整張 sheet 染一次後快取）
const tintCache = new WeakMap();
function tinted(img) {
  let cv = tintCache.get(img);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = img.naturalWidth;
  cv.height = img.naturalHeight;
  const t = cv.getContext('2d');
  t.drawImage(img, 0, 0);
  t.globalCompositeOperation = 'source-atop';
  t.fillStyle = 'rgba(255,40,40,0.6)';
  t.fillRect(0, 0, cv.width, cv.height);
  tintCache.set(img, cv);
  return cv;
}
