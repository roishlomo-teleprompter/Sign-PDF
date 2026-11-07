/* Every Drive REST call carries the current file owner's Google access token.
 * Never use DriveApp: that would put every user's files in the deployment owner's account. */
function personalRequest_(path,options){
 var a=personalContext_.account,o=Object.assign({muteHttpExceptions:true,followRedirects:false},options||{});o.headers=Object.assign({},o.headers||{},{Authorization:'Bearer '+googleAccess_(a)});
 var r=UrlFetchApp.fetch('https://www.googleapis.com/'+path,o),status=r.getResponseCode();
 if(status===401){CacheService.getScriptCache().remove('google-token:'+a.id);throw new Error('Google access expired. Reconnect your account.')}
 if(status<200||status>=300)throw new Error('Google Drive operation failed ('+status+'). Check access and available space.');return r;
}
function personalJson_(path,method,value){var options={method:method||'get'};if(value!==undefined){options.contentType='application/json';options.payload=JSON.stringify(value)}return JSON.parse(personalRequest_(path,options).getContentText()||'{}')}
function personalDrive_(){
 function meta(id){if(typeof id!=='string'||!/^[-\w]+$/.test(id))throw new Error('Invalid Drive file');return personalJson_('drive/v3/files/'+id+'?fields=id,name,size,mimeType,trashed')}
 function file(m){if(m.trashed)throw new Error('Drive file was deleted');var content=null;return {getId:()=>m.id,getSize:()=>Number(m.size)||0,getBlob:()=>content||(content=personalRequest_('drive/v3/files/'+m.id+'?alt=media').getBlob()),setTrashed:()=>personalJson_('drive/v3/files/'+m.id,'patch',{trashed:true})}}
 function create(metadata,blob){
  if(!blob)return file(personalJson_('drive/v3/files?fields=id,name,size,mimeType','post',metadata));
  var boundary='signway'+Utilities.getUuid().replace(/-/g,''),header='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: '+blob.getContentType()+'\r\n\r\n';
  var payload=Utilities.newBlob(header).getBytes().concat(blob.getBytes(),Utilities.newBlob('\r\n--'+boundary+'--\r\n').getBytes());
  var m=JSON.parse(personalRequest_('upload/drive/v3/files?uploadType=multipart&fields=id,name,size,mimeType',{method:'post',contentType:'multipart/related; boundary='+boundary,payload:payload}).getContentText());return file(m);
 }
 function folder(id){return {getId:()=>id,createFolder:name=>folder(create({name:name,mimeType:'application/vnd.google-apps.folder',parents:[id]}).getId()),createFile:b=>create({name:b.getName(),mimeType:b.getContentType(),parents:[id]},b),getFilesByName:name=>{
  var escaped=String(name).replace(/\\/g,'\\\\').replace(/'/g,"\\'"),q="'"+id+"' in parents and trashed = false and name = '"+escaped+"'",items=[],page='';
  do{var data=personalJson_('drive/v3/files?q='+encodeURIComponent(q)+'&fields=nextPageToken,files(id,name,size,mimeType)&pageSize=100'+(page?'&pageToken='+encodeURIComponent(page):''));items=items.concat(data.files||[]);page=data.nextPageToken||''}while(page);
  var i=0;return {hasNext:()=>i<items.length,next:()=>file(items[i++])};
 },setTrashed:()=>personalJson_('drive/v3/files/'+id,'patch',{trashed:true})}}
 return {getFileById:id=>file(meta(id)),getFolderById:folder,createFolder:name=>folder(create({name:name,mimeType:'application/vnd.google-apps.folder'}).getId())};
}
/* SharedDocuments index lives in the same user's private Drive manifest.
 * A small sheet-shaped adapter keeps the existing validated shared-signature engine. */
function personalSheets_(){
 function sheet(){var w=workspaceLoad_();if(!w.sharedRows)w.sharedRows=[];return {getLastRow:()=>w.sharedRows.length,appendRow:row=>w.sharedRows.push(row),getDataRange:()=>({getValues:()=>w.sharedRows.map(r=>r.slice())}),getRange:(row,col,height,width)=>({getValues:()=>w.sharedRows.slice(row-1,row-1+height).map(r=>r.slice(col-1,col-1+width)),setValues:values=>{if(values.length!==height||values.some(r=>r.length!==width))throw new Error('Invalid index range');values.forEach((r,i)=>{if(!w.sharedRows[row-1+i])w.sharedRows[row-1+i]=[];r.forEach((v,j)=>w.sharedRows[row-1+i][col-1+j]=v)})}})}}
 return {openById:()=>({getSheetByName:()=>workspaceLoad_().sharedRows?.length?sheet():null,insertSheet:sheet}),flush:()=>workspaceSave_(workspaceLoad_())};
}
