/* MapleRun Service Worker
 *  - 殼（HTML / CSS / JS）：安裝時預先快取；請求時網路優先、離線用快取，所以有網路永遠拿到最新版。
 *  - config.json：網路優先，GM 發佈的新設定一上線就生效；離線時用上次的設定。
 *  - assets/*（圖片）：安裝時就把全部動畫、道具圖示下載好（快取優先），第一次開啟後即可完全離線玩。
 *    sprites.json 等資料檔走網路優先。全部下載完會存一個 "offline-ready" 記號，標題畫面據此顯示「可離線遊玩」。
 *  - __BUILD__ 由部署流程換成 commit SHA，新版上線時會清掉舊的快取（圖片會重新下載，確保 sprite 更新後一致）。
 */
const VERSION = "__BUILD__";
const CORE_CACHE = "maple-run-core-" + VERSION;
const ASSET_CACHE = "maple-run-assets-" + VERSION;
const CORE_URLS = [
  "./",
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "config.json",
  "src/main.js",
  "src/game.js",
  "src/level.js",
  "src/params.js",
  "src/physics.js",
  "src/themes.js",
  "src/assets.js",
  "src/audio.js",
  "src/store.js",
  "src/gm.js",
  "src/sprites.js",
  "assets/sprites/sprites.json",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
];
// 不在 sprites.json 裡的圖：道具圖示（同 src/themes.js 的 ITEM_ICONS）、加速圖示、PWA 圖示
const STATIC_ASSETS = [
  ...Array.from({ length: 40 }, (_, i) => `assets/items/${4009800 + i}.webp`),
  "assets/items/haste.png",
  "assets/items/skillbook.png",
  "assets/icons/maskable-512.png",
  "assets/icons/apple-touch-icon.png",
];

// 依 sprites.json 列出所有 sprite sheet 與預覽圖，連同其他圖片一起下載
async function precacheAssets() {
  const cache = await caches.open(ASSET_CACHE);
  const res = await fetch("assets/sprites/sprites.json", { cache: "reload" });
  const keys = Object.keys(await res.json());
  const urls = [...STATIC_ASSETS, ...keys.flatMap((k) => [`assets/sprites/${k}.png`, `assets/sprites/preview/${k}.png`])];
  const results = await Promise.allSettled(urls.map(async (u) => {
    if (await cache.match(u)) return;
    const r = await fetch(u, { cache: "reload" });
    if (!r.ok) throw new Error(u);
    await cache.put(u, r);
  }));
  if (results.every((r) => r.status === "fulfilled")) await cache.put("offline-ready", new Response("1"));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE)
      .then((c) => c.addAll(CORE_URLS.map((u) => new Request(u, { cache: "reload" }))))
      .then(() => precacheAssets().catch(() => { /* 圖片之後玩的時候還會再存 */ }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith("maple-run-") && k !== CORE_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes("/assets/") && !url.pathname.endsWith(".json")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(ASSET_CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }))
    );
    return;
  }

  // 其他（頁面、程式、config.json）：網路優先
  event.respondWith(
    fetch(req, { cache: "no-cache" })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          const key = req.mode === "navigate" ? "index.html" : req;
          caches.open(CORE_CACHE).then((c) => c.put(key, copy));
        }
        return res;
      })
      .catch(() => caches.match(req.mode === "navigate" ? "index.html" : req, { ignoreSearch: true }))
  );
});
