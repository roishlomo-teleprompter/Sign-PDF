const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),{JSDOM}=require('jsdom');
const source=fs.readFileSync('drive-storage.js','utf8');
test('Drive channel rejects foreign origins and mismatched windows before dispatching session tokens',async()=>{
 const d=new JSDOM('<body></body>',{url:'https://roishlomo-teleprompter.github.io/Sign-PDF/',runScripts:'outside-only'}),w=d.window;w.eval(source);let sessions=0;const store=w.DriveStorage.create({auth:{getSession:async()=>{sessions++;return {data:{session:{access_token:'owner-jwt'}}}}}});try{
  assert(w.DriveStorage.enabled({email:'ROI.SHLOMO@GMAIL.COM'}));assert(!w.DriveStorage.enabled({email:'other@gmail.com'}));assert(!w.DriveStorage.enabled({email:'roi.shlomo@gmail.com',is_anonymous:true}));
  const frame=w.document.querySelector('iframe'),channel=new URL(frame.src).searchParams.get('channel'),sent=[];const peer={postMessage:(m,origin)=>sent.push({m,origin})};
  const event=(origin,data,source=peer)=>w.dispatchEvent(new w.MessageEvent('message',{origin,data,source}));
  const ready={type:'signway-drive-ready',channel};event('https://evil.example',ready);event('https://n-test-script.googleusercontent.com',{...ready,channel:'wrong'});assert.equal(sessions,0);
  const origin='https://n-test-script.googleusercontent.com';event(origin,ready);const pending=store.call('list');await new Promise(r=>setTimeout(r,0));assert.equal(sent.length,1);assert.equal(sent[0].origin,origin);assert.equal(sent[0].m.accessToken,'owner-jwt');
  const result={type:'signway-drive-result',channel,id:sent[0].m.id,data:[{status:'signed'}]};event(origin,result,{});event('https://evil.example',result);event(origin,result);assert.equal((await pending)[0].status,'signed');
 }finally{store.dispose();w.close()}
});
test('Drive upload preserves PDF bytes and does not send oversized files',async()=>{
 const d=new JSDOM('<body></body>',{url:'https://roishlomo-teleprompter.github.io/Sign-PDF/',runScripts:'outside-only'}),w=d.window;w.eval(source);const store=w.DriveStorage.create({auth:{getSession:async()=>({data:{session:{access_token:'owner-jwt'}}})}});try{await assert.rejects(store.upload({bytes:new Uint8Array(5*1024*1024+1)}),/5MB/);const channel=new URL(w.document.querySelector('iframe').src).searchParams.get('channel'),origin='https://n-test-script.googleusercontent.com';let request;const peer={postMessage:m=>{request=m}};w.dispatchEvent(new w.MessageEvent('message',{origin,source:peer,data:{channel,type:'signway-drive-ready'}}));const pending=store.upload({name:'x.pdf',bytes:new Uint8Array([37,80,68,70,45,255])});await new Promise(r=>setTimeout(r,0));assert.equal(request.payload.base64,'JVBERi3/');w.dispatchEvent(new w.MessageEvent('message',{origin,source:peer,data:{channel,type:'signway-drive-result',id:request.id,data:{url:'signed-link'}}}));assert.equal((await pending).url,'signed-link')}finally{store.dispose();w.close()}
});
