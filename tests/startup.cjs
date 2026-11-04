const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
async function boot(mode,search=''){
 const dom=new JSDOM(html,{url:'https://example.com/Sign-PDF/'+search,runScripts:'outside-only'}),w=dom.window;
 w.console.error=()=>{};
 w.HTMLCanvasElement.prototype.getContext=()=>({});
 const nativeSetTimeout=w.setTimeout.bind(w);
 w.setTimeout=(fn,ms)=>nativeSetTimeout(fn,ms>=12000?10:ms);
 const session=mode==='owner'?{user:{email:'test@example.com',is_anonymous:false}}:null;
 const db={auth:{getSession:()=>mode==='stalled'?new Promise(()=>{}):mode==='rejected'?Promise.reject(new Error('offline')):Promise.resolve({data:{session},error:mode==='auth-error'?new Error('auth failed'):null}),onAuthStateChange:()=>{},signInAnonymously:async()=>({error:new Error('offline')}),signInWithOtp:async()=>{throw new Error('offline')}},from:()=>({select:()=>({order:async()=>({data:[],error:null})})})};
 w.supabase=mode==='missing'?undefined:{createClient:()=>db};w.pdfjsLib={GlobalWorkerOptions:{}};w.PDFLib={};
 scripts.forEach(s=>w.eval(s));await new Promise(r=>setTimeout(r,35));
 return {w,dom,visible:id=>!w.document.getElementById(id).classList.contains('hidden')};
}
for(const mode of ['guest','owner','missing','stalled','rejected','auth-error'])test('startup: '+mode,async()=>{
 const b=await boot(mode);try{
 if(mode==='guest'){assert(b.visible('authCard'));assert(!b.visible('startupCard'));assert(!b.visible('appContent'))}
 else if(mode==='owner'){assert(b.visible('appContent'));assert(b.visible('uploadCard'));assert(b.visible('documentsSection'));assert(!b.visible('authCard'));assert(!b.visible('startupCard'))}
 else{assert(b.visible('startupCard'));assert(b.visible('retryStartup'));assert(!b.visible('appContent'))}
 }finally{b.dom.window.close()}
});
test('signing link session failure displays an error inside signer screen',async()=>{const b=await boot('rejected','?sign=test-only');try{assert(b.visible('appContent'));assert(b.visible('signerCard'));assert(!b.visible('uploadCard'));assert(!b.visible('documentsSection'));assert(b.w.document.getElementById('status').classList.contains('error'));assert(b.w.document.getElementById('status').textContent.includes('קישור החתימה'))}finally{b.dom.window.close()}});
test('language switch and failed login remain usable',async()=>{const b=await boot('guest');try{b.w.document.getElementById('englishBtn').click();assert.equal(b.w.document.documentElement.lang,'en');b.w.document.getElementById('emailInput').value='test@example.com';await b.w.document.getElementById('loginBtn').onclick();assert(!b.w.document.getElementById('loginBtn').disabled);assert(b.w.document.getElementById('authStatus').textContent.includes('Could not send'))}finally{b.dom.window.close()}});
