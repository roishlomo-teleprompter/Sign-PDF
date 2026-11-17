const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
async function boot(mode,search='',race=false,finishAnimation=true,online=true){
 const dom=new JSDOM(html,{url:'https://example.com/Sign-PDF/'+search,runScripts:'outside-only'}),w=dom.window;
 Object.defineProperty(w.navigator,'onLine',{configurable:true,get:()=>online});w.setNetwork=value=>{online=value;w.dispatchEvent(new w.Event(value?'online':'offline'))};
 w.console.error=()=>{};w.HTMLCanvasElement.prototype.getContext=()=>({});
 const nativeSetTimeout=w.setTimeout.bind(w);
 w.setTimeout=(fn,ms)=>nativeSetTimeout(fn,ms>=12000?10:ms);
 const holds=[];const timeout=w.setTimeout;w.setTimeout=(fn,ms)=>ms===2000?(holds.push(fn),holds.length):timeout(fn,ms);
 const calls={anonymous:0,filters:[],mounts:0};
 const user={id:'existing-device',email:mode==='owner'?'test@example.com':undefined,is_anonymous:mode!=='owner'};
 const session=['owner','anonymous'].includes(mode)?{user}:null;
 const db={auth:{getSession:()=>mode==='stalled'?new Promise(()=>{}):mode==='rejected'?Promise.reject(new Error('offline')):(race?new Promise(resolve=>setTimeout(()=>resolve({data:{session}}),15)):Promise.resolve({data:{session},error:mode==='auth-error'?new Error('auth failed'):mode==='expired'?Object.assign(new Error('invalid refresh token'),{code:'refresh_token_not_found'}):null})),onAuthStateChange:fn=>{if(race)fn('SIGNED_IN',session)},signInAnonymously:async()=>{calls.anonymous++;if(mode==='anonymous-failure')return {error:new Error('offline')};return {data:{session:{user:{id:'new-device',is_anonymous:true}}},error:null}}},from:()=>({select:()=>({eq:(column,value)=>{calls.filters.push([column,value]);return {order:async()=>({data:[],error:null})}}})}),rpc:async()=>mode==='completed'?{data:[{status:'signed',original_path:null,signed_path:null}],error:null}:{data:[],error:new Error('invalid test link')}};
 w.GoogleDriveClient=mode==='missing'?undefined:{create:()=>db};w.pdfjsLib={GlobalWorkerOptions:{}};w.PDFLib={};w.SignatureFields={edit:async pdf=>pdf,suggestion:async()=>null};
 if(race)w.SignEvents={mount(options){if(!options.localOnly)calls.mounts++;return {remove(){},render(){}}}};
 w.eval(fs.readFileSync('google-account.js','utf8'));w.eval(fs.readFileSync('design-ui.js','utf8'));w.localStorage.setItem('signway-language','he');scripts.forEach(s=>w.eval(s));await new Promise(r=>setTimeout(r,35));
 if(finishAnimation){w.document.querySelector('#startupCard animateMotion')?.dispatchEvent(new w.Event('endEvent'));holds.splice(0).forEach(fn=>fn())}
 return {w,dom,calls,holds,visible:id=>!w.document.getElementById(id).classList.contains('hidden')};
}
for(const mode of ['guest','owner','anonymous','expired','missing','stalled','rejected','auth-error','anonymous-failure'])test('startup: '+mode,async()=>{
 const b=await boot(mode);try{
 assert.equal(b.w.document.getElementById('authCard'),null);assert.equal(b.w.document.getElementById('emailInput'),null);
 if(mode==='owner'){
 assert(b.visible('appContent'));assert(!b.visible('startupCard'));assert.equal(b.calls.anonymous,0);assert.deepEqual(b.calls.filters,[['owner_id','existing-device']]);
 }else if(['guest','anonymous','expired','anonymous-failure'].includes(mode)){
 assert(!b.visible('appContent'));assert(!b.visible('startupCard'));assert.equal(b.calls.anonymous,0);assert.deepEqual(b.calls.filters,[]);assert(b.w.document.querySelector('.login-gate'));assert(b.w.document.querySelector('.google-signin'));
 }else if(mode==='missing'){assert(b.visible('startupCard'));assert(b.visible('retryStartup'));assert(!b.visible('appContent'))}else{assert(b.visible('appContent'));assert(b.visible('uploadCard'));assert(!b.visible('startupCard'));assert(!b.visible('retryStartup'))}
 }finally{b.dom.window.close()}
});
test('signing link failure stays in signer view',async()=>{const b=await boot('rejected','?sign=test-only');try{assert(b.visible('appContent'));assert(b.visible('signerCard'));assert(!b.visible('uploadCard'));assert(!b.visible('documentsSection'));assert(b.w.document.getElementById('status').classList.contains('error'))}finally{b.dom.window.close()}});
test('language switch after direct entry remains usable',async()=>{const b=await boot('guest');try{b.w.document.getElementById('englishBtn').click();assert.equal(b.w.document.documentElement.lang,'en');assert(!b.visible('appContent'));assert.equal(b.calls.anonymous,0);assert.match(b.w.document.querySelector('.login-gate h1').textContent,/The easy way/);b.w.document.getElementById('hebrewBtn').click();assert.equal(b.w.document.documentElement.lang,'he')}finally{b.dom.window.close()}});

