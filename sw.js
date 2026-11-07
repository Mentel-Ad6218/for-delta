/* 潮汐手记 · 离线缓存
 * 页面与 JS/CSS 走网络优先，确保更新及时；图片等静态资源走 stale-while-revalidate。
 * config.json 永远不缓存，避免密码更换后读到旧配置。
 */

const VERSION = 'tidal-v1.5.0';
const SCOPE = self.registration.scope;

const CORE_FILES = [
  '',
  'index.html',
  'setup.html',
  'css/style.css',
  'css/setup.css',
  'js/app.js',
  'js/setup.js',
  'js/crypto.js',
  'js/github.js',
  'js/model.js',
  'js/repository.js',
  'js/reader.js',
  'js/images.js',
  'js/drawing.js',
  'js/boot-guard.js',
  'js/demo.js',
  'assets/favicon.svg',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-maskable-512.png',
  'manifest.webmanifest',
];

const CORE = CORE_FILES.map((file) => new URL(file, SCOPE).href);
const CACHE = `${VERSION}-shell`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        CORE.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'reload' });
            if (response.ok) await cache.put(url, response);
          } catch {
            /* 单个文件失败不阻断安装 */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 配置必须实时读取，绝不能由 Service Worker 缓存。
  if (url.pathname.endsWith('/config.json') || url.pathname.endsWith('/config.example.json')) {
    return;
  }

  if (request.mode === 'navigate' || /\.(?:js|css|html)$/.test(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    // 绕过 GitHub Pages / 浏览器的旧 HTTP 缓存，确保 JS/CSS 更新后能立刻拿到。
    const response = await fetch(request, { cache: 'reload' });
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const fallback = await cache.match(new URL('index.html', SCOPE).href);
    if (fallback) return fallback;
    return new Response('离线状态，暂时无法打开潮汐手记。', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  if (cached) return cached;
  const response = await network;
  if (response) return response;
  return new Response('', { status: 504 });
}
