/* Private reusable signature library in the account's own Drive manifest.
 * No library data is exposed by recipient operations or public document links. */
function signatureLibrary_(w){return w.signatureLibrary||{entries:[],defaultId:null}}
function signatureEditor_(value,kind){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid signature editor');
 const text=workspaceText_(value.text||'',120,false),style=value.style,amount=value.amount,smoothing=value.smoothing;
 if(!Number.isInteger(style)||style<0||style>2||typeof amount!=='number'||!Number.isFinite(amount)||amount<0||amount>1||typeof smoothing!=='boolean')throw new Error('Invalid signature editor');
 if(!Array.isArray(value.strokes)||value.strokes.length>200)throw new Error('Invalid signature strokes');let count=0;
 const strokes=value.strokes.map(stroke=>{if(!Array.isArray(stroke)||!stroke.length||(count+=stroke.length)>6000)throw new Error('Invalid signature strokes');return stroke.map(p=>{if(!Array.isArray(p)||p.length!==2||p.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1))throw new Error('Invalid signature strokes');return [p[0],p[1]]})});
 if(kind==='draw'&&!strokes.length||kind!=='draw'&&!text.trim())throw new Error('Signature is empty');
 return {text,style,amount,smoothing,strokes:kind==='draw'?strokes:[]};
}
function signatureLibraryAction_(w,p){
 const current=signatureLibrary_(w),library={entries:current.entries.slice(),defaultId:current.defaultId};
 if(p.op==='signature-library-list')return library;
 if(p.op==='signature-library-save'){
  const e=p.entry||{},id=workspaceUuid_(e.id),name=workspaceText_(e.name,80,true),kind=e.kind;
  if(!['draw','name','initials'].includes(kind)||typeof e.language!=='string'||!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(e.language))throw new Error('Invalid signature');
  const png=typeof e.png==='string'?e.png:'';sharedPng_(png,false);const editor=signatureEditor_(e.editor,kind),index=library.entries.findIndex(s=>s.id===id),previous=library.entries[index];
  if(index<0&&library.entries.length>=12)throw new Error('Signature library full');
  const entry={id,name,kind,language:e.language,png,editor,createdAt:previous?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};if(index<0)library.entries.push(entry);else library.entries[index]=entry;
  if(!library.defaultId||p.makeDefault===true)library.defaultId=id;
 }else{
  const id=workspaceUuid_(p.id);if(!library.entries.some(e=>e.id===id))throw new Error('Signature unavailable');
  if(p.op==='signature-library-delete'){library.entries=library.entries.filter(e=>e.id!==id);if(library.defaultId===id)library.defaultId=library.entries[0]?.id||null}
  else if(p.op==='signature-library-default')library.defaultId=id;
  else throw new Error('Unsupported signature operation');
 }
 w.signatureLibrary=library;return library;
}
