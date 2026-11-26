// Service worker da app instalável (PWA).
// - Páginas: sempre da rede (versão mais recente); sem rede, abre a última versão guardada.
// - Ficheiros da aplicação (/assets/…, ícones): guardados para abrir mais depressa.
// - Dados (Supabase, Google): nunca passam por aqui (outros domínios), por isso nunca ficam em cache.
const CACHE = 'pc-app-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const c = r.clone(); caches.open(CACHE).then((k) => k.put('/', c)); return r }).catch(() => caches.match('/')))
    return
  }
  if (url.pathname.startsWith('/assets/') || /\.(png|webmanifest)$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((k) => k.put(req, c)) } return r })))
  }
})
