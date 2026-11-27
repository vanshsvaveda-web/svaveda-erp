/* Never store signed-in pages, API responses, messages or credentials offline. */
const STATIC_CACHE='svaveda-public-v3-brand';
const PUBLIC_FILES=['/offline.html','/logo.svg','/logo.png','/icons/app-192.png','/icons/app-512.png','/icons/maskable-512.png','/icons/favicon-32.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(STATIC_CACHE).then(cache=>cache.addAll(PUBLIC_FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('svaveda-public-')&&key!==STATIC_CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).catch(()=>caches.open(STATIC_CACHE).then(cache=>cache.match('/offline.html'))));return;
 }
 if(!PUBLIC_FILES.includes(url.pathname)&&!/^\/[a-z-]+\.[a-f0-9]{12}\.(?:css|js)$/.test(url.pathname))return;
 event.respondWith(caches.open(STATIC_CACHE).then(async cache=>{
  const cached=await cache.match(request);if(cached)return cached;
  const response=await fetch(request);if(response.ok){try{await cache.put(request,response.clone());const keys=await cache.keys();if(keys.length>64)await cache.delete(keys[0])}catch{}}return response;
 }));
});
