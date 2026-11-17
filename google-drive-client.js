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
    if(fragment.has('google_code')||fragment.has('google_error')){
     if(!callbackPromise)callbackPromise=(async()=>{const state=fragment.get('google_state'),key='signway-google-state:'+state,stored=JSON.parse(localStorage.getItem(key)||'null');history.replaceState(null,'',location.pathname+location.search);if(!stored||stored.expires<Date.now())throw new Error('Google authorization expired');const proof=localStorage.getItem('signway-google-proof:'+stored.proofHash);if(!proof)throw new Error('Return to the browser where Google sign-in was started.');const response=await transport.call('auth-site-callback',{state,proof,code:fragment.get('google_code'),error:fragment.get('google_error')});const completion=new URL(response.completion);if(completion.origin!==location.origin||completion.pathname!==location.pathname)throw new Error('Invalid callback destination');const finish=new URLSearchParams(completion.hash.slice(1));if(finish.get('proof_hash')!==stored.proofHash)throw new Error('Browser proof mismatch');const result=await transport.call('auth-finish',{handoff:finish.get('google_handoff'),proof});localStorage.removeItem(key);localStorage.removeItem('signway-google-proof:'+stored.proofHash);save({access_token:result.session});localStorage.setItem('signway-google-complete:'+stored.proofHash,result.session)})();
     await callbackPromise;
    }
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
     const result=await transport.call('auth-begin',{proofHash,gmail:String(options.scopes||'').includes('gmail.send')});const oauthState=new URL(result.url).searchParams.get('state');if(!/^[a-f0-9]{96}$/.test(oauthState||''))throw new Error('Invalid state');localStorage.setItem('signway-google-state:'+oauthState,JSON.stringify({proofHash,expires:Date.now()+600000}));popup.location.href=result.url;
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
  async function finishDeletion(result){for(let rounds=0;result.cleanupPending&&rounds<100;rounds++){const cleanup=await transport.call('workspace-owner-call',{op:'deletion-cleanup'});result.cleanupPending=cleanup.cleanupPending;if(result.cleanupPending&&!cleanup.cleaned)throw new Error('Drive cleanup pending')}if(result.cleanupPending)throw new Error('Drive cleanup pending');return result}
  db.signwayDeleteSignedDocuments=async ids=>finishDeletion(await transport.call('workspace-owner-call',{op:'documents-delete-signed',ids}));
  db.signwayDeleteSharedDocuments=async ids=>finishDeletion(await transport.call('workspace-owner-call',{op:'shared-delete-many',ids}));
  db.signwayDeleteSharedDocument=async id=>finishDeletion(await transport.call('workspace-owner-call',{op:'shared-delete',id}));
  db.signwayDeleteDocumentGroup=async id=>{const result=await db.from('signature_events').delete().eq('id',id);if(result.error)throw result.error;return finishDeletion({cleanupPending:true})};
  db.signwayDeleteDocument=async id=>finishDeletion(await transport.call('workspace-owner-call',{op:'document-delete',id}));
  db.signwayCompactStorage=async()=>{let result,total=0,rounds=0;do{rounds++;result=await transport.call('workspace-owner-call',{op:'storage-compact'});total+=result.trashed||0;if(result.more)await new Promise(resolve=>setTimeout(resolve,350))}while(result.more&&total<1600&&rounds<100&&!(result.cleanupPending&&!result.filesCleaned));return {...result,trashed:total}};
  db.signwayGmailToken=async()=>{const r=await transport.call('auth-gmail-token');return r.token};
  return db;
 }
 function googleTransport(endpoint,sessionToken){
  let source,origin,disposed=false,frame,ready,readyResolve,readyReject,startupTimer,attempt=0,channel,failed=false;const pending=new Map();
  const connectionError=()=>Object.assign(new Error('Google service connection timed out'),{code:'GOOGLE_CONNECTION_TIMEOUT'});
  function connect(){attempt++;source=null;origin=null;failed=false;frame?.remove();channel=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject});ready.catch(()=>{});frame=document.createElement('iframe');/* Keep Google browser cookies out of the RPC bridge. App identity is carried by our verified session token. */frame.setAttribute('credentialless','');frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;frame.loading='eager';frame.style.cssText='position:fixed;width:1px;height:1px;bottom:0;left:0;border:0;opacity:0;pointer-events:none;';frame.referrerPolicy='no-referrer';frame.title='Sign Away Google connection';frame.src=endpoint+'?mode=bridge&channel='+channel;document.body.append(frame);startupTimer=setTimeout(()=>{failed=true;readyReject(connectionError())},20000)}
  function receive(event){const m=event.data;if(disposed||!m||m.channel!==channel||!/^https:\/\/(?:[a-z0-9-]+-script\.|script\.)googleusercontent\.com$/.test(event.origin))return;
   if(m.type==='signway-drive-ready'&&!source&&!failed){source=event.source;origin=event.origin;clearTimeout(startupTimer);readyResolve();return}
   if(event.source!==source||event.origin!==origin||m.type!=='signway-drive-result')return;const task=pending.get(m.id);if(!task)return;pending.delete(m.id);clearTimeout(task.timer);m.error?task.reject(new Error(m.error)):task.resolve(m.data);
  }
  window.addEventListener('message',receive);connect();
  async function waitReady(){for(;;){if(disposed)throw Error('Connection closed');const waiting=ready;try{await waiting;return}catch(e){if(disposed||e.code!=='GOOGLE_CONNECTION_TIMEOUT'||attempt>=2)throw e;if(ready===waiting)connect()}}}
  async function publicCall(action,payload){
   const id=crypto.randomUUID(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
   try{
    const response=await fetch(endpoint,{method:'POST',mode:'cors',credentials:'omit',redirect:'follow',referrerPolicy:'no-referrer',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({protocol:'signaway-public-v1',id,action,payload}),signal:controller.signal});
    if(!response.ok)throw Error('No confirmation received. Check before retrying.');
    const result=await response.json();if(result.protocol!=='signaway-public-v1'||result.id!==id)throw Error('No confirmation received. Check before retrying.');
    if(result.error)throw Error(result.error);return result.data;
   }catch(error){if(error.name==='AbortError'||error instanceof TypeError)throw Error('No confirmation received. Check before retrying.');throw error}finally{clearTimeout(timer)}
  }
  return {reconnect(){if(disposed)throw Error('Connection closed');if(pending.size)throw Error('A request is still in progress');clearTimeout(startupTimer);readyReject(connectionError());attempt=0;connect()},async call(action,payload={}){if(disposed)throw new Error('Connection closed');if(typeof fetch==='function'&&['shared-public-read','shared-public-sign','shared-public-result','i18n-catalog'].includes(action))return publicCall(action,payload);await waitReady();if(disposed)throw new Error('Connection closed');const id=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('No confirmation received. Check before retrying.'))},['import-start','import-finish'].includes(action)?300000:60000);pending.set(id,{resolve,reject,timer});source.postMessage({type:'signway-drive-request',channel,id,action,payload,accessToken:action==='i18n-catalog'||action.startsWith('shared-public-')||['auth-finish','auth-site-callback','auth-guest','workspace-public-resolve'].includes(action)?undefined:sessionToken()},origin)})},dispose(){disposed=true;clearTimeout(startupTimer);readyReject(new Error('Connection closed'));window.removeEventListener('message',receive);frame.remove();for(const task of pending.values()){clearTimeout(task.timer);task.reject(new Error('Connection closed'))}pending.clear()}};
 }
 return {create};
})();
