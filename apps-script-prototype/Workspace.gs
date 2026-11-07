/* Private Drive workspace. Identity remains with Auth; workspace data never falls
 * back to source writes after activation. Immutable manifests publish atomically. */
function workspaceLoad_(){const id=PropertiesService.getScriptProperties().getProperty('WORKSPACE_V1');return id?JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString()):null}
function workspaceSave_(w){
 w.revision=(w.revision||0)+1;const text=JSON.stringify(w),folder=DriveApp.getFolderById(w.folderId);
 const f=folder.createFile(Utilities.newBlob(text,'application/json','workspace-'+Utilities.getUuid()+'.json'));
 if(hash_(f.getBlob().getDataAsString())!==hash_(text))throw new Error('Workspace verification failed');
 const p=PropertiesService.getScriptProperties();try{p.setProperty('WORKSPACE_V1',f.getId())}catch(e){if(p.getProperty('WORKSPACE_V1')!==f.getId())throw e}
}
function workspaceDispatch(accessToken,action,p){
 p=p||{};
 if(action==='workspace-public-resolve'){
  if(!workspaceTokenValid_(p.token))return {found:false};
  const w=workspaceLoad_();return {found:!!w&&!!workspaceResolve_(w,p.token)};
 }
 const publicCall=action==='workspace-public-call';
 const actor=publicCall?workspaceUser_(accessToken):appOwner_(accessToken);
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  let w=workspaceLoad_();
  if(action==='workspace-status')return {active:!!w&&w.ownerId===actor,version:1};
  if(action==='workspace-activate'){
   if(w){if(w.ownerId!==actor)throw new Error('Workspace owner mismatch');return {active:true}}
   const frozen=workspaceFrozen_(accessToken);if(!frozen)throw new Error('The source workspace must be frozen before activation');
   const prop=PropertiesService.getScriptProperties().getProperty('MIGRATION_V1_'+actor);
   if(!prop)throw new Error('Prepare the Drive copy first');
   const staged=JSON.parse(DriveApp.getFileById(prop).getBlob().getDataAsString());
   if(staged.ownerId!==actor||staged.status!=='staged')throw new Error('The Drive copy has not passed verification');
   const current=migrationSnapshot_(accessToken,actor,{language:staged.snapshot.settings.language});
   if(hash_(migrationCanonical_(current))!==staged.sourceDigest)throw new Error('Refresh the staged copy after freezing the source');
   w={version:1,ownerId:actor,folderId:staged.folderId,tables:staged.snapshot.tables,settings:staged.snapshot.settings,files:staged.copied,revision:0};
   workspaceSave_(w);return {active:true};
  }
  if(!w||(!publicCall&&w.ownerId!==actor))throw new Error('Drive workspace unavailable');
  if(publicCall)return workspacePublic_(w,actor,p);
  if(action!=='workspace-owner-call')throw new Error('Unsupported workspace operation');
  let result;
  if(p.op==='query')result=workspaceQuery_(w,p);
  else if(p.op==='rpc')result=workspaceRpc_(w,p);
  else if(p.op==='download')return workspaceDownload_(w,p.path);
  else if(p.op==='upload'){const r=w.tables.sign_requests.find(r=>r.original_path===p.path);if(!r||r.status!=='pending')throw new Error('Original upload is unavailable');workspacePut_(w,p.path,p.base64);result={path:p.path}}
  else if(p.op==='remove'){if(!Array.isArray(p.paths)||p.paths.length>10)throw new Error('Invalid file list');for(const path of p.paths){if(!w.tables.sign_requests.some(r=>[r.original_path,r.signed_path].includes(path)))throw new Error('File ownership mismatch');w.files=w.files.filter(f=>f.path!==path)}result=p.paths.map(name=>({name}));}
  else if(p.op==='settings-get')return w.settings;
  else if(p.op==='settings-set'){const patch=p.settings||{};if(Object.keys(patch).some(k=>!['language','gmailSendConfirmed'].includes(k)))throw new Error('Unsupported setting');if('language' in patch&&!['he','en'].includes(patch.language))throw new Error('Invalid language');if('gmailSendConfirmed' in patch&&typeof patch.gmailSendConfirmed!=='boolean')throw new Error('Invalid preference');Object.assign(w.settings,patch);result=w.settings}
  else if(p.op==='self-save')result=workspaceSelf_(w,p);
  else throw new Error('Unsupported workspace operation');
  if(!(p.op==='query'&&p.query.operation==='select'))workspaceSave_(w);
  return result;
 }finally{lock.releaseLock()}
}
function workspaceFrozen_(accessToken){
 const r=UrlFetchApp.fetch(MIGRATION_API_+'/rest/v1/rpc/signway_workspace_frozen',{method:'post',headers:{apikey:MIGRATION_KEY_,Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},payload:'{}',muteHttpExceptions:true,followRedirects:false});
 if(r.getResponseCode()!==200)throw new Error('Cannot verify the source freeze');return JSON.parse(r.getContentText())===true;
}
function workspaceUser_(token){const u=migrationFetch_(token,'/auth/v1/user',false);if(!u?.id)throw new Error('Sign in again');return u.id}
function workspaceTokenValid_(token){return typeof token==='string'&&/^[a-f0-9]{64}$/.test(token)}
function workspaceResolve_(w,token){
 if(!workspaceTokenValid_(token))return null;
 const r=w.tables.sign_requests.find(r=>r.token_hash===hash_(token));if(r)return {request:r};
 const participant=w.tables.event_participants.find(p=>p.token===token);return participant?{participant}:null;
}
function workspaceText_(v,max,required){if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw new Error('Invalid text');return v.trim()}
function workspaceUuid_(v){if(typeof v!=='string'||!/^[-a-f0-9]{36}$/.test(v))throw new Error('Invalid identifier');return v}
function workspaceId_(){return Utilities.getUuid()}
function workspaceToken_(){return (Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,'')}
function workspaceQuery_(w,p){
 const table=p.table,q=p.query||{};if(!MIGRATION_TABLES_.includes(table)||!['select','insert','update','delete'].includes(q.operation))throw new Error('Unsupported query');
 const filters=q.filters||[];if(!Array.isArray(filters)||filters.length>10)throw new Error('Invalid filters');
 for(const f of filters)if(!['id','owner_id','event_id','status'].includes(f.column)||!['eq','in'].includes(f.type)||(f.type==='in'&&(!Array.isArray(f.value)||f.value.length>150)))throw new Error('Unsupported filter');
 const matches=r=>filters.every(f=>f.type==='eq'?r[f.column]===f.value:f.value.includes(r[f.column]));
 let rows=w.tables[table].filter(matches);
 if(q.operation==='insert'){
  if(table==='sign_requests')throw new Error('Create documents through the request operation');
  const values=Array.isArray(q.values)?q.values:[q.values];if(!values.length||values.length>150)throw new Error('Invalid insert batch');
  const created=values.map(v=>workspaceRecord_(w,table,v,null));w.tables[table].push.apply(w.tables[table],created);rows=created;
 }else if(q.operation==='update'){
  if(table==='sign_requests'||!filters.length)throw new Error('Unsupported update');
  const updated=rows.map(r=>workspaceRecord_(w,table,q.values,r));for(const r of updated)w.tables[table][w.tables[table].findIndex(x=>x.id===r.id)]=r;rows=updated;
 }else if(q.operation==='delete'){
  if(!filters.length)throw new Error('A delete filter is required');
  const ids=rows.map(r=>r.id);w.tables[table]=w.tables[table].filter(r=>!ids.includes(r.id));
  if(table==='signature_events')w.tables.event_participants=w.tables.event_participants.filter(p=>!ids.includes(p.event_id));
  // Immutable revisions retain recoverable copies; only current references disappear.
  if(table==='sign_requests'){const paths=rows.flatMap(r=>[r.original_path,r.signed_path]);w.files=w.files.filter(f=>!paths.includes(f.path))}
 }
 if(q.order){if(!['created_at','id'].includes(q.order.column))throw new Error('Invalid order');rows.sort((a,b)=>String(a[q.order.column]).localeCompare(String(b[q.order.column]))*(q.order.ascending===false?-1:1))}
 if(q.limit!==undefined){if(!Number.isInteger(q.limit)||q.limit<0||q.limit>10000)throw new Error('Invalid limit');rows=rows.slice(0,q.limit)}
 const columns=q.columns||'*';if(columns!=='*'&&!/^[a-z_,]+$/.test(columns))throw new Error('Invalid projection');
 rows=rows.map(r=>{const safe=Object.assign({},r);delete safe.token_hash;if(columns==='*')return safe;const out={};for(const k of columns.split(','))out[k]=safe[k];return out});
 if(q.single){if(rows.length!==1&&!(q.single==='maybe'&&!rows.length))throw new Error('Expected one record');return rows[0]||null}
 return rows;
}
function workspaceRecord_(w,table,value,old){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid record');
 const fields={signature_groups:['name','members'],signature_events:['title','event_date','description','questions','status'],event_participants:['event_id','name','email','group_name','requests']}[table];
 if(!fields||Object.keys(value).some(k=>!fields.includes(k)&&k!=='owner_id')||('owner_id' in value&&value.owner_id!==w.ownerId))throw new Error('Invalid record fields');
 const r=Object.assign(old?JSON.parse(JSON.stringify(old)):{id:workspaceId_(),owner_id:w.ownerId,created_at:new Date().toISOString()},value);
 if(table==='signature_groups'){
  r.name=workspaceText_(r.name,120,true);if(!Array.isArray(r.members)||r.members.length>100)throw new Error('Invalid contacts');r.members=r.members.map(m=>({name:workspaceText_(m.name,120,true),email:workspaceText_(m.email||'',320,false)}));
 }else if(table==='signature_events'){
  r.title=workspaceText_(r.title,200,true);r.description=workspaceText_(r.description||'',10000,false);r.event_date=r.event_date||null;
  if(r.event_date&&!/^\d{4}-\d{2}-\d{2}$/.test(r.event_date))throw new Error('Invalid date');
  if(!Array.isArray(r.questions)||r.questions.length>10)throw new Error('Invalid questions');r.questions=r.questions.map(q=>({id:workspaceText_(q.id,40,true),label:workspaceText_(q.label,2000,true)}));if(new Set(r.questions.map(q=>q.id)).size!==r.questions.length)throw new Error('Duplicate question');
  if(!['draft','published','archived'].includes(r.status))throw new Error('Invalid request status');
 }else{
  if(!w.tables.signature_events.some(e=>e.id===r.event_id))throw new Error('Parent request not found');
  r.name=workspaceText_(r.name,120,true);r.email=workspaceText_(r.email||'',320,false);r.group_name=workspaceText_(r.group_name||'',120,false);r.requests=r.requests||[];
  if(!Array.isArray(r.requests)||r.requests.length>5)throw new Error('Invalid forms');for(const form of r.requests){const request=w.tables.sign_requests.find(s=>s.id===form.request_id);if(!request||!workspaceTokenValid_(form.token)||request.token_hash!==hash_(form.token)||w.tables.event_participants.some(p=>p.id!==r.id&&p.requests.some(x=>x.request_id===form.request_id)))throw new Error('Invalid form ownership')}
  if(!old){r.token=workspaceToken_();r.answers={};r.decline_reason=null;r.viewed_at=null}
 }
 return r;
}
function workspaceCreate_(w,title,expires,id){
 const now=new Date().toISOString(),expiry=expires||new Date(Date.now()+7*86400000).toISOString();
 if(!Number.isFinite(Date.parse(expiry))||Date.parse(expiry)<=Date.now()||Date.parse(expiry)>Date.now()+31*86400000)throw new Error('Invalid expiry');
 id=id||workspaceId_();const token=workspaceToken_(),r={id,owner_id:w.ownerId,storage_owner_id:w.ownerId,signer_id:null,title:workspaceText_(title,200,true),token_hash:hash_(token),status:'pending',created_at:now,updated_at:now,expires_at:expiry,signed_at:null,original_path:w.ownerId+'/'+id+'/original.pdf',signed_path:w.ownerId+'/'+id+'/signed.pdf'};
 w.tables.sign_requests.push(r);return {row:r,token};
}
function workspaceRpc_(w,p){
 const a=p.args||{};
 if(p.name==='create_sign_request'){const {row:r,token}=workspaceCreate_(w,a.p_title,a.p_expires_at);return [{request_id:r.id,signing_token:token,original_path:r.original_path,signed_path:r.signed_path,expires_at:r.expires_at}]}
 if(p.name==='cancel_sign_request'){const r=w.tables.sign_requests.find(r=>r.id===a.p_request_id);if(!r||r.status!=='pending')return false;r.status='cancelled';r.updated_at=new Date().toISOString();return true}
 throw new Error('Unsupported request operation');
}
function workspacePdf_(base64){
 if(typeof base64!=='string'||base64.length>Math.ceil(25*1024*1024/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw new Error('PDF exceeds 25MB');
 const bytes=Utilities.base64Decode(base64);if(!bytes.length||bytes.length>25*1024*1024||!String.fromCharCode.apply(null,bytes.slice(0,1024)).includes('%PDF-'))throw new Error('Invalid PDF');return bytes;
}
function workspacePut_(w,path,base64){
 const bytes=workspacePdf_(base64),sha256=hashBytes_(bytes),existing=w.files.find(f=>f.path===path);
 if(existing){if(existing.sha256!==sha256)throw new Error('An existing PDF cannot be replaced');return}
 const folder=DriveApp.getFolderById(w.folderId),name=hash_(path)+'-'+sha256+'.pdf',found=folder.getFilesByName(name),file=found.hasNext()?found.next():folder.createFile(Utilities.newBlob(bytes,'application/pdf',name));
 if(file.getSize()!==bytes.length||hashBytes_(file.getBlob().getBytes())!==sha256)throw new Error('Drive PDF verification failed');
 w.files.push({path,fileId:file.getId(),sha256,bytes:bytes.length});
}
function workspaceDownload_(w,path){const item=w.files.find(f=>f.path===path);if(!item)throw new Error('PDF not found');return {base64:Utilities.base64Encode(DriveApp.getFileById(item.fileId).getBlob().getBytes())}}
function workspaceSelf_(w,p){
 const id=workspaceUuid_(p.creationId),existing=w.tables.sign_requests.find(r=>r.id===id),digest=hash_(p.original+'|'+p.signed+'|'+p.title);
 if(existing){if(existing.selfDigest!==digest)throw new Error('Save identifier already used');return {id}}
 const {row:r}=workspaceCreate_(w,p.title,null,id);workspacePut_(w,r.original_path,p.original);workspacePut_(w,r.signed_path,p.signed);r.status='signed';r.signed_at=new Date().toISOString();r.selfDigest=digest;return {id};
}
function workspacePending_(w,r,answersRequired){
 if(r.status!=='pending'||Date.parse(r.expires_at)<=Date.now())throw new Error('The signing link expired or was cancelled');
 const p=w.tables.event_participants.find(p=>p.requests.some(f=>f.request_id===r.id));if(!p)return;
 const e=w.tables.signature_events.find(e=>e.id===p.event_id);if(!e||e.status!=='published'||p.decline_reason)throw new Error('Signature request unavailable');
 if(answersRequired&&e.questions.some(q=>!String(p.answers[q.id]||'').trim()))throw new Error('Answer all required questions');
}
function workspacePublic_(w,actor,p){
 const match=workspaceResolve_(w,p.token);if(!match)throw new Error('Signing link unavailable');let result;
 if(p.op==='event_bundle'){
  const person=match.participant;if(!person)throw new Error('Invalid participant link');
  const e=w.tables.signature_events.find(e=>e.id===person.event_id);if(!e||e.status!=='published'||person.decline_reason)throw new Error('Signature request unavailable');
  const forms=person.requests.map(form=>({form,r:w.tables.sign_requests.find(r=>r.id===form.request_id)}));if(forms.some(x=>!x.r||x.r.status==='cancelled'||(x.r.status==='pending'&&Date.parse(x.r.expires_at)<=Date.now())))throw new Error('Signature request unavailable');
  const a=p.args||{};
  if(a.p_decline!==null&&a.p_decline!==undefined){if(forms.some(x=>x.r.status==='signed'))throw new Error('Cannot decline after signing');person.decline_reason=workspaceText_(a.p_decline,1000,true);for(const x of forms)x.r.status='cancelled';result={declined:true}}
  else{if(a.p_answers!==null&&a.p_answers!==undefined){const answers=a.p_answers;if(typeof answers!=='object'||Array.isArray(answers))throw new Error('Invalid answers');const safe={};for(const q of e.questions)safe[q.id]=workspaceText_(answers[q.id],2000,true);person.answers=safe}result={title:e.title,description:e.description,name:person.name,questions:e.questions,answers:person.answers,forms:forms.map(x=>({request_id:x.r.id,title:x.r.title,token:x.form.token,status:x.r.status,signed_path:x.r.signed_path}))}}
  person.viewed_at=person.viewed_at||new Date().toISOString();
 }else{
  const r=match.request;if(!r)throw new Error('Invalid document link');
  if(r.signer_id&&r.signer_id!==actor)throw new Error('This signing link belongs to another session');
  if(p.op==='claim_sign_request'){
   if(r.status!=='signed')workspacePending_(w,r,false);r.signer_id=r.signer_id||actor;
   result=[{id:r.id,request_id:r.id,title:r.title,status:r.status,original_path:r.original_path,signed_path:r.signed_path,expires_at:r.expires_at}];
  }else{
   if(r.signer_id!==actor)throw new Error('Claim the document first');
   if(p.op==='download'){workspacePending_(w,r,false);if(p.path!==r.original_path)throw new Error('PDF is not available to this signer');return workspaceDownload_(w,p.path)}
   if(p.op==='upload'){workspacePending_(w,r,true);if(p.path!==r.signed_path)throw new Error('Invalid signed PDF path');workspacePut_(w,p.path,p.base64);result={path:p.path}}
   else if(p.op==='complete_sign_request'){
    if(r.status!=='signed'){workspacePending_(w,r,true);if(!w.files.some(f=>f.path===r.signed_path))throw new Error('Upload the signed PDF first');r.status='signed';r.signed_at=new Date().toISOString();r.updated_at=r.signed_at}result=true;
   }else throw new Error('Unsupported signer operation');
  }
 }
 workspaceSave_(w);return result;
}
