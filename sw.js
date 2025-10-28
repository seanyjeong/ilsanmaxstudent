const CACHE_NAME = 'imax-student-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/welcome.html', // index.html의 기본 iframe src
  '/search.html',
  '/saved_list.html',
  '/practical.html',
  '/mypage.html',
  '/practical_settings.html',
  '/history_view.html',
  '/student_login.html',
  '/student_register.html',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css'
];

// 1. 서비스 워커 설치
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// 2. 요청 처리 (캐시 우선)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // 캐시에 있으면 캐시 반환
        if (response) {
          return response;
        }
        // 캐시에 없으면 네트워크로 요청
        return fetch(event.request);
      }
    )
  );
});