// StayCheck Service Worker
// 외부 파일이어야 PWA 설치 가능 (Blob URL은 보안상 거부됨)

const CACHE = 'staycheck-v6-external';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // 이전 캐시 정리
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // 외부 서비스는 SW가 건드리지 않음
  const skipDomains = [
    'mymemory.translated.net',
    'firestore.googleapis.com',
    'firebasestorage.googleapis.com',
    'firebaseapp.com',
    'googleapis.com',
    'gstatic.com'
  ];
  for (const d of skipDomains) {
    if (req.url.indexOf(d) !== -1) return;
  }

  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        try {
          const u = new URL(req.url);
          if (u.origin === self.location.origin && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(req, clone));
          }
        } catch (_) {}
        return res;
      }).catch(() => {
        if (req.mode === 'navigate') {
          return caches.match(self.location.origin + self.registration.scope)
              || new Response('offline');
        }
        return new Response('offline', {status: 503});
      });
    })
  );
});
