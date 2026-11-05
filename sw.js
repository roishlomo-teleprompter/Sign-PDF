const CACHE_VERSION='sign-pdf-shell-v23';
const APP_SHELL=['./','./index.html','./events.js','./account-auth.js','./gmail-mail.js','./pdf-transfer.js','./drive-storage.js','./events.css','./manifest.webmanifest','./icons/signway-logo.png','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png','./icons/favicon-32.png','./vendor/pdf.min.js','./vendor/pdf.worker.min.js','./vendor/pdf-lib.min.js','./vendor/supabase.js'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE_VERSION).then(cache=>cache.addAll(APP_SHELL.map(url=>new Request(url,{cache:'reload'})))).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('sign-pdf-shell-')&&key!==CACHE_VERSION).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  // Private API and storage requests must never enter the app shell cache.
  if(url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_VERSION);
    if(event.request.mode==='navigate'){
      try{
        const response=await fetch(event.request);
        if(response.ok&&!url.search)await cache.put('./index.html',response.clone());
        return response;
      }catch(error){return (await cache.match('./index.html'))||Response.error()}
    }
    return (await cache.match(event.request))||fetch(event.request);
  })());
});
