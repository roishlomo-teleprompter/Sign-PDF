/* Additive staging only. Never deletes source data or activates a new backend.
 * Run through the existing owner-authorized bridge. Access tokens stay in memory.
 */
const MIGRATION_API_='https://yybpppkxniizxbeettpp.supabase.co';
const MIGRATION_KEY_='sb_publishable_VHrjc5o3jYTfJkR0Y9gZHQ_5DebiLY7';
const MIGRATION_TABLES_=['sign_requests','signature_groups','signature_events','event_participants'];
function migrationDispatch(accessToken,action,payload){
 const ownerId=appOwner_(accessToken); // Always authorize before looking up a job.
 if(!['migration-status','migration-start','migration-step'].includes(action))throw new Error('Unsupported migration operation');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const props=PropertiesService.getScriptProperties(),key='MIGRATION_V1_'+ownerId;
  let state=props.getProperty(key)?JSON.parse(DriveApp.getFileById(props.getProperty(key)).getBlob().getDataAsString()):null;
  if(state&&state.ownerId!==ownerId)throw new Error('Migration owner mismatch');
  if(action==='migration-status')return migrationSummary_(state);
  if(action==='migration-start'){
   if(state&&state.status==='copying')return migrationSummary_(state);
   const snapshot=migrationSnapshot_(accessToken,ownerId,payload||{}),digest=hash_(migrationCanonical_(snapshot));
   if(state&&state.sourceDigest===digest&&state.status==='staged')return migrationSummary_(state);
   const folder=migrationFolder_(ownerId);
   state={version:1,ownerId,status:'copying',startedAt:new Date().toISOString(),sourceDigest:digest,snapshot,files:migrationPaths_(snapshot),copied:[],folderId:folder.getId()};
   const file=folder.createFile(Utilities.newBlob(JSON.stringify(state),'application/json','migration-'+Utilities.getUuid()+'.json'));
   props.setProperty(key,file.getId());return migrationSummary_(state);
  }
  if(!state)throw new Error('Start the migration first');
  if(state.status!=='copying')return migrationSummary_(state);
  const folder=DriveApp.getFolderById(state.folderId),deadline=Date.now()+20000;
  let copiedThisStep=0;
  for(const path of state.files){
   if(state.copied.some(item=>item.path===path))continue;
   // Path comes exclusively from the authenticated owner's database snapshot.
   const bytes=migrationFetch_(accessToken,'/storage/v1/object/authenticated/sign-pdf-documents/'+migrationPath_(path),true);
   if(!bytes.length||bytes.length>25*1024*1024||String.fromCharCode.apply(null,bytes.slice(0,5))!=='%PDF-')throw new Error('Invalid or oversized source PDF');
   const sha256=hashBytes_(bytes),name=hash_(path)+'-'+sha256+'.pdf',found=folder.getFilesByName(name);
   const file=found.hasNext()?found.next():folder.createFile(Utilities.newBlob(bytes,'application/pdf',name));
   if(file.getSize()!==bytes.length||hashBytes_(file.getBlob().getBytes())!==sha256)throw new Error('Drive verification failed');
   state.copied.push({path,fileId:file.getId(),bytes:bytes.length,sha256});
   migrationSave_(props.getProperty(key),state); // Checkpoint each verified file.
   copiedThisStep++;
   if(copiedThisStep>=3||Date.now()>=deadline)break;
  }
  if(state.copied.length===state.files.length){
   const current=migrationSnapshot_(accessToken,ownerId,{language:state.snapshot.settings.language});
   if(hash_(migrationCanonical_(current))!==state.sourceDigest){state.status='source-changed';migrationSave_(props.getProperty(key),state);throw new Error('Source changed during copy. Start again to refresh the snapshot; existing Drive copies are reused.');}
   for(const item of state.copied){const f=DriveApp.getFileById(item.fileId);if(f.getSize()!==item.bytes||hashBytes_(f.getBlob().getBytes())!==item.sha256)throw new Error('Final Drive verification failed');}
   state.status='staged';state.verifiedAt=new Date().toISOString();migrationSave_(props.getProperty(key),state);
  }
  return migrationSummary_(state);
 }finally{lock.releaseLock()}
}
function migrationFetch_(token,path,binary){
 const r=UrlFetchApp.fetch(MIGRATION_API_+path,{method:'get',headers:{apikey:MIGRATION_KEY_,Authorization:'Bearer '+token},muteHttpExceptions:true,followRedirects:false});
 if(r.getResponseCode()!==200)throw new Error('Source read failed ('+r.getResponseCode()+'). No source data was modified.');
 return binary?r.getBlob().getBytes():JSON.parse(r.getContentText());
}
function migrationSnapshot_(token,ownerId,payload){
 const result={tables:{},settings:{}};
 for(const table of MIGRATION_TABLES_){
  const rows=[];
  for(let offset=0;;offset+=100){
   const page=migrationFetch_(token,'/rest/v1/'+table+'?select=*&owner_id=eq.'+encodeURIComponent(ownerId)+'&order=id.asc&limit=100&offset='+offset,false);
   if(!Array.isArray(page)||page.some(row=>row.owner_id!==ownerId))throw new Error('Invalid source ownership');
   rows.push.apply(rows,page);if(rows.length>10000)throw new Error('Migration exceeds the supported batch size');if(page.length<100)break;
  }
  result.tables[table]=rows;
 }
 const user=migrationFetch_(token,'/auth/v1/user',false);
 if(user.id!==ownerId)throw new Error('Account changed');
 // Copy application settings only. Never persist auth sessions or provider credentials.
 result.settings.gmailSendConfirmed=user.user_metadata?.signway_gmail_send_confirmed_v1===true;
 if(['he','en'].includes(payload.language))result.settings.language=payload.language;
 return result;
}
function migrationPaths_(snapshot){
 const paths=[];
 for(const row of snapshot.tables.sign_requests)for(const key of ['original_path','signed_path'])if(row[key]&&(key!=='signed_path'||row.status==='signed')){migrationPath_(row[key]);if(!paths.includes(row[key]))paths.push(row[key]);}
 return paths.sort();
}
function migrationPath_(path){
 if(typeof path!=='string'||path.length>1024||path.split('/').some(s=>!s||s==='.'||s==='..'||/[\\\x00-\x1f]/.test(s)))throw new Error('Invalid source storage path');
 return path.split('/').map(encodeURIComponent).join('/');
}
function migrationFolder_(ownerId){
 const root=DriveApp.getFolderById(config_().ROOT_ID),name='Migration-'+ownerId,found=root.getFoldersByName(name);
 return found.hasNext()?found.next():root.createFolder(name);
}
function migrationSave_(fileId,state){
 const content=JSON.stringify(state),file=DriveApp.getFileById(fileId);file.setContent(content);
 if(hash_(file.getBlob().getDataAsString())!==hash_(content))throw new Error('Checkpoint verification failed. Retry safely.');
}
function migrationSummary_(state){
 if(!state)return {status:'not-started',activeBackendChanged:false};
 const counts={};for(const table of MIGRATION_TABLES_)counts[table]=state.snapshot.tables[table].length;
 return {status:state.status,total:state.files.length,copied:state.copied.length,counts,verifiedAt:state.verifiedAt||null,activeBackendChanged:false};
}
function migrationCanonical_(value){
 if(Array.isArray(value))return '['+value.map(migrationCanonical_).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+migrationCanonical_(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
