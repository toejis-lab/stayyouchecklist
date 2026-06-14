/* ============================================================
   StayCheck Service Worker
   ------------------------------------------------------------
   핵심: HTML(앱 코드)은 "네트워크 우선"으로 가져온다.
   → 온라인이면 GitHub에 올린 최신 index.html을 항상 받아오고,
     오프라인일 때만 캐시본을 보여준다.
   → 새 버전을 올리면 앱을 다시 열기만 해도 바로 반영된다.
   ============================================================ */

// 캐시 이름 (오프라인 폴백용). 옛 캐시는 activate 때 전부 지운다.
const CACHE_NAME = 'staycheck-cache-v6';

// 설치되면 기다리지 않고 즉시 활성화 (새 버전 빠르게 적용)
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// 활성화되면: 이전 캐시 전부 삭제 + 모든 탭을 즉시 이 SW가 제어
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// index.html에서 보낸 메시지로 즉시 캐시 비우기 / skipWaiting 트리거
self.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (msg === 'CLEAR_CACHE') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    })());
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // GET 요청만 처리
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Firebase / Firestore / Storage / gstatic 등 외부 통신은 SW가 건드리지 않음
  // (실시간 동기화·이미지 업로드가 캐시 때문에 꼬이지 않게)
  if (url.origin !== self.location.origin) return;

  const isHTML =
    req.mode === 'navigate' ||
    req.destination === 'document' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('/');

  if (isHTML) {
    // ── 앱 코드(HTML): 네트워크 우선 ──
    // 온라인이면 항상 최신본을 가져오고, 받은 즉시 캐시도 갱신.
    // 네트워크 실패(오프라인)면 캐시본으로 폴백.
    event.respondWith((async () => {
      try {
        // cache:'reload' → 브라우저 HTTP 캐시도 무시하고 서버에서 새로 받음
        const fresh = await fetch(req, { cache: 'reload' });
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match(req);
        if (cached) return cached;
        // 마지막 폴백: 캐시에 저장된 아무 페이지라도
        const fallback = await caches.match('./') || await caches.match('./index.html');
        if (fallback) return fallback;
        throw e;
      }
    })());
    return;
  }

  // ── 그 외 동일 출처 정적 자원: 캐시 우선 + 백그라운드 갱신 ──
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === 'basic') {
        caches.open(CACHE_NAME).then((c) => c.put(req, res.clone()));
      }
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});
