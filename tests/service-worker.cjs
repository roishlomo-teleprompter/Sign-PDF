const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function worker(){const handlers={},calls={puts:[],shell:[]},fresh={ok:true,clone(){return this}},cached={old:true};const cache={addAll:async requests=>{calls.shell=requests},put:async(...args)=>{calls.puts.push(args);if(args.length!==2||typeof args[1]!=='object')throw new TypeError('Invalid Cache.put response')},match:async()=>cached};const context={self:{location:{origin:'https://example.com'},registration:{scope:'https://example.com/Sign-PDF/'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}},caches:{open:async()=>cache},Request:class{constructor(url,options){this.url=url;this.cache=options.cache}},URL,Response:{error:()=>({error:true})},fetch:async()=>fresh};vm.runInNewContext(fs.readFileSync('sw.js','utf8'),context);return {handlers,calls,fresh,cached}}
test('new app-shell installs fetch fresh assets rather than reuse the browser HTTP cache',async()=>{const w=worker();let pending;w.handlers.install({waitUntil:p=>pending=p});await pending;assert(w.calls.shell.some(r=>r.url==='./events.js?v=25'));assert(w.calls.shell.every(r=>r.cache==='reload'))});
test('successful navigation returns the fresh page and stores a valid response instead of falling back to old HTML',async()=>{const w=worker();let pending;w.handlers.fetch({request:{method:'GET',url:'https://example.com/Sign-PDF/',mode:'navigate'},respondWith:p=>pending=p});assert.equal(await pending,w.fresh);assert.equal(w.calls.puts.length,1);assert.equal(w.calls.puts[0].length,2);assert.equal(w.calls.puts[0][0],'./index.html');assert.equal(w.calls.puts[0][1],w.fresh)});

const {JSDOM}=require('jsdom');
test('first PDF picker interaction survives a background service worker update',()=>{
 const html=fs.readFileSync('index.html','utf8'),startup=[...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)][0][1];
 const dom=new JSDOM(html,{url:'https://example.com/Sign-PDF/',runScripts:'outside-only'}),w=dom.window,worker=new w.EventTarget();let reloads=0;
 dom.virtualConsole.on('jsdomError',e=>{if(/navigation/i.test(e.message))reloads++});
 worker.controller={};worker.register=async()=>({});Object.defineProperty(w.navigator,'serviceWorker',{value:worker});
 try{w.eval(startup);w.finishStartup();const input=w.document.getElementById('fileInput');input.click();worker.dispatchEvent(new w.Event('controllerchange'));assert.equal(reloads,0,'background update must not reload an active PDF picker')}finally{w.close()}
});
