/* Preserve existing UI calls while routing all data exclusively through Google. */
window.GoogleWorkspace=(()=>{
 const TABLES=new Set(['sign_requests','signature_groups','signature_events','event_participants']);
 const failure=error=>({data:null,error});
 function create(identity){
  const transport=SharedDrive.create(),capabilities=new Map();
  const publicMode=['sign','event','shared'].some(k=>new URLSearchParams(location.search).has(k));
  const owner=(op,p={})=>transport.call('workspace-owner-call',{op,...p});
  const signer=(op,token,p={})=>transport.call('workspace-public-call',{op,token,...p});
  const blob=value=>{const text=atob(value),bytes=new Uint8Array(text.length);for(let i=0;i<text.length;i++)bytes[i]=text.charCodeAt(i);return new Blob([bytes],{type:'application/pdf'})};
  async function base64(value){const bytes=ArrayBuffer.isView(value)?new Uint8Array(value.buffer,value.byteOffset,value.byteLength):new Uint8Array(value instanceof ArrayBuffer?value:await value.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text)}
  function from(table){
   if(!TABLES.has(table))throw new Error('Unsupported table');
   const q={operation:'select',columns:'*',filters:[]};let execution;
   const builder={select(columns='*'){q.columns=columns;return builder},insert(values){q.operation='insert';q.values=values;return builder},update(values){q.operation='update';q.values=values;return builder},delete(){q.operation='delete';return builder},eq(column,value){q.filters.push({type:'eq',column,value});return builder},in(column,value){q.filters.push({type:'in',column,value});return builder},order(column,options={}){q.order={column,...options};return builder},limit(value){q.limit=value;return builder},single(){q.single='one';return builder},maybeSingle(){q.single='maybe';return builder},then(resolve,reject){execution=execution||owner('query',{table,query:q}).then(data=>({data,error:null}),failure);return execution.then(resolve,reject)}};
   return builder;
  }
  async function rpc(name,args={}){try{
   if(['claim_sign_request','complete_sign_request','event_bundle'].includes(name)){
    const data=await signer(name,args.p_token,{args});
    if(name==='claim_sign_request'&&data?.[0])for(const path of [data[0].original_path,data[0].signed_path])capabilities.set(path,args.p_token);
    return {data,error:null};
   }
   if(publicMode)throw new Error('Owner operation unavailable on a signing link');
   return {data:await owner('rpc',{name,args}),error:null};
  }catch(e){return failure(e)}}
  const storage={from(bucket){if(bucket!=='sign-pdf-documents')throw new Error('Unsupported file store');return {
   async upload(path,value){try{const token=capabilities.get(path),payload={path,base64:await base64(value)};if(token)return {data:await signer('upload',token,payload),error:null};if(publicMode)throw new Error('Claim the signing link first');return {data:await owner('upload',payload),error:null}}catch(e){return failure(e)}},
   async download(path){try{const token=capabilities.get(path);if(!token&&publicMode)throw new Error('Claim the signing link first');const result=token?await signer('download',token,{path}):await owner('download',{path});return {data:blob(result.base64),error:null}}catch(e){return failure(e)}},
   async remove(paths){try{if(publicMode)throw new Error('Owner operation unavailable');return {data:await owner('remove',{paths}),error:null}}catch(e){return failure(e)}}
  }}};
  return {auth:identity.auth,from,rpc,storage,
   async signwayUsesDrive(){return true},
   async signwaySettings(){return owner('settings-get')},
   async signwaySaveLanguage(language){const r=await identity.auth.getSession();if(r.error)throw r.error;if(r.data?.session?.user&&!r.data.session.user.is_anonymous)await owner('settings-set',{settings:{language}})},
   async signwayStoreSelfSigned({original,signed,title,creationId}){return owner('self-save',{creationId,title,original:await base64(original),signed:await base64(signed)})},
   dispose(){transport.dispose()}
  };
 }
 return {create};
})();
