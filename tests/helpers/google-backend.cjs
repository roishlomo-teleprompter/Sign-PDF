const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
function fixture(){
 const props={},cache=new Map(),files=new Map(),calls=[];let next=0,deny=false;
 const blob=(bytes,type='text/plain',name='blob')=>{const b=Buffer.from(bytes);return {getName:()=>name,getContentType:()=>type,getBytes:()=>Array.from(b),getDataAsString:()=>b.toString()}};
 const response=(status,value,bytes)=>({getResponseCode:()=>status,getContentText:()=>JSON.stringify(value),getBlob:()=>blob(bytes||'','application/octet-stream')});
 const ctx={console,Date,JSON,Object,Array,Math,Number,String,RegExp,Error,Uint8Array,Set,Map,
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]??null,setProperty:(k,v)=>props[k]=v,deleteProperty:k=>delete props[k]})},
  CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},ScriptApp:{getService:()=>({getUrl:()=> 'https://script.google.com/macros/s/test/exec'})},
  Utilities:{DigestAlgorithm:{SHA_256:1},computeDigest:(_,bytes)=>Array.from(crypto.createHash('sha256').update(Buffer.from(bytes)).digest()),getUuid:()=>crypto.randomUUID(),newBlob:blob,base64Decode:s=>Array.from(Buffer.from(s,'base64')),base64DecodeWebSafe:s=>Array.from(Buffer.from(s,'base64url')),base64Encode:b=>Buffer.from(b).toString('base64')},
  UrlFetchApp:{fetch(url,options={}){calls.push({url,options});if(!url.startsWith('https://www.googleapis.com/'))throw Error('Unexpected external dependency: '+url);if(deny)return response(403,{});
   const owner=options.headers.Authorization.replace('Bearer access-',''),u=new URL(url),method=options.method||'get';
   if(u.pathname==='/drive/v3/files'&&method==='post'){const m=JSON.parse(options.payload),id='f'+(++next);files.set(id,{...m,id,owner,bytes:Buffer.alloc(0)});return response(200,{...m,id})}
   if(u.pathname==='/upload/drive/v3/files'){const raw=Buffer.from(options.payload),text=raw.toString(),boundary=options.contentType.split('boundary=')[1],start=text.indexOf('\r\n\r\n')+4,end=text.indexOf('\r\n--'+boundary,start),m=JSON.parse(text.slice(start,end)),bodyStart=raw.indexOf(Buffer.from('\r\n\r\n'),end)+4,bodyEnd=raw.lastIndexOf(Buffer.from('\r\n--'+boundary)),bytes=raw.subarray(bodyStart,bodyEnd),id='f'+(++next);files.set(id,{...m,id,owner,bytes});return response(200,{...m,id,size:bytes.length})}
   if(u.pathname==='/drive/v3/files'){const q=u.searchParams.get('q'),matches=[...files.values()].filter(f=>f.owner===owner&&!f.trashed&&q.includes("'"+f.parents?.[0]+"'")&&q.endsWith("name = '"+f.name+"'"));return response(200,{files:matches.map(f=>({id:f.id,name:f.name,mimeType:f.mimeType,size:f.bytes.length}))})}
   const id=u.pathname.split('/').pop(),f=files.get(id);if(!f||f.owner!==owner)return response(404,{});if(method==='patch'){Object.assign(f,JSON.parse(options.payload));return response(200,{id})}if(u.searchParams.get('alt')==='media')return response(200,{},f.bytes);return response(200,{id:f.id,name:f.name,size:f.bytes.length,mimeType:f.mimeType,trashed:!!f.trashed});
  }}
 };
 vm.createContext(ctx);for(const f of ['Google.gs','Drive.gs','Workspace.gs','Shared.gs','Import.gs'])vm.runInContext(fs.readFileSync('google-drive-backend/'+f,'utf8'),ctx,{filename:f});
 const sessions={};for(const [id,char] of [['101','a'],['202','b']]){const token=char.repeat(96);sessions[id]=token;props['account:'+id]=JSON.stringify({id,email:id+'@example.com',refreshToken:'refresh-'+id,scopes:[],name:'Test'});props['session:'+digest(token)]=JSON.stringify({id,expires:Date.now()+3600000});cache.set('google-token:'+id,'access-'+id)}
 const call=(id,action,p={})=>ctx.googleDispatch(sessions[id],action,p),owner=(id,op,p={})=>call(id,'workspace-owner-call',{op,...p}),query=(id,table,operation,values,filters=[])=>owner(id,'query',{table,query:{operation,values,filters,columns:'*'}}),request=id=>owner(id,'rpc',{name:'create_sign_request',args:{p_title:'Private.pdf'}})[0];
 return {ctx,props,cache,files,calls,sessions,call,owner,query,request,deny:value=>deny=value};
}
module.exports={fixture};
