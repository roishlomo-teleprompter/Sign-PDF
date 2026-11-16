/* Signature hints travel inside the private PDF, without changing its visible content. */
window.SignatureFields=(()=>{
 const key=()=>PDFLib.PDFName.of('SignWaySignatureFields');
 const valid=(b,pages)=>b&&Number.isInteger(b.page)&&b.page>=1&&b.page<=pages&&['x','y','w','h'].every(k=>Number.isFinite(b[k]))&&b.x>=0&&b.y>=0&&b.w>=.04&&b.h>=.02&&b.x+b.w<=1.00001&&b.y+b.h<=1.00001;
 function read(doc){try{const raw=doc.catalog.get(key());if(!raw||typeof raw.decodeText!=='function')return [];const fields=JSON.parse(raw.decodeText());return Array.isArray(fields)?fields.slice(0,50).filter(f=>valid(f,doc.getPageCount())&&Number.isInteger(f.signer)&&f.signer>=0&&f.signer<=50):[]}catch{return []}}
 async function suggestion(bytes,signer=0){try{const doc=await PDFLib.PDFDocument.load(bytes.slice());const field=read(doc).find(f=>f.signer===signer);if(!field)return null;const {page,x,y,w,h}=field;return {page,x,y,w,h,confirmed:true,suggested:true}}catch{return null}}
 async function write(pdf,doc,fields){doc.catalog.set(key(),PDFLib.PDFString.of(JSON.stringify(fields)));const bytes=await doc.save();return {...pdf,bytes:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),size:bytes.byteLength}}
 const overlaps=(a,b)=>a.page===b.page&&a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
 async function edit(pdf,tr,people=[]){
  const doc=await PDFLib.PDFDocument.load(pdf.bytes.slice()),shared=people.length>0;
  let fields=read(doc).filter(f=>shared?f.signer>=1&&f.signer<=people.length:f.signer===0),pageNum=fields[0]?.page||1,selected=shared?1:0,rendering=false,closed=false;
  const view=await pdfjsLib.getDocument({data:new Uint8Array(pdf.bytes.slice())}).promise;
  const dialog=document.createElement('dialog');dialog.className='signature-field-editor';dialog.setAttribute('aria-label',tr('סימון מקום לחתימה','Mark signature location'));
  dialog.innerHTML='<header><h2></h2><p></p><strong dir="auto"></strong></header><div class="sf-tools"><label><span></span><select></select></label><button type="button" data-prev>‹</button><output></output><button type="button" data-next>›</button><button type="button" data-remove></button></div><div class="sf-scroll"><div class="sf-page"><canvas></canvas><div class="sf-boxes"></div></div></div><p class="sf-error" role="alert"></p><footer><button type="button" data-save class="primary"></button><button type="button" data-skip></button><button type="button" data-cancel></button></footer>';
  const $=s=>dialog.querySelector(s),canvas=$('canvas'),boxes=$('.sf-boxes'),select=$('select');
  $('h2').textContent=tr('סימון מקום לחתימה','Mark signature location');$('header p').textContent=tr('לחצו במסמך במקום המיועד לחתימה. אפשר לגרור את המסגרת.','Click the document where the signature belongs. Drag the box to adjust it.');$('header strong').textContent=pdf.name;
  $('label span').textContent=tr('חותם','Signer');$('label').hidden=!shared;
  people.forEach((p,i)=>{const option=document.createElement('option');option.value=i+1;option.textContent=p.name;select.append(option)});
  $('[data-save]').textContent=tr('שמירת הסימון והמשך','Save locations and continue');$('[data-skip]').textContent=tr('המשך ללא סימון','Continue without locations');$('[data-cancel]').textContent=tr('ביטול','Cancel');$('[data-remove]').textContent=tr('הסרת הסימון','Remove location');$('[data-prev]').setAttribute('aria-label',tr('העמוד הקודם','Previous page'));$('[data-next]').setAttribute('aria-label',tr('העמוד הבא','Next page'));
  function paint(){boxes.replaceChildren();for(const field of fields.filter(f=>f.page===pageNum)){const box=document.createElement('div');box.className='sf-box'+(field.signer===selected?' selected':'');box.style.cssText=`left:${field.x*100}%;top:${field.y*100}%;width:${field.w*100}%;height:${field.h*100}%`;box.textContent=shared?people[field.signer-1]?.name:tr('חתימה כאן','Sign here');box.onpointerdown=event=>{if(rendering)return;event.preventDefault();event.stopPropagation();selected=field.signer;select.value=String(selected);const rect=canvas.getBoundingClientRect(),startX=event.clientX,startY=event.clientY,x=field.x,y=field.y;box.setPointerCapture(event.pointerId);box.onpointermove=e=>{field.x=Math.max(0,Math.min(1-field.w,x+(e.clientX-startX)/rect.width));field.y=Math.max(0,Math.min(1-field.h,y+(e.clientY-startY)/rect.height));box.style.left=field.x*100+'%';box.style.top=field.y*100+'%'};box.onpointerup=()=>{box.onpointermove=null;paint()};box.onpointercancel=()=>{box.onpointermove=null;paint()}};boxes.append(box)}$('[data-remove]').disabled=!fields.some(f=>f.signer===selected)}
  async function render(){rendering=true;$('[data-save]').disabled=true;try{const page=await view.getPage(pageNum),base=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(1.7,900/base.width)});canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;if(closed)return;$('output').textContent=tr('עמוד '+pageNum+' מתוך '+view.numPages,'Page '+pageNum+' of '+view.numPages);$('[data-prev]').disabled=pageNum===1;$('[data-next]').disabled=pageNum===view.numPages;paint()}finally{rendering=false;$('[data-save]').disabled=false}}
  canvas.onclick=event=>{if(rendering)return;const rect=canvas.getBoundingClientRect(),w=.30,h=.12;fields=fields.filter(f=>f.signer!==selected);fields.push({signer:selected,page:pageNum,x:Math.max(0,Math.min(1-w,(event.clientX-rect.left)/rect.width-w/2)),y:Math.max(0,Math.min(1-h,(event.clientY-rect.top)/rect.height-h/2)),w,h});$('.sf-error').textContent='';paint()};
  select.onchange=async()=>{selected=Number(select.value);const field=fields.find(f=>f.signer===selected);if(field&&!rendering){pageNum=field.page;await render()}else paint()};
  for(const [selector,step]of [['[data-prev]',-1],['[data-next]',1]])$(selector).onclick=async()=>{if(rendering)return;pageNum+=step;await render()};
  $('[data-remove]').onclick=()=>{fields=fields.filter(f=>f.signer!==selected);paint()};
  document.body.append(dialog);dialog.showModal();
  try{return await new Promise((resolve,reject)=>{
   const finish=result=>{closed=true;dialog.close();resolve(result)};
   dialog.oncancel=event=>{event.preventDefault();finish(null)};$('[data-cancel]').onclick=()=>finish(null);
   $('[data-skip]').onclick=async()=>{try{finish(await write(pdf,doc,[]))}catch(e){reject(e)}};
   $('[data-save]').onclick=async()=>{if(shared&&fields.some((a,i)=>fields.slice(i+1).some(b=>overlaps(a,b)))){$('.sf-error').textContent=tr('יש להפריד בין מקומות החתימה כדי שהחתימות לא יחפפו.','Separate the signature locations so they do not overlap.');return}try{finish(await write(pdf,doc,fields))}catch(e){reject(e)}};
   render().catch(reject);
  })}finally{closed=true;dialog.close();dialog.remove();await view.destroy()}
 }
 return {edit,suggestion,read,valid,overlaps};
})();