test('overlapping sign-in event and initial session do not remount the same account dashboard',async()=>{const b=await boot('owner','',true);try{assert.equal(b.calls.mounts,1);assert(b.visible('appContent'))}finally{b.dom.window.close()}});

test('completed signing link displays success without requesting PDF access or re-signing',async()=>{const b=await boot('completed','?sign=completed-test');try{assert.match(b.w.document.getElementById('status').textContent,/כבר נחתם/);assert(!b.w.document.getElementById('status').classList.contains('error'));assert(b.visible('signerCard'));assert(!b.visible('pdfViewerOverlay'))}finally{b.dom.window.close()}});

test('startup waits for the complete signature before revealing the prepared app',async()=>{const b=await boot('owner','',false,false);try{assert(b.visible('startupCard'));assert(b.w.document.body.classList.contains('startup-pending'));const motion=b.w.document.querySelector('#startupCard animateMotion');assert.equal(motion.getAttribute('repeatCount'),'1');assert.equal(motion.getAttribute('dur'),'4s');assert.equal(b.w.document.querySelector('#startupCard animate').getAttribute('dur'),'4s');assert.equal(motion.getAttribute('fill'),'freeze');assert.equal(b.w.document.querySelectorAll('#startupCard svg rect').length,0);motion.dispatchEvent(new b.w.Event('endEvent'));assert(b.visible('startupCard'));assert(b.w.document.body.classList.contains('startup-pending'));assert.equal(b.holds.length,1);motion.dispatchEvent(new b.w.Event('endEvent'));assert.equal(b.holds.length,1);b.holds[0]();assert(!b.visible('startupCard'));assert(!b.w.document.body.classList.contains('startup-pending'));assert(b.visible('appContent'))}finally{b.dom.window.close()}});

test('intro keeps its initial viewport height while the destination screen prepares',async()=>{const b=await boot('guest','',false,false);try{const height=b.w.document.body.style.getPropertyValue('--startup-height');assert.equal(height,b.w.innerHeight+'px');assert(b.w.document.body.classList.contains('login-mode'));b.w.innerHeight=500;b.w.dispatchEvent(new b.w.Event('resize'));assert.equal(b.w.document.body.style.getPropertyValue('--startup-height'),height);assert(b.visible('startupCard'));assert(b.w.document.body.classList.contains('startup-pending'))}finally{b.dom.window.close()}});

test('intro displays cached account artwork before verification without granting workspace access',()=>{const dom=new JSDOM(html,{url:'https://example.com/Sign-PDF/',runScripts:'outside-only'}),w=dom.window;try{w.localStorage.setItem('signway-google-session-v2',JSON.stringify({user:{id:'cached',email:'test@example.com',is_anonymous:false,user_metadata:{full_name:'Test User',avatar_url:'javascript:bad'}}}));const intro=scripts.find(source=>source.includes('Cached profile is visual only'));assert(intro);w.eval(intro);const preview=w.document.querySelector('.startup-account-preview');assert(preview);assert.equal(preview.title,'test@example.com');assert.equal(preview.querySelector('.profile-button').textContent,'TU');assert.equal(preview.querySelector('img'),null);assert.equal(preview.querySelector('button'),null);assert(w.document.getElementById('appContent').classList.contains('hidden'))}finally{w.close()}});

test('offline launch opens the upload screen without identity or Drive access and verifies on reconnect',async()=>{const b=await boot('owner','',false,true,false);try{assert(!b.visible('startupCard'));assert(b.visible('appContent'));assert(b.visible('uploadCard'));assert(!b.visible('retryStartup'));assert(!b.visible('networkNotice'));assert.deepEqual(b.calls.filters,[]);b.w.setNetwork(true);await new Promise(r=>setTimeout(r,35));assert.deepEqual(b.calls.filters,[['owner_id','existing-device']])}finally{b.w.close()}});
test('losing internet after startup preserves the current view and shows a notice, without remounting on reconnect',async()=>{const b=await boot('owner');try{const canvas=b.w.document.getElementById('pdfCanvas');canvas.dataset.unsaved='local-work';const count=b.calls.filters.length;b.w.setNetwork(false);assert(!b.visible('networkNotice'));assert(!b.visible('startupCard'));assert(b.visible('appContent'));b.w.setNetwork(true);await new Promise(r=>setTimeout(r,20));assert(!b.visible('networkNotice'));assert.equal(canvas.dataset.unsaved,'local-work');assert.equal(b.calls.filters.length,count)}finally{b.w.close()}});
