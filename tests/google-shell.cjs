const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function worker({offline=false}={}){
 const handlers={},puts=[],removed=[],listed=[],scope='https://example.com/Sign-PDF/',fallback=new Response('Google shell');
 const cache={addAll:async requests=>listed.push(...requests.map(r=>r.url)),match:async key=>key===scope+'index.html'?fallback:undefined,put:async(...args)=>puts.push(args)};
 const ctx={URL,Set,Request:class extends Request{constructor(input,options){super(new URL(input,scope),options)}},Response,caches:{open:async()=>cache,keys:async()=>['sign-pdf-shell-v38','sign-pdf-shell-v39-google','sign-pdf-shell-v40-google','unrelated'],delete:async key=>removed.push(key)},fetch:async()=>{if(offline)throw Error('offline');return new Response('network')},self:{location:new URL(scope),registration:{scope},addEventListener:(name,handler)=>handlers[name]=handler,skipWaiting:async()=>{},clients:{claim:async()=>{}}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('sw.js','utf8'),ctx);
 return {puts,removed,listed,async lifecycle(name){let done;handlers[name]({waitUntil:p=>done=p});await done},request(path,{navigate=false}={}){let response;handlers.fetch({request:{method:'GET',url:new URL(path,scope).href,mode:navigate?'navigate':'cors'},respondWith:p=>response=p});return response}};
}
test('default entry and cached shell use only Google identity and personal storage',async()=>{
 const html=fs.readFileSync('index.html','utf8');assert(!/supabase|shared-drive\.js|drive-workspace\.js|account-auth\.js/.test(html));assert(html.includes("serviceWorker.register('./sw.js'"));
 const w=worker();await w.lifecycle('install');assert(w.listed.some(x=>x.endsWith('/google-drive-client.js')));assert(!w.listed.some(x=>/supabase|account-auth|drive-workspace|shared-drive/.test(x)));
 for(const url of w.listed){const path=new URL(url).pathname.replace('/Sign-PDF/','');if(path)assert(fs.existsSync(path),path)}
});
test('activation removes old application caches while retaining unrelated caches',async()=>{const w=worker();await w.lifecycle('activate');assert.deepEqual(w.removed,['sign-pdf-shell-v38','sign-pdf-shell-v39-google'])});
test('private files, external services and obsolete tools never enter the shell cache',()=>{
 const w=worker();for(const path of ['private.pdf','drive-migration.html','drive-preview.html','https://script.google.com/macros/s/service/exec'])assert.equal(w.request(path),undefined);
 assert.equal(w.request('drive-migration.html',{navigate:true}),undefined);
});
test('only the default public navigation updates the offline home',async()=>{
 const w=worker();await w.request('index.html',{navigate:true});assert.equal(w.puts.length,1);assert.equal(w.puts[0][0],'https://example.com/Sign-PDF/index.html');
 await w.request('index.html?sign=private-token',{navigate:true});await w.request('google-drive.html',{navigate:true});assert.equal(w.puts.length,1);
 const offline=worker({offline:true});assert.equal(await (await offline.request('?sign=private-token',{navigate:true})).text(),'Google shell');assert.equal(offline.puts.length,0);
});
