/* Single-owner pilot. Bind to a private Google Sheet. Never publish the Sheet or folders. */
const LIMIT_BYTES_ = 5 * 1024 * 1024;
const HEADERS_ = ['id','token_hash','title','original_id','signed_id','created_at','expires_at','status','signed_at','signed_sha256'];
function onOpen(){SpreadsheetApp.getUi().createMenu('SignWay').addItem('הגדרה ראשונית','setup_').addItem('העלאת מסמך ושליחה','showAdmin_').addToUi()}
function setup_(){
 const p=PropertiesService.getScriptProperties(),sheet=SpreadsheetApp.getActiveSpreadsheet();
 if(!p.getProperty('SHEET_ID')){
  const root=DriveApp.createFolder('SignWay');
  p.setProperties({SHEET_ID:sheet.getId(),ROOT_ID:root.getId(),ORIGINALS_ID:root.createFolder('Originals').getId(),SIGNED_ID:root.createFolder('Signed').getId()});
 }
 const requests=requestSheet_();if(requests.getLastRow()===0)requests.appendRow(HEADERS_);
 for(const name of ['Contacts','Groups','Events'])if(!sheet.getSheetByName(name)){const tab=sheet.insertSheet(name);tab.appendRow(['id','name','data_json','updated_at'])}
 SpreadsheetApp.getUi().alert('ההגדרה הושלמה. פרסמו כ-Web app, הפעלה כבעל ההתקנה, גישה Anyone. לאחר מכן פתחו את תפריט SignWay.');
}
function showAdmin_(){
 config_();const token=Utilities.getUuid()+Utilities.getUuid();CacheService.getScriptCache().put('admin:'+hash_(token),'1',1800);
 const t=HtmlService.createTemplateFromFile('Admin');t.adminToken=token;
 SpreadsheetApp.getUi().showSidebar(t.evaluate().setTitle('SignWay - העלאת PDF'));
}
function doGet(e){if(e&&e.parameter.mode==='bridge'){const channel=String(e.parameter.channel||'');if(!/^[a-f0-9]{32}$/.test(channel))throw new Error('Invalid channel');const t=HtmlService.createTemplateFromFile('Bridge');t.channel=channel;return t.evaluate().setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).setTitle('SignWay Drive connection')}return HtmlService.createHtmlOutputFromFile('Signer').setTitle('SignWay - חתימה בדרך').addMetaTag('viewport','width=device-width,initial-scale=1')}
function ownerUpload(adminToken,name,base64){
 admin_(adminToken);const url=ScriptApp.getService().getUrl();if(!url||!/\/exec$/.test(url))throw new Error('יש לפרסם תחילה גרסת Web app.');
 const bytes=pdfBytes_(base64),title=String(name||'document.pdf').replace(/[\x00-\x1f]/g,'').slice(0,180),id=Utilities.getUuid(),token=Utilities.getUuid()+Utilities.getUuid();
 const lock=LockService.getScriptLock();lock.waitLock(30000);let file;
 try{file=DriveApp.getFolderById(config_().ORIGINALS_ID).createFile(Utilities.newBlob(bytes,'application/pdf',title));
 const created=new Date(),expiry=new Date(created.getTime()+7*86400000);requestSheet_().appendRow([id,hash_(token),(/^[=+@-]/.test(title)?"'"+title:title),file.getId(),'',created.toISOString(),expiry.toISOString(),'pending','','']);
 return {url:url+'#token='+encodeURIComponent(token),title,expiresAt:expiry.toISOString()};
 }catch(e){if(file)file.setTrashed(true);throw new Error('לא ניתן לשמור את המסמך. בדקו את ההרשאות והמקום הפנוי.')}finally{lock.releaseLock()}
}
function getSigningDocument(token){
 const r=findRequest_(token);if(r.values[7]==='signed')return {completed:true};pending_(r);
 const file=DriveApp.getFileById(r.values[3]);if(file.getSize()>LIMIT_BYTES_)throw new Error('הקובץ גדול מדי לפיילוט.');
 return {title:String(r.values[2]),base64:Utilities.base64Encode(file.getBlob().getBytes()),expiresAt:String(r.values[6])};
}
function submitSignedDocument(token,base64){
 const bytes=pdfBytes_(base64),digest=hashBytes_(bytes),lock=LockService.getScriptLock();lock.waitLock(30000);let file;
 try{const r=findRequest_(token);
 if(r.values[7]==='signed'){if(r.values[9]===digest)return {completed:true};throw new Error('המסמך כבר נחתם.');}
 pending_(r);file=DriveApp.getFolderById(config_().SIGNED_ID).createFile(Utilities.newBlob(bytes,'application/pdf',String(r.values[2]).replace(/\.pdf$/i,'')+'-signed.pdf'));
 // One range write commits file identity, status and digest together.
 const row=r.values.slice();row[4]=file.getId();row[7]='signed';row[8]=new Date().toISOString();row[9]=digest;
 requestSheet_().getRange(r.row,1,1,HEADERS_.length).setValues([row]);return {completed:true};
 }catch(e){if(file)file.setTrashed(true);throw e}finally{lock.releaseLock()}
}
function cancelRequest(adminToken,id){admin_(adminToken);const lock=LockService.getScriptLock();lock.waitLock(30000);try{const s=requestSheet_(),rows=s.getDataRange().getValues();for(let i=1;i<rows.length;i++)if(rows[i][0]===id&&rows[i][7]==='pending'){s.getRange(i+1,8).setValue('cancelled');return true}return false}finally{lock.releaseLock()}}
function config_(){const c=PropertiesService.getScriptProperties().getProperties();if(!c.SHEET_ID||!c.ORIGINALS_ID||!c.SIGNED_ID)throw new Error('הפיילוט עדיין לא הוגדר.');return c}
function requestSheet_(){const c=PropertiesService.getScriptProperties().getProperties();if(!c.SHEET_ID)throw new Error('Run setup first');const ss=SpreadsheetApp.openById(c.SHEET_ID);return ss.getSheetByName('Requests')||ss.insertSheet('Requests')}
function admin_(token){if(typeof token!=='string'||!CacheService.getScriptCache().get('admin:'+hash_(token)))throw new Error('פתחו מחדש את סרגל SignWay מתוך הגיליון הפרטי.')}
function findRequest_(token){if(typeof token!=='string'||!/^[a-f0-9-]{72}$/.test(token))throw new Error('הקישור אינו תקין או אינו זמין.');const digest=hash_(token),rows=requestSheet_().getDataRange().getValues();for(let i=1;i<rows.length;i++)if(rows[i][1]===digest)return {row:i+1,values:rows[i]};throw new Error('הקישור אינו תקין או אינו זמין.')}
function pending_(r){if(r.values[7]!=='pending'||Date.parse(r.values[6])<=Date.now())throw new Error('הקישור פג תוקף או בוטל.')}
function hash_(value){return hashBytes_(Utilities.newBlob(value).getBytes())}
function hashBytes_(bytes){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('')}
function pdfBytes_(base64){if(typeof base64!=='string'||base64.length>Math.ceil(LIMIT_BYTES_/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw new Error('PDF עד 5MB בלבד בפיילוט.');const bytes=Utilities.base64Decode(base64);if(!bytes.length||bytes.length>LIMIT_BYTES_||String.fromCharCode.apply(null,bytes.slice(0,5))!=='%PDF-')throw new Error('יש לבחור PDF תקין.');return bytes}

// The browser only selects this backend for its configured pilot account.
// Authorization is always enforced here against the Auth server, never a client email.
function appOwner_(accessToken){
 if(typeof accessToken!=='string'||accessToken.length<30||accessToken.length>8192)throw new Error('נדרשת התחברות מחדש לאפליקציה.');
 const result=UrlFetchApp.fetch('https://yybpppkxniizxbeettpp.supabase.co/auth/v1/user',{headers:{apikey:'sb_publishable_VHrjc5o3jYTfJkR0Y9gZHQ_5DebiLY7',Authorization:'Bearer '+accessToken},muteHttpExceptions:true});
 if(result.getResponseCode()!==200)throw new Error('ההתחברות פגה. התחברו מחדש.');
 const user=JSON.parse(result.getContentText()),owner=DriveApp.getFileById(config_().SHEET_ID).getOwner().getEmail().toLowerCase();
 if(!owner||user.is_anonymous||!user.email_confirmed_at||String(user.email||'').toLowerCase()!==owner||!(user.identities||[]).some(i=>i.provider==='google'))throw new Error('אחסון Drive זה זמין רק לבעל ההתקנה.');
 return user.id;
}
function appDispatch(accessToken,action,payload){
 appOwner_(accessToken);payload=payload||{};
 if(action==='list')return requestSheet_().getDataRange().getValues().slice(1).filter(r=>r[0]&&r[7]!=='deleted').map(r=>({id:r[0],title:r[2],original_path:r[3],signed_path:r[4],created_at:r[5],expires_at:r[6],status:r[7],signed_at:r[8],backend:'drive'}));
 if(action==='upload'){const token=Utilities.getUuid()+Utilities.getUuid();CacheService.getScriptCache().put('admin:'+hash_(token),'1',60);return ownerUpload(token,payload.name,payload.base64)}
 if(!['download','cancel','delete'].includes(action))throw new Error('פעולה לא נתמכת.');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{const s=requestSheet_(),rows=s.getDataRange().getValues();let row=-1;for(let i=1;i<rows.length;i++)if(rows[i][0]===payload.id&&rows[i][7]!=='deleted'){row=i;break}if(row<0)throw new Error('המסמך לא נמצא.');const r=rows[row];
 if(action==='download'){if(r[7]!=='signed'||!r[4])throw new Error('המסמך עדיין לא נחתם.');const f=DriveApp.getFileById(r[4]);if(f.getSize()>LIMIT_BYTES_)throw new Error('הקובץ גדול מדי.');return {base64:Utilities.base64Encode(f.getBlob().getBytes())}}
 if(action==='cancel'){if(r[7]==='pending')s.getRange(row+1,8).setValue('cancelled');return true}
 // Recoverable trash, not permanent deletion. No arbitrary client-supplied file IDs.
 for(const id of [r[3],r[4]].filter(Boolean))DriveApp.getFileById(id).setTrashed(true);
 s.getRange(row+1,8).setValue('deleted');return true;
 }finally{lock.releaseLock()}
}
