/* Compatibility adapter for existing UI operations. Only the installed account
 * routes through this service. Once active, errors never trigger source writes. */
window.DriveWorkspace=(()=>{
 const PILOT='roi.shlomo@gmail.com',TABLES=new Set(['sign_requests','signature_groups','signature_events','event_participants']);
 const failure=error=>({data:null,error});
 function create(raw){
  let transport=null,routeOwner=null,routePromise=null;const capabilities=new Map(),resolved=new Map();
  const publicMode=new URLSearchParams(location.search).has('sign')||new URLSearchParams(location.search).has('event');
  const bridge=()=>transport||(transport=SharedDrive.create(raw));
  const call=(action,payload)=>bridge().call(action,payload);
  async function route(){
   const {data,error}=await raw.auth.getSession();if(error)throw error;const user=data?.session?.user;
   if(!user||user.is_anonymous||String(user.email||'').toLowerCase()!==PILOT)return false;
   if(routeOwner!==user.id){routeOwner=user.id;routePromise=null}
   if(!routePromise){const pending=call('workspace-status').then(s=>s.active===true);routePromise=pending;pending.catch(()=>{if(routePromise===pending)routePromise=null})}
   return routePromise;
  }
  async function resolve(token){if(!resolved.has(token)){const promise=call('workspace-public-resolve',{token}).then(r=>r.found===true);resolved.set(token,promise);promise.catch(()=>resolved.delete(token))}return resolved.get(token)}
  async function owner(op,payload={}){return call('workspace-owner-call',{op,...payload})}
  async function signer(op,token,payload={}){return call('workspace-public-call',{op,token,...payload})}
  function from(table){
   if(!TABLES.has(table))return raw.from(table);
   const q={operation:'select',columns:'*',filters:[]};let execution;
   const builder={select(columns='*'){q.columns=columns;q.selected=true;return builder},insert(values){q.operation='insert';q.values=values;return builder},update(values){q.operation='update';q.values=values;return builder},delete(){q.operation='delete';return builder},eq(column,value){q.filters.push({type:'eq',column,value});return builder},in(column,value){q.filters.push({type:'in',column,value});return builder},order(column,options={}){q.order={column,...options};return builder},limit(value){q.limit=value;return builder},single(){q.single='one';return builder},maybeSingle(){q.single='maybe';return builder},then(resolve,reject){execution=execution||execute();return execution.then(resolve,reject)}};
   async function execute(){try{if(await route())return {data:await owner('query',{table,query:q}),error:null};let query=raw.from(table);if(q.operation==='select')query=query.select(q.columns);else{query=q.operation==='delete'?query.delete():query[q.operation](q.values);if(q.selected||q.single)query=query.select(q.columns)}for(const f of q.filters)query=query[f.type](f.column,f.value);if(q.order)query=query.order(q.order.column,{ascending:q.order.ascending});if(q.limit!==undefined)query=query.limit(q.limit);if(q.single)query=q.single==='one'?query.single():query.maybeSingle();return await query}catch(e){return failure(e)}}
   return builder;
  }
  async function rpc(name,args={}){try{
   if(['claim_sign_request','complete_sign_request','event_bundle'].includes(name)){
    if(await resolve(args.p_token)){
     const data=await signer(name,args.p_token,{args});
     if(name==='claim_sign_request'&&data?.[0])for(const path of [data[0].original_path,data[0].signed_path])capabilities.set(path,args.p_token);
     return {data,error:null};
    }
    return raw.rpc(name,args);
   }
   if(await route())return {data:await owner('rpc',{name,args}),error:null};return raw.rpc(name,args);
  }catch(e){return failure(e)}}
  async function base64(value){const bytes=(ArrayBuffer.isView(value)?new Uint8Array(value.buffer,value.byteOffset,value.byteLength):new Uint8Array(value instanceof ArrayBuffer?value:await value.arrayBuffer()));let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text)}
  const blob=value=>{const text=atob(value),bytes=new Uint8Array(text.length);for(let i=0;i<text.length;i++)bytes[i]=text.charCodeAt(i);return new Blob([bytes],{type:'application/pdf'})};
  const storage={from(bucket){if(bucket!=='sign-pdf-documents')return raw.storage.from(bucket);return {
   async upload(path,value,options){try{const token=capabilities.get(path);if(token)return {data:await signer('upload',token,{path,base64:await base64(value)}),error:null};if(!publicMode&&await route())return {data:await owner('upload',{path,base64:await base64(value)}),error:null};return raw.storage.from(bucket).upload(path,value,options)}catch(e){return failure(e)}},
   async download(path){try{const token=capabilities.get(path);if(token){const r=await signer('download',token,{path});return {data:blob(r.base64),error:null}}if(!publicMode&&await route()){const r=await owner('download',{path});return {data:blob(r.base64),error:null}}return raw.storage.from(bucket).download(path)}catch(e){return failure(e)}},
   async remove(paths){try{if(await route())return {data:await owner('remove',{paths}),error:null};return raw.storage.from(bucket).remove(paths)}catch(e){return failure(e)}}
  }}};
  const auth=new Proxy(raw.auth,{get(target,key){
   if(key==='getUser')return async(...args)=>{const result=await target.getUser(...args);if(!result.error&&result.data?.user&&!publicMode){try{if(await route()){const settings=await owner('settings-get');result.data.user={...result.data.user,user_metadata:{...result.data.user.user_metadata,signway_gmail_send_confirmed_v1:settings.gmailSendConfirmed===true}}}}catch(e){return failure(e)}}return result};
   if(key==='updateUser')return async(values,...rest)=>{if(Object.keys(values||{}).length===1&&values.data&&Object.keys(values.data).length===1&&'signway_gmail_send_confirmed_v1' in values.data){try{if(await route()){await owner('settings-set',{settings:{gmailSendConfirmed:values.data.signway_gmail_send_confirmed_v1}});return auth.getUser()}}catch(e){return failure(e)}}return target.updateUser(values,...rest)};
   const value=target[key];return typeof value==='function'?value.bind(target):value;
  }});
  return {auth,from,rpc,storage,
   async signwayUsesDrive(){return route()},
   async signwaySettings(){return await route()?owner('settings-get'):null},
   async signwaySaveLanguage(language){if(await route())await owner('settings-set',{settings:{language}})},
   async signwayStoreSelfSigned({original,signed,title,creationId}){if(await route())return owner('self-save',{creationId,title,original:await base64(original),signed:await base64(signed)})},
   dispose(){transport?.dispose();transport=null}
  };
 }
 return {create};
})();
