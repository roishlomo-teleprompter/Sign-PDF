/* One-time Google-authenticated export. Installed only on the existing Drive service.
 * No previous identity provider is contacted; no source files are deleted. */
function legacyMigrationFrozen_(){return !!PropertiesService.getScriptProperties().getProperty('GOOGLE_ONLY_FREEZE')}
function legacyMigrationWritable_(){if(legacyMigrationFrozen_())throw new Error('הנתונים הועברו לשמירת Google החדשה. פתחו מחדש את SignWay.')}
function legacyGoogleOwner_(token){
 if(typeof token!=='string'||token.length<20||token.length>8192)throw new Error('Google authorization required');
 const r=UrlFetchApp.fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+token},muteHttpExceptions:true,followRedirects:false});
 if(r.getResponseCode()!==200)throw new Error('Google authorization expired');const u=JSON.parse(r.getContentText());
 const email=DriveApp.getFileById(config_().SHEET_ID).getOwner().getEmail().toLowerCase();
 if(u.email_verified!==true||String(u.email||'').toLowerCase()!==email)throw new Error('This source belongs to another Google account');return email;
}
function legacyGoogleSnapshot_(email){
 const original=workspaceLoad_();if(!original)throw new Error('No active Drive workspace');
 const w=JSON.parse(JSON.stringify(original)),shared=[],ss=SpreadsheetApp.openById(config_().SHEET_ID),sharedSheet=ss.getSheetByName('SharedDocuments');
 if(sharedSheet)for(const row of sharedSheet.getDataRange().getValues().slice(1)){if(row[0]){const m=sharedFind_(String(row[0])).meta;if(m.ownerId!==w.ownerId)throw new Error('Shared owner mismatch');shared.push(m)}}
 const requests=ss.getSheetByName('Requests');
 if(requests)for(const r of requests.getDataRange().getValues().slice(1)){
  if(!r[0]||r[7]==='deleted')continue;if(w.tables.sign_requests.some(x=>x.id===r[0]))continue;
  const base='pilot/'+r[0],row={id:String(r[0]),owner_id:w.ownerId,storage_owner_id:w.ownerId,signer_id:null,title:String(r[2]),token_hash:String(r[1]),original_path:base+'/original.pdf',signed_path:base+'/signed.pdf',created_at:String(r[5]),updated_at:String(r[8]||r[5]),expires_at:String(r[6]),status:String(r[7]),signed_at:r[8]?String(r[8]):null};
  w.tables.sign_requests.push(row);for(const pair of [[r[3],row.original_path],[r[4],row.signed_path]])if(pair[0])w.files.push({path:pair[1],fileId:String(pair[0]),sha256:null});
 }
 const byId={};function add(id,role,sha){if(!id)return;if(byId[id]){if(sha&&byId[id].sha256&&sha!==byId[id].sha256)throw new Error('Source digest mismatch');return}const f=DriveApp.getFileById(id),mime=f.getMimeType();if(!['application/pdf','image/png'].includes(mime))throw new Error('Unsupported source file');const actual=hashBytes_(f.getBlob().getBytes());if(sha&&sha!==actual)throw new Error('Source digest mismatch');byId[id]={id,role,name:f.getName(),mime,bytes:f.getSize(),sha256:actual}}
 for(const f of w.files)add(f.fileId,f.path.endsWith('/signed.pdf')?'signed':'original',f.sha256);
 for(const m of shared){add(m.originalId,'shared');add(m.pdfId,'shared');for(const p of m.people){add(p.labelId,'shared');add(p.pngId,'shared')}}
 shared.sort((a,b)=>a.id.localeCompare(b.id));const files=Object.values(byId).sort((a,b)=>a.id.localeCompare(b.id));
 const snapshot={version:1,email,workspace:w,shared,files};return {snapshot,digest:hash_(JSON.stringify(snapshot))};
}
function doPost(e){
 let result;try{
  const raw=e&&e.postData&&e.postData.contents;if(typeof raw!=='string'||raw.length>20000)throw new Error('Invalid export request');const p=JSON.parse(raw),email=legacyGoogleOwner_(p.googleToken);
  if(!['metadata','file','freeze'].includes(p.action))throw new Error('Unsupported export action');
  const lock=LockService.getScriptLock();lock.waitLock(30000);try{
   if(p.action==='metadata'){
    const source=legacyGoogleSnapshot_(email),file=DriveApp.getFolderById(source.snapshot.workspace.folderId).createFile(Utilities.newBlob(JSON.stringify(source),'application/json','google-export-'+Utilities.getUuid()+'.json'));
    PropertiesService.getScriptProperties().setProperty('GOOGLE_ONLY_EXPORT',file.getId());result={...source,frozen:legacyMigrationFrozen_()};
   }else if(p.action==='freeze'){
    const source=legacyGoogleSnapshot_(email);if(p.digest!==source.digest)throw new Error('Source changed; restart the transfer');PropertiesService.getScriptProperties().setProperty('GOOGLE_ONLY_FREEZE',source.digest);result={frozen:true,digest:source.digest};
   }else{
    const pointer=PropertiesService.getScriptProperties().getProperty('GOOGLE_ONLY_EXPORT');if(!pointer)throw new Error('Prepare the export first');const source=JSON.parse(DriveApp.getFileById(pointer).getBlob().getDataAsString());
    if(source.snapshot.email!==email||p.digest!==source.digest)throw new Error('Source export changed; restart the transfer');const f=source.snapshot.files.find(x=>x.id===p.id);if(!f)throw new Error('File is outside this export');const bytes=DriveApp.getFileById(f.id).getBlob().getBytes(),sha256=hashBytes_(bytes);if(bytes.length!==f.bytes||f.sha256!==sha256)throw new Error('Source file verification failed');result={base64:Utilities.base64Encode(bytes),sha256,bytes:bytes.length,mime:f.mime};
   }
  }finally{lock.releaseLock()}
  return ContentService.createTextOutput(JSON.stringify({ok:true,data:result})).setMimeType(ContentService.MimeType.JSON);
 }catch(error){return ContentService.createTextOutput(JSON.stringify({ok:false,error:error.message||'Export failed'})).setMimeType(ContentService.MimeType.JSON)}
}
function legacyMigrationLanding_(){return HtmlService.createHtmlOutput('<meta name="referrer" content="no-referrer"><p>המסמכים הועברו לגרסה החדשה של SignWay.</p><a id="open" target="_top" href="https://roishlomo-teleprompter.github.io/Sign-PDF/">פתיחת SignWay</a><script>google.script.url.getLocation(function(loc){var token=new URLSearchParams((loc.hash||" ").replace(/^#/,"")).get("token");if(token)document.getElementById("open").href="https://roishlomo-teleprompter.github.io/Sign-PDF/?sign="+encodeURIComponent(token)});</script>')}
