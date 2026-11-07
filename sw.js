const CACHE_VERSION='sign-pdf-shell-v39-google';
const APP_SHELL=['./','./index.html','./document-preview.js?v=37','./google-drive-config.js','./google-drive-client.js','./google-workspace.js','./shared-signatures.js?v=31','./events.js?v=36','./google-account.js','./google-migration.js','./gmail-mail.js','./pdf-transfer.js','./events.css?v=25','./design.css?v=37','./design-ui.js?v=31','./manifest.webmanifest','./icons/signway-logo.png','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png','./icons/favicon-32.png','./vendor/pdf.min.js','./vendor/pdf.worker.min.js','./vendor/pdf-lib.min.js'];
const SHELL_URLS=new Set(APP_SHELL.map(path=>new URL(path,self.registration.scope).href));
const HOME_URL=new URL('./index.html',self.registration.scope).href;
const ENTRY_PATHS=new Set(['./','./index.html','./google-drive.html'].map(path=>new URL(path,self.registration.scope).pathname));

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
  if(event.request.mode==='navigate'?!ENTRY_PATHS.has(url.pathname):!SHELL_URLS.has(url.href))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_VERSION);
    if(event.request.mode==='navigate'){
      try{
        const response=await fetch(event.request);
        if(response.ok&&!url.search&&url.pathname!==new URL('./google-drive.html',self.registration.scope).pathname)await cache.put(HOME_URL,response.clone());
        return response;
      }catch(error){return (await cache.match(HOME_URL))||Response.error()}
    }
    return (await cache.match(event.request))||fetch(event.request);
  })());
});
