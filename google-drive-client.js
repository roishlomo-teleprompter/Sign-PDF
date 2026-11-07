/* Google-only identity, isolated sessions and private Drive workspace access. */
window.GoogleDriveClient=(()=>{
 const KEY='signway-google-session-v2';
 function create(){
  const config=window.SIGNWAY_GOOGLE_CONFIG||{};
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[-\w]+\/exec$/.test(config.endpoint||''))throw new Error('נדרשת הגדרת חיבור Google החדש לפני הפעלת גרסה זו.');
  let callbackPromise=null;
  let session=null;try{session=JSON.parse(localStorage.getItem(KEY)||'null')}catch{}const listeners=new Set();
  const transport=googleTransport(config.endpoint,()=>session?.access_token),failure=error=>({data:null,error});
  const save=value=>{session=value;try{value?localStorage.setItem(KEY,JSON.stringify(value)):localStorage.removeItem(KEY)}catch{}};
  const emit=event=>listeners.forEach(fn=>fn(event,session));
  const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
  const auth={
   async getSession(){try{
    const fragment=new URLSearchParams(location.hash.slice(1));
    if(fragment.has('google_handoff')){
     if(!callbackPromise)callbackPromise=(async()=>{const proofKey='signway-google-proof:'+fragment.get('proof_hash'),proof=localStorage.getItem(proofKey);history.replaceState(null,'',location.pathname+location.search);if(!proof)throw new Error('Return to the browser where Google sign-in was started.');const result=await transport.call('auth-finish',{handoff:fragment.get('google_handoff'),proof});localStorage.removeItem(proofKey);save({access_token:result.session});localStorage.setItem('signway-google-complete:'+fragment.get('proof_hash'),result.session)})();
     await callbackPromise;
    }
    if(!session)return {data:{session:null},error:null};const result=await transport.call('auth-session');save(result);return {data:{session},error:null}}catch(error){if(/Sign in again/.test(error.message)){save(null);return {data:{session:null},error:null}}return failure(error)}},
   async getUser(){const result=await auth.getSession();return result.error?result:{data:{user:result.data.session?.user||null},error:null}},
   async signInAnonymously(){try{if(!session||!session.user?.is_anonymous)save(await transport.call('auth-guest'));return {data:{session,user:session.user},error:null}}catch(e){return failure(e)}},
   async signInWithOAuth({options={}}={}){
    const popup=window.open('about:blank','signway-google-login','popup,width=520,height=720');if(!popup)return failure(new Error('Allow the Google sign-in popup and try again.'));
    try{
     const proof=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
     const proofHash=await digest(proof);localStorage.setItem('signway-google-proof:'+proofHash,proof);const previous=session?.access_token;
     const result=await transport.call('auth-begin',{proofHash,gmail:String(options.scopes||'').includes('gmail.send')});popup.location.href=result.url;
     const deadline=Date.now()+590000;let finished;
     while(Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,1200));let stored;try{stored=JSON.parse(localStorage.getItem(KEY)||'null')}catch{}if(stored?.access_token&&stored.access_token===localStorage.getItem('signway-google-complete:'+proofHash)&&stored.access_token!==previous){localStorage.removeItem('signway-google-complete:'+proofHash);finished=stored;break}if(popup.closed)throw new Error('Google sign-in was closed. Try again.')}
     if(!finished)throw new Error('Google authorization expired');
     save(finished);const verified=await auth.getSession();if(verified.error)throw verified.error;emit('SIGNED_IN');return {data:{url:result.url},error:null};
    }catch(e){return failure(e)}finally{popup.close()}
   },
   async updateUser(values){try{if(!values?.data||Object.keys(values.data).some(k=>k!=='signway_gmail_send_confirmed_v1'))throw new Error('Unsupported preference');await transport.call('workspace-owner-call',{op:'settings-set',settings:{gmailSendConfirmed:values.data.signway_gmail_send_confirmed_v1}});return auth.getUser()}catch(e){return failure(e)}},
   async signOut(){try{if(session)await transport.call('auth-logout');save(null);emit('SIGNED_OUT');return {error:null}}catch(e){return failure(e)}},
   onAuthStateChange(fn){listeners.add(fn);return {data:{subscription:{unsubscribe:()=>listeners.delete(fn)}}}}
  };
  window.SharedDrive={create:()=>transport,enabled:user=>!!user&&!user.is_anonymous&&!!user.id};
  const db=GoogleWorkspace.create({auth});
  db.signwayGmailToken=async()=>{const r=await transport.call('auth-gmail-token');return r.token};
  return db;
 }
 function googleTransport(endpoint,sessionToken){
  let source,origin,disposed=false,readyResolve,readyReject;const pending=new Map(),channel=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject});ready.catch(()=>{});const timer=setTimeout(()=>readyReject(new Error('Google service connection timed out')),25000);
  const frame=document.createElement('iframe');frame.hidden=true;frame.referrerPolicy='no-referrer';frame.title='SignWay Google connection';frame.src=endpoint+'?mode=bridge&channel='+channel;
  function receive(event){const m=event.data;if(disposed||!m||m.channel!==channel||!/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(event.origin))return;
   if(m.type==='signway-drive-ready'&&!source){source=event.source;origin=event.origin;clearTimeout(timer);readyResolve();return}
   if(event.source!==source||event.origin!==origin||m.type!=='signway-drive-result')return;const task=pending.get(m.id);if(!task)return;pending.delete(m.id);clearTimeout(task.timer);m.error?task.reject(new Error(m.error)):task.resolve(m.data);
  }
  window.addEventListener('message',receive);document.body.append(frame);
  return {async call(action,payload={}){if(disposed)throw new Error('Connection closed');await ready;const id=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('No confirmation received. Check before retrying.'))},['import-start','import-finish'].includes(action)?300000:60000);pending.set(id,{resolve,reject,timer});source.postMessage({type:'signway-drive-request',channel,id,action,payload,accessToken:action.startsWith('shared-public-')||['auth-finish','auth-guest','workspace-public-resolve'].includes(action)?undefined:sessionToken()},origin)})},dispose(){disposed=true;clearTimeout(timer);readyReject(new Error('Connection closed'));window.removeEventListener('message',receive);frame.remove();for(const task of pending.values()){clearTimeout(task.timer);task.reject(new Error('Connection closed'))}pending.clear()}};
 }
 return {create};
})();
