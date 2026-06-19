// 仓鼠教练 PWA service worker
// 策略:HTML/导航 = 网络优先(在线必拿最新,离线回退缓存);图片/字体等静态 = 缓存优先
const CACHE = "cangshu-coach-v5";

self.addEventListener("install", e => { self.skipWaiting(); });

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isHTML(req) {
  return req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html") ||
    new URL(req.url).pathname.endsWith(".html") ||
    new URL(req.url).pathname.endsWith("/");
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  if (isHTML(req)) {
    // 网络优先:始终尝试拿最新 HTML;失败(离线)才用缓存
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then(hit => hit || caches.match("./index.html")))
    );
    return;
  }

  // 静态资源(图片/字体/manifest):缓存优先,后台补缓存
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }))
  );
});
