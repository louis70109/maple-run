// 圖片載入與快取
const cache = new Map();

export function loadImage(src) {
  if (cache.has(src)) return cache.get(src).promise;
  const img = new Image();
  const entry = { img, ok: false };
  entry.promise = new Promise((resolve) => {
    img.onload = () => { entry.ok = true; resolve(img); };
    img.onerror = () => resolve(img); // 缺圖不擋遊戲，畫的時候會略過
  });
  img.src = src;
  cache.set(src, entry);
  return entry.promise;
}

export const loadAll = (srcs) => Promise.all([...new Set(srcs)].map(loadImage));

export function getImage(src) {
  const e = cache.get(src);
  if (!e) { loadImage(src); return null; }
  return e.ok ? e.img : null;
}

export function aspect(src) {
  const img = getImage(src);
  return img && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1;
}
