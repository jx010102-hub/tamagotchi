// 성장 다마고치 오프라인 캐시
const VERSION = "tamagotchi-v20";
const ASSETS = ["./", "index.html", "manifest.json", "doodle.webp", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "sprites/bunny/base.webp", "sprites/bunny/cry.webp", "sprites/bunny/done1.webp", "sprites/bunny/done2.webp", "sprites/bunny/done3.webp", "sprites/bunny/eat.webp", "sprites/bunny/empty.webp", "sprites/bunny/focus.webp", "sprites/bunny/hi.webp", "sprites/bunny/idle.webp", "sprites/bunny/lazy.webp", "sprites/bunny/levelup.webp", "sprites/bunny/sleep.webp", "sprites/bunny/think.webp", "sprites/bunny/weekly.webp", "sprites/cat/base.webp", "sprites/cat/cry.webp", "sprites/cat/done1.webp", "sprites/cat/done2.webp", "sprites/cat/done3.webp", "sprites/cat/eat.webp", "sprites/cat/empty.webp", "sprites/cat/focus.webp", "sprites/cat/hi.webp", "sprites/cat/idle.webp", "sprites/cat/lazy.webp", "sprites/cat/levelup.webp", "sprites/cat/sleep.webp", "sprites/cat/think.webp", "sprites/cat/weekly.webp", "sprites/sprout/base.webp", "sprites/sprout/cry.webp", "sprites/sprout/done1.webp", "sprites/sprout/done2.webp", "sprites/sprout/done3.webp", "sprites/sprout/eat.webp", "sprites/sprout/empty.webp", "sprites/sprout/focus.webp", "sprites/sprout/hi.webp", "sprites/sprout/idle.webp", "sprites/sprout/lazy.webp", "sprites/sprout/levelup.webp", "sprites/sprout/sleep.webp", "sprites/sprout/think.webp", "sprites/sprout/weekly.webp", "sprites/hamster/base.webp", "sprites/hamster/cry.webp", "sprites/hamster/done1.webp", "sprites/hamster/done2.webp", "sprites/hamster/done3.webp", "sprites/hamster/eat.webp", "sprites/hamster/empty.webp", "sprites/hamster/focus.webp", "sprites/hamster/hi.webp", "sprites/hamster/idle.webp", "sprites/hamster/lazy.webp", "sprites/hamster/levelup.webp", "sprites/hamster/sleep.webp", "sprites/hamster/think.webp", "sprites/hamster/weekly.webp"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // 화면(HTML)은 새 버전을 먼저 받고, 안 되면 저장본
  if (req.mode === "navigate" || url.pathname.endsWith("/index.html")) {
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put("index.html", copy)); return res; })
      .catch(() => caches.match("index.html")));
    return;
  }
  // 찬양 영상 목록(매일 바뀜)은 새로 받고, 안 되면 저장본
  if (url.pathname.includes("/worship/")) {
    e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req.url.split("?")[0], copy)); } return res; })
      .catch(() => caches.match(req.url.split("?")[0])));
    return;
  }
  // 이미지·폰트는 저장본 먼저
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  })));
});
