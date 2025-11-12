/* sw.js — IMAX PWA 캐싱 전략
   - HTML: Network First (오프라인 시 캐시 폴백)
   - Assets(JS/CSS/img): Stale-While-Revalidate
   - 즉시 활성화 + 구캐시 정리
*/

const CACHE_NAME = 'imax-cache';
const ASSET_CACHE = 'imax-assets';

// 구캐시 정리
async function cleanOldCaches() {
  const keep = new Set([CACHE_NAME, ASSET_CACHE]);
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k)));
}

// 설치: 즉시 대기 해제
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// 활성화: 구캐시 삭제 + 즉시 클라이언트 장악
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await cleanOldCaches();
    await self.clients.claim();
  })());
});

// HTML은 네트워크 우선
async function networkFirstHTML(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    const fallback = await caches.match('/index.html');
    if (fallback) return fallback;
    throw err;
  }
}

// 정적 리소스는 SWR
async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((res) => {
      if (res && res.status === 200) cache.put(request, res.clone());
      return res;
    })
    .catch(() => null);

  return cached || fetchPromise || new Response('', { status: 504 });
}

// 요청 분기
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;

  // HTML (탐색)
  const isHTML = req.mode === 'navigate' ||
                 (req.headers.get('accept') || '').includes('text/html');

  if (isHTML && isSameOrigin) {
    event.respondWith(networkFirstHTML(req));
    return;
  }

  // 정적 리소스
  if (
    isSameOrigin &&
    (url.pathname.endsWith('.js') ||
     url.pathname.endsWith('.css') ||
     url.pathname.endsWith('.png') ||
     url.pathname.endsWith('.jpg') ||
     url.pathname.endsWith('.jpeg') ||
     url.pathname.endsWith('.webp') ||
     url.pathname.endsWith('.svg') ||
     url.pathname.endsWith('.ico') ||
     url.pathname.endsWith('.woff') ||
     url.pathname.endsWith('.woff2'))
  ) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // 그 외(동일 오리진 API 등): 네트워크 우선 + 캐시 폴백
  if (isSameOrigin) {
    event.respondWith((async () => {
      try { return await fetch(req); }
      catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        throw new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // 외부 오리진은 기본 네트워크 우선 (필요하면 도메인별 규칙 추가)
});
