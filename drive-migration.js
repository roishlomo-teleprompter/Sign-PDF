/* Explicit owner migration preparation. This never switches application storage. */
window.DriveMigration=(()=>{
 async function stage({db,language,onProgress=()=>{},signal}){
  const transport=SharedDrive.create(db);
  const check=()=>{if(signal?.aborted)throw new DOMException('Migration paused','AbortError')};
  try{
   check();let state=await transport.call('migration-start',{language});onProgress(state);
   while(state.status==='copying'){check();state=await transport.call('migration-step');onProgress(state)}
   if(state.status!=='staged')throw new Error('הנתונים השתנו במהלך ההעברה. יש להתחיל שוב כדי לכלול את העדכונים.');
   return state;
  }finally{transport.dispose()}
 }
 async function status({db}){const transport=SharedDrive.create(db);try{return await transport.call('migration-status')}finally{transport.dispose()}}
 return {stage,status};
})();
