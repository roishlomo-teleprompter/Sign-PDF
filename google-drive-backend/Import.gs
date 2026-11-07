/* Copy the installed owner's existing Drive data using Google identity only.
 * Staging is private and resumable. The source stays intact and becomes read-only
 * before the verified destination manifest is published. */
var IMPORT_SOURCE_='https://script.google.com/macros/s/AKfycbyKogbdqT1lUeG2kYNuH2v4I399_UC310OUo4XVOx3fT-LDaONqc2JJ_pvj6b1URiq6yw/exec';
var IMPORT_EMAIL_='roi.shlomo@gmail.com';
function importSource_(action,p){
 const a=personalContext_.account;if(a.email.toLowerCase()!==IMPORT_EMAIL_)throw new Error('No legacy installation for this account');
 const response=UrlFetchApp.fetch(IMPORT_SOURCE_,{method:'post',contentType:'application/json',payload:JSON.stringify({action,...(p||{}),googleToken:googleAccess_(a)}),muteHttpExceptions:true,followRedirects:true});
 if(response.getResponseCode()!==200)throw new Error('Cannot read the previous Drive installation');let result;try{result=JSON.parse(response.getContentText())}catch(e){throw new Error('The previous Drive installation needs the transfer update')}
 if(!result.ok)throw new Error(result.error||'Source transfer failed');return result.data;
}
function importLoad_(){const id=personalContext_.account.importStageId;return id?JSON.parse(personalDrive_().getFileById(id).getBlob().getDataAsString()):null}
function importCheckpoint_(stage){const a=personalContext_.account,text=JSON.stringify(stage),file=personalDrive_().getFolderById(a.dataId).createFile(Utilities.newBlob(text,'application/json','import-'+Utilities.getUuid()+'.json'));if(hash_(file.getBlob().getDataAsString())!==hash_(text))throw new Error('Transfer checkpoint verification failed');a.importStageId=file.getId();writeProp_('account:'+a.id,a)}
function importSummary_(stage){return {available:true,complete:stage.status==='complete',copied:Object.keys(stage.copied).length,verified:stage.verifiedCount||0,total:stage.snapshot.files.length,documents:stage.snapshot.workspace.tables.sign_requests.length,shared:stage.snapshot.shared.length}}
function importValidate_(source){
 const s=source.snapshot,a=personalContext_.account;if(!s||s.email.toLowerCase()!==a.email.toLowerCase()||hash_(JSON.stringify(s))!==source.digest||!Array.isArray(s.files)||s.files.length>10000||!Array.isArray(s.shared))throw new Error('Invalid source snapshot');
 const w=s.workspace;if(!w||!w.ownerId||!w.tables||!Array.isArray(w.files))throw new Error('Invalid source workspace');
 for(const table of WORKSPACE_TABLES_){if(!Array.isArray(w.tables[table])||w.tables[table].some(r=>r.owner_id!==w.ownerId))throw new Error('Source record ownership mismatch')}
 if(new Set(s.files.map(f=>f.id)).size!==s.files.length||new Set(w.files.map(f=>f.path)).size!==w.files.length)throw new Error('Duplicate source identity');
 for(const f of s.files)if(typeof f.id!=='string'||!['application/pdf','image/png'].includes(f.mime)||!['original','signed','shared'].includes(f.role)||!Number.isInteger(f.bytes)||f.bytes<1||f.bytes>25*1024*1024||f.sha256&&!/^[a-f0-9]{64}$/.test(f.sha256))throw new Error('Invalid source file');
 for(const f of w.files)if(!s.files.some(x=>x.id===f.fileId))throw new Error('Source PDF mapping is incomplete');
 for(const r of w.tables.sign_requests){if(!/^[a-f0-9]{64}$/.test(r.token_hash)||!['pending','signed','cancelled'].includes(r.status))throw new Error('Invalid imported signing request');const route=readProp_('route:'+r.token_hash);if(route&&route.id!==a.id)throw new Error('Signing link belongs to another account')}
 for(const p of w.tables.event_participants){if(!workspaceTokenValid_(p.token))throw new Error('Invalid participant token');const route=readProp_('route:'+hash_(p.token));if(route&&route.id!==a.id)throw new Error('Participant link belongs to another account')}
 for(const m of s.shared){if(m.ownerId!==w.ownerId||!Array.isArray(m.people))throw new Error('Invalid shared ownership');for(const id of [m.originalId,m.pdfId,...m.people.flatMap(p=>[p.labelId,p.pngId]).filter(Boolean)])if(!s.files.some(f=>f.id===id))throw new Error('Shared file mapping is incomplete');for(const p of m.people){const route=readProp_('route:'+hash_(m.id+'.'+p.token));if(route&&route.id!==a.id)throw new Error('Shared link belongs to another account')}}
 return s;
}
function importAssertDestination_(){const w=workspaceLoad_();if(w.files.length||WORKSPACE_TABLES_.some(t=>w.tables[t].length)||(w.sharedRows||[]).length)throw new Error('Import requires an empty destination; existing destination data was kept')}
function importDispatch_(action,p){return locked_(function(){
 const a=personalContext_.account;if(a.email.toLowerCase()!==IMPORT_EMAIL_)return {available:false};
 let stage=importLoad_();if(a.importComplete)return {available:true,complete:true};
 if(stage&&workspaceLoad_().googleImportDigest===stage.digest){personalContext_.account.importComplete=stage.digest;writeProp_('account:'+a.id,personalContext_.account);stage.status='complete';importCheckpoint_(stage);return importSummary_(stage)}
 if(action==='import-status')return stage?importSummary_(stage):{available:true,complete:false,copied:0,total:null};
 if(action==='import-start'){
  if(stage&&stage.status!=='complete'&&!p.restart)return importSummary_(stage);importAssertDestination_();const source=importSource_('metadata');importValidate_(source);
  const copied={};if(stage)for(const f of source.snapshot.files){const previous=stage.copied[f.id];if(previous&&previous.bytes===f.bytes&&previous.sha256===f.sha256)copied[f.id]=previous}stage={version:1,status:'copying',digest:source.digest,snapshot:source.snapshot,copied};importCheckpoint_(stage);return importSummary_(stage);
 }
 if(!stage)throw new Error('Start the transfer first');
 if(action==='import-step'){
  if(stage.status==='complete')return importSummary_(stage);importAssertDestination_();
  const f=stage.snapshot.files.find(f=>!stage.copied[f.id]);if(!f)return importSummary_(stage);
  const received=importSource_('file',{id:f.id,digest:stage.digest}),bytes=Utilities.base64Decode(received.base64),sha=hashBytes_(bytes);
  if(received.mime!==f.mime||received.bytes!==f.bytes||bytes.length!==f.bytes||sha!==received.sha256||f.sha256&&sha!==f.sha256)throw new Error('Transferred file verification failed');
  if(f.mime==='application/pdf')workspacePdf_(received.base64);else sharedPng_(received.base64,false);
  const folderId=f.role==='original'?a.originalsId:f.role==='signed'?a.signedId:a.sharedId,folder=personalDrive_().getFolderById(folderId),name='import-'+hash_(f.id)+'-'+sha+(f.mime==='application/pdf'?'.pdf':'.png'),found=folder.getFilesByName(name),file=found.hasNext()?found.next():folder.createFile(Utilities.newBlob(bytes,f.mime,name));
  if(file.getSize()!==f.bytes||hashBytes_(file.getBlob().getBytes())!==sha)throw new Error('Destination file verification failed');
  stage.copied[f.id]={fileId:file.getId(),sha256:sha,bytes:f.bytes};importCheckpoint_(stage);return importSummary_(stage);
 }
 if(action!=='import-finish')throw new Error('Unsupported transfer operation');
 if(stage.status==='complete')return importSummary_(stage);importAssertDestination_();if(stage.snapshot.files.some(f=>!stage.copied[f.id]))throw new Error('Copy all files before finishing');importValidate_({snapshot:stage.snapshot,digest:stage.digest});
 const start=stage.verifiedCount||0;for(const f of stage.snapshot.files.slice(start,start+3)){const c=stage.copied[f.id],file=personalDrive_().getFileById(c.fileId);if(file.getSize()!==c.bytes||hashBytes_(file.getBlob().getBytes())!==c.sha256)throw new Error('Final destination verification failed');stage.verifiedCount=(stage.verifiedCount||0)+1}stage.status='verifying';importCheckpoint_(stage);if(stage.verifiedCount<stage.snapshot.files.length)return importSummary_(stage);
 const frozen=importSource_('freeze',{digest:stage.digest});if(!frozen.frozen||frozen.digest!==stage.digest)throw new Error('Source freeze was not verified');
 const w=JSON.parse(JSON.stringify(stage.snapshot.workspace));w.version=2;w.ownerId=a.id;w.folderId=a.dataId;w.sharedRows=[];w.settings=Object.assign({language:'he',gmailSendConfirmed:false},w.settings||{});
 for(const table of WORKSPACE_TABLES_)for(const r of w.tables[table]){r.owner_id=a.id;if(table==='sign_requests'){r.storage_owner_id=a.id;r.signer_id=null}}
 w.files=w.files.map(f=>({path:f.path,...stage.copied[f.fileId]}));
 const sharedRoutes=[];
 for(const original of stage.snapshot.shared){const m=JSON.parse(JSON.stringify(original));m.ownerId=a.id;m.folderId=a.sharedId;m.originalId=stage.copied[m.originalId].fileId;m.pdfId=stage.copied[m.pdfId].fileId;for(const p of m.people){if(p.labelId)p.labelId=stage.copied[p.labelId].fileId;if(p.pngId)p.pngId=stage.copied[p.pngId].fileId;sharedRoutes.push(hash_(m.id+'.'+p.token))}const file=personalDrive_().getFolderById(a.sharedId).createFile(Utilities.newBlob(JSON.stringify(m),'application/json','import-shared-'+m.id+'.json'));if(!w.sharedRows.length)w.sharedRows.push(SHARED_HEADERS_);w.sharedRows.push([m.id,file.getId(),m.createdAt,m.status,m.revision,m.title,m.originalId,m.pdfId,m.people.length,m.people.filter(p=>p.signedAt).length,new Date().toISOString()])}
 for(const hash of sharedRoutes)writeProp_('route:'+hash,{id:a.id});
 // A marker in the published manifest reconciles a lost response after publication.
 w.googleImportDigest=stage.digest;workspaceSave_(w);personalContext_.account.importComplete=stage.digest;writeProp_('account:'+a.id,personalContext_.account);stage.status='complete';importCheckpoint_(stage);return importSummary_(stage);
})}
