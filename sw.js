// 성장 다마고치 오프라인 캐시
const VERSION = "tamagotchi-v27";
const ASSETS = ["./", "index.html", "manifest.json", "doodle.webp", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "sprites/owl/base.webp", "sprites/owl/cry.webp", "sprites/owl/done1.webp", "sprites/owl/done2.webp", "sprites/owl/done3.webp", "sprites/owl/eat.webp", "sprites/owl/empty.webp", "sprites/owl/focus.webp", "sprites/owl/hi.webp", "sprites/owl/idle.webp", "sprites/owl/lazy.webp", "sprites/owl/levelup.webp", "sprites/owl/sleep.webp", "sprites/owl/think.webp", "sprites/owl/weekly.webp", "sprites/robot/base.webp", "sprites/robot/cry.webp", "sprites/robot/done1.webp", "sprites/robot/done2.webp", "sprites/robot/done3.webp", "sprites/robot/eat.webp", "sprites/robot/empty.webp", "sprites/robot/focus.webp", "sprites/robot/hi.webp", "sprites/robot/idle.webp", "sprites/robot/lazy.webp", "sprites/robot/levelup.webp", "sprites/robot/sleep.webp", "sprites/robot/think.webp", "sprites/robot/weekly.webp", "eggs/egg-01.webp", "eggs/egg-02.webp", "eggs/egg-03.webp", "eggs/egg-04.webp", "eggs/egg-05.webp", "eggs/egg-06.webp", "eggs/egg-07.webp", "eggs/egg-08.webp", "eggs/egg-09.webp", "eggs/egg-10.webp", "eggs/egg-11.webp", "eggs/egg-12.webp", "eggs/egg-13.webp", "eggs/egg-14.webp", "eggs/egg-15.webp", "eggs/egg-16.webp", "eggs/egg-17.webp", "eggs/egg-18.webp", "eggs/egg-19.webp", "eggs/egg-20.webp", "eggs/egg-21.webp", "eggs/egg-22.webp", "eggs/egg-23.webp", "eggs/egg-24.webp", "eggs/egg-25.webp", "eggs/egg-26.webp", "eggs/egg-27.webp", "eggs/egg-28.webp", "eggs/egg-29.webp", "eggs/egg-30.webp", "icons/pr-alert.webp", "icons/pr-dots.webp", "icons/pr-heart.webp", "icons/pr-jp.webp", "icons/pr-music.webp", "icons/sk-drum.webp", "icons/sk-jp.webp", "icons/sk-reels.webp", "icons/sk-toon.webp", "icons/tab-cal.webp", "icons/tab-home.webp", "icons/tab-set.webp", "icons/tab-tt.webp", "icons/ui-alert.webp", "icons/ui-chat.webp", "icons/ui-heart.webp", "icons/ui-plus.webp", "icons/ui-star.webp", "icons/ui-sum.webp", "sprites/bunny/base.webp", "sprites/bunny/cry.webp", "sprites/bunny/done1.webp", "sprites/bunny/done2.webp", "sprites/bunny/done3.webp", "sprites/bunny/eat.webp", "sprites/bunny/empty.webp", "sprites/bunny/focus.webp", "sprites/bunny/hi.webp", "sprites/bunny/idle.webp", "sprites/bunny/lazy.webp", "sprites/bunny/levelup.webp", "sprites/bunny/sleep.webp", "sprites/bunny/think.webp", "sprites/bunny/weekly.webp", "sprites/cat/base.webp", "sprites/cat/cry.webp", "sprites/cat/done1.webp", "sprites/cat/done2.webp", "sprites/cat/done3.webp", "sprites/cat/eat.webp", "sprites/cat/empty.webp", "sprites/cat/focus.webp", "sprites/cat/hi.webp", "sprites/cat/idle.webp", "sprites/cat/lazy.webp", "sprites/cat/levelup.webp", "sprites/cat/sleep.webp", "sprites/cat/think.webp", "sprites/cat/weekly.webp", "sprites/sprout/base.webp", "sprites/sprout/cry.webp", "sprites/sprout/done1.webp", "sprites/sprout/done2.webp", "sprites/sprout/done3.webp", "sprites/sprout/eat.webp", "sprites/sprout/empty.webp", "sprites/sprout/focus.webp", "sprites/sprout/hi.webp", "sprites/sprout/idle.webp", "sprites/sprout/lazy.webp", "sprites/sprout/levelup.webp", "sprites/sprout/sleep.webp", "sprites/sprout/think.webp", "sprites/sprout/weekly.webp", "sprites/hamster/base.webp", "sprites/hamster/cry.webp", "sprites/hamster/done1.webp", "sprites/hamster/done2.webp", "sprites/hamster/done3.webp", "sprites/hamster/eat.webp", "sprites/hamster/empty.webp", "sprites/hamster/focus.webp", "sprites/hamster/hi.webp", "sprites/hamster/idle.webp", "sprites/hamster/lazy.webp", "sprites/hamster/levelup.webp", "sprites/hamster/sleep.webp", "sprites/hamster/think.webp", "sprites/hamster/weekly.webp"];
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
