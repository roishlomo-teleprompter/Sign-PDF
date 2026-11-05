/* Optional recipient PDF attachments. Paths follow immutable request PDF namespaces. */
window.AttachmentFiles=(()=>{
 function pathForRequest(originalPath){if(typeof originalPath!=='string'||!/\/original\.pdf$/.test(originalPath))throw new Error('Invalid request PDF path');return originalPath.replace(/\/original\.pdf$/,'/attachment.pdf')}
 async function forOwner(db,ids){if(!ids.length)return [];const rows=[];for(let start=0;start<ids.length;start+=80){const result=await db.from('sign_request_attachments').select('request_id,file_name,storage_path,created_at').in('request_id',ids.slice(start,start+80));if(result.error){if(['PGRST205','42P01','42703'].includes(result.error.code))return [];throw result.error}rows.push(...(result.data||[]))}return rows}
 async function send({db,request,token,file}){if(!file)return;const path=pathForRequest(request.original_path);const result=await db.storage.from('sign-pdf-documents').upload(path,file.bytes,{contentType:'application/pdf',upsert:true});if(result.error)throw result.error;const registered=await db.rpc('register_sign_attachment',{p_token:token,p_filename:file.name});if(registered.error)throw registered.error}
 return {pathForRequest,forOwner,send};
})();
