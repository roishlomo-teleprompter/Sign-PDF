/* Optional, account-bound import of this installation's existing Drive documents. */
window.GoogleMigration=(()=>{
 async function mount({db,tr}){
  const transport=SharedDrive.create(),panel=document.createElement('section');panel.className='auth-card';panel.hidden=true;document.getElementById('appContent').prepend(panel);
  let state,started=false,busy=false,disposed=false;const label=(he,en)=>tr(he,en);
  try{state=await transport.call('import-status');if(disposed||!state.available||state.complete)return {remove(){panel.remove()}}}catch{return {remove(){panel.remove()}}}
  panel.hidden=false;const title=document.createElement('h2'),copy=document.createElement('p'),button=document.createElement('button'),progress=document.createElement('p');progress.setAttribute('role','status');button.className='primary';title.textContent=label('המסמכים הקיימים שלך','Your existing documents');copy.textContent=label('אפשר להעביר את המסמכים ואנשי הקשר לגרסה החדשה. הקבצים המקוריים נשמרים.','Transfer your documents and contacts to the new version. Original files are kept.');button.textContent=label('העברת הנתונים הקיימים','Transfer existing data');panel.append(title,copy,button,progress);
  button.onclick=async()=>{if(busy)return;busy=true;button.disabled=true;progress.textContent=label('מכין את ההעברה. הפעולה עשויה להימשך מספר דקות...','Preparing the transfer. This may take a few minutes...');try{
   state=await transport.call('import-start',{restart:started});started=true;
   while(!disposed&&state.copied<state.total){progress.textContent=label('הועברו '+state.copied+' מתוך '+state.total+' קבצים','Transferred '+state.copied+' of '+state.total+' files');state=await transport.call('import-step')}
   if(disposed)return;progress.textContent=label('מאמת את המסמכים ומסיים את ההעברה...','Verifying documents and completing the transfer...');do{state=await transport.call('import-finish');if(!state.complete)progress.textContent=label('נבדקו '+state.verified+' מתוך '+state.total+' קבצים','Verified '+state.verified+' of '+state.total+' files')}while(!state.complete&&!disposed);if(disposed)return;progress.textContent=label('ההעברה הושלמה בהצלחה.','Transfer completed successfully.');location.reload();
  }catch(e){progress.textContent=label('ההעברה נעצרה. הנתונים נשמרו. ','Transfer stopped. Your data was kept. ')+(e.message||'');button.textContent=label('ניסיון נוסף','Retry');button.disabled=false;busy=false}};
  return {remove(){disposed=true;panel.remove()}};
 }
 return {mount};
})();
