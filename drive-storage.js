/* Owner-specific Drive pilot. Every operation is authorized again on the server. */
window.DriveStorage=(()=>{
 const OWNER='roi.shlomo@gmail.com';
 const ENDPOINT='https://script.google.com/macros/s/AKfycbyKogbdqT1lUeG2kYNuH2v4I399_UC310OUo4XVOx3fT-LDaONqc2JJ_pvj6b1URiq6yw/exec';
 function enabled(user){return !!user&&!user.is_anonymous&&String(user.email||'').toLowerCase()===OWNER}
 function create(db){
  let source=null,origin=null,frame=null,disposed=false,readyResolve,readyReject;
  const pending=new Map(),channel=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject});
  // Attach a handler immediately to avoid an unhandled startup timeout.
  ready.catch(()=>{});
  const timer=setTimeout(()=>readyReject(new Error('לא ניתן להתחבר ל-Drive. רעננו ונסו שוב.')),25000);
  function receive(e){
   const m=e.data;
   if(disposed||!m||m.channel!==channel||!/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(e.origin))return;
   if(m.type==='signway-drive-ready'&&!source){source=e.source;origin=e.origin;clearTimeout(timer);readyResolve();return}
   if(e.source!==source||e.origin!==origin||m.type!=='signway-drive-result')return;
   const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error)):p.resolve(m.data);
  }
  window.addEventListener('message',receive);
  frame=document.createElement('iframe');frame.hidden=true;frame.title='SignWay Drive connection';frame.referrerPolicy='no-referrer';frame.src=ENDPOINT+'?mode=bridge&channel='+channel;document.body.append(frame);
  async function call(action,payload={}){
   await ready;if(disposed)throw new Error('Drive connection closed');
   const {data,error}=await db.auth.getSession();if(error||!data?.session?.access_token)throw new Error('נדרשת התחברות מחדש.');
   const id=crypto.randomUUID();return new Promise((resolve,reject)=>{
    pending.set(id,{resolve,reject,timer:setTimeout(()=>{pending.delete(id);reject(new Error('לא התקבל אישור מ-Drive. רעננו את הרשימה לפני העלאה נוספת.'))},90000)});
    source.postMessage({type:'signway-drive-request',channel,id,action,payload,accessToken:data.session.access_token},origin);
   });
  }
  return {call,async upload(prepared){if(prepared.bytes.byteLength>5*1024*1024)throw new Error('אחסון Drive תומך כרגע ב-PDF עד 5MB.');let raw='';const bytes=new Uint8Array(prepared.bytes);for(let i=0;i<bytes.length;i+=32768)raw+=String.fromCharCode(...bytes.subarray(i,i+32768));return call('upload',{name:prepared.name,base64:btoa(raw)})},dispose(){disposed=true;clearTimeout(timer);readyReject(new Error('Drive connection closed'));window.removeEventListener('message',receive);frame.remove();for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Drive connection closed'))}pending.clear()}};
 }
 return {enabled,create};
})();
