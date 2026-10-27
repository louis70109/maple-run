/* MapleRun Service Worker
 *  - 殼（HTML / CSS / JS）：安裝時預先快取；請求時網路優先、離線用快取，所以有網路永遠拿到最新版。
 *  - config.json：網路優先，GM 發佈的新設定一上線就生效；離線時用上次的設定。
 *  - assets/*（圖片）：快取優先，第一次載入後就能離線玩。sprites.json 等資料檔走網路優先。
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

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE)
      .then((c) => c.addAll(CORE_URLS.map((u) => new Request(u, { cache: "reload" }))))
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
