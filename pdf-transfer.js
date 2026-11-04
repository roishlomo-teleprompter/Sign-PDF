/* Read provider-backed mobile files before uploading; send bytes, not multipart File handles. */
window.PdfTransfer=(()=>{
 class TransferError extends Error{constructor(code,cause){super(code);this.code=code;this.cause=cause}}
 function networkError(e){return /failed to fetch|network|load failed|fetch failed|timeout/i.test([e?.message,e?.originalError?.message,e?.cause?.message].filter(Boolean).join(' '))}
 async function prepare(file){
  if(!file||!file.size||file.size>26214400)throw new TransferError('invalid-pdf');
  let bytes;
  try{bytes=await file.arrayBuffer()}catch(cause){throw new TransferError('file-unreadable',cause)}
  const data=new Uint8Array(bytes),header=String.fromCharCode(...data.subarray(0,1024));
  if(data.byteLength!==file.size||!header.includes('%PDF-'))throw new TransferError('invalid-pdf');
  return {name:file.name||'document.pdf',size:data.byteLength,type:'application/pdf',bytes};
 }
 async function upload(db,bucket,path,pdf,{sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
  const bytes=pdf.bytes||await pdf.arrayBuffer();let last;
  for(let attempt=0;attempt<3;attempt++){
   try{const result=await db.storage.from(bucket).upload(path,bytes,{contentType:'application/pdf',upsert:false});if(result.error)throw result.error;return result.data}
   catch(e){last=e;if(!networkError(e))throw e;
    // A lost response can follow a successful insert. Confirm identical bytes before retrying.
    try{const found=await db.storage.from(bucket).download(path);if(!found.error&&found.data?.size===bytes.byteLength){const actual=new Uint8Array(await found.data.arrayBuffer()),expected=new Uint8Array(bytes);if(actual.length===expected.length&&actual.every((v,i)=>v===expected[i]))return {path}}}catch{}
    if(attempt<2)await sleep(500*(attempt+1));
   }
  }
  throw new TransferError('upload-network',last);
 }
 function message(error,tr){if(error?.code==='file-unreadable')return tr('לא ניתן לקרוא את הקובץ. שמור את ה-PDF בתיקיית ההורדות במכשיר ובחר אותו שוב.','Cannot read this file. Save the PDF to your device Downloads folder and select it again.');if(error?.code==='invalid-pdf')return tr('יש לבחור קובץ PDF תקין בגודל של עד 25MB.','Choose a valid PDF file up to 25MB.');if(error?.code==='upload-network'||networkError(error))return tr('העלאת הקובץ נעצרה. הקובץ נשאר מוכן לניסיון נוסף. בדוק את החיבור; אם התקלה חוזרת, נסה רשת אחרת.','The upload was interrupted. Your file is ready to retry. Check your connection; if it keeps failing, try another network.');return tr('לא ניתן להעלות את הקובץ: ','Could not upload the file: ')+(error?.message||tr('שגיאה לא ידועה','Unknown error'))}
 return {prepare,upload,message,networkError};
})();
