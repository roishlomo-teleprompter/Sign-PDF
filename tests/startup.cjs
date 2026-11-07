const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
async function boot(mode,search='',race=false){
 const dom=new JSDOM(html,{url:'https://example.com/Sign-PDF/'+search,runScripts:'outside-only'}),w=dom.window;
 w.console.error=()=>{};w.HTMLCanvasElement.prototype.getContext=()=>({});
 const nativeSetTimeout=w.setTimeout.bind(w);
 w.setTimeout=(fn,ms)=>nativeSetTimeout(fn,ms>=12000?10:ms);
 const calls={anonymous:0,filters:[],mounts:0};
 const user={id:'existing-device',email:mode==='owner'?'test@example.com':undefined,is_anonymous:mode!=='owner'};
 const session=['owner','anonymous'].includes(mode)?{user}:null;
 const db={auth:{getSession:()=>mode==='stalled'?new Promise(()=>{}):mode==='rejected'?Promise.reject(new Error('offline')):(race?new Promise(resolve=>setTimeout(()=>resolve({data:{session}}),15)):Promise.resolve({data:{session},error:mode==='auth-error'?new Error('auth failed'):mode==='expired'?Object.assign(new Error('invalid refresh token'),{code:'refresh_token_not_found'}):null})),onAuthStateChange:fn=>{if(race)fn('SIGNED_IN',session)},signInAnonymously:async()=>{calls.anonymous++;if(mode==='anonymous-failure')return {error:new Error('offline')};return {data:{session:{user:{id:'new-device',is_anonymous:true}}},error:null}}},from:()=>({select:()=>({eq:(column,value)=>{calls.filters.push([column,value]);return {order:async()=>({data:[],error:null})}}})}),rpc:async()=>mode==='completed'?{data:[{status:'signed',original_path:null,signed_path:null}],error:null}:{data:[],error:new Error('invalid test link')}};
 w.GoogleDriveClient=mode==='missing'?undefined:{create:()=>db};w.pdfjsLib={GlobalWorkerOptions:{}};w.PDFLib={};
 if(race)w.SignEvents={mount(){calls.mounts++;return {remove(){},render(){}}}};
 w.eval(fs.readFileSync('google-account.js','utf8'));w.eval(fs.readFileSync('design-ui.js','utf8'));w.localStorage.setItem('signway-language','he');scripts.forEach(s=>w.eval(s));await new Promise(r=>setTimeout(r,35));
 return {w,dom,calls,visible:id=>!w.document.getElementById(id).classList.contains('hidden')};
}
for(const mode of ['guest','owner','anonymous','expired','missing','stalled','rejected','auth-error','anonymous-failure'])test('startup: '+mode,async()=>{
 const b=await boot(mode);try{
 assert.equal(b.w.document.getElementById('authCard'),null);assert.equal(b.w.document.getElementById('emailInput'),null);
 if(mode==='owner'){
 assert(b.visible('appContent'));assert(!b.visible('startupCard'));assert.equal(b.calls.anonymous,0);assert.deepEqual(b.calls.filters,[['owner_id','existing-device']]);
 }else if(['guest','anonymous','expired','anonymous-failure'].includes(mode)){
 assert(!b.visible('appContent'));assert(!b.visible('startupCard'));assert.equal(b.calls.anonymous,0);assert.deepEqual(b.calls.filters,[]);assert(b.w.document.querySelector('.login-gate'));assert(b.w.document.querySelector('.google-signin'));
 }else{assert(b.visible('startupCard'));assert(b.visible('retryStartup'));assert(!b.visible('appContent'))}
 }finally{b.dom.window.close()}
});
test('signing link failure stays in signer view',async()=>{const b=await boot('rejected','?sign=test-only');try{assert(b.visible('appContent'));assert(b.visible('signerCard'));assert(!b.visible('uploadCard'));assert(!b.visible('documentsSection'));assert(b.w.document.getElementById('status').classList.contains('error'))}finally{b.dom.window.close()}});
test('language switch after direct entry remains usable',async()=>{const b=await boot('guest');try{b.w.document.getElementById('englishBtn').click();assert.equal(b.w.document.documentElement.lang,'en');assert(!b.visible('appContent'));assert.equal(b.calls.anonymous,0);assert.match(b.w.document.querySelector('.login-gate h1').textContent,/The easy way/);b.w.document.getElementById('hebrewBtn').click();assert.equal(b.w.document.documentElement.lang,'he')}finally{b.dom.window.close()}});

test('overlapping sign-in event and initial session do not remount the same account dashboard',async()=>{const b=await boot('owner','',true);try{assert.equal(b.calls.mounts,1);assert(b.visible('appContent'))}finally{b.dom.window.close()}});

test('completed signing link displays success without requesting PDF access or re-signing',async()=>{const b=await boot('completed','?sign=completed-test');try{assert.match(b.w.document.getElementById('status').textContent,/כבר נחתם/);assert(!b.w.document.getElementById('status').classList.contains('error'));assert(b.visible('signerCard'));assert(!b.visible('pdfViewerOverlay'))}finally{b.dom.window.close()}});
