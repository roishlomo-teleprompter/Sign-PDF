/* Direct Google account controls for the Google-only entrypoint. */
window.AccountAuth=(()=>{
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function mount({db,user,tr,gate=false,onSignedOut=()=>location.reload()}){
  let current=user,busy=false;const root=document.createElement('section');root.className=gate?'account-bar login-gate':'account-bar';gate?document.querySelector('.topbar').after(root):document.querySelector('.header-tools').append(root);
  function render(){const signed=current&&!current.is_anonymous;root.innerHTML=signed?`<button type="button" class="profile-button" title="${esc(current.email)}" aria-label="${esc(tr('התנתקות','Sign out'))}">${esc((current.email||'G')[0].toUpperCase())}</button><p role="status"></p>`:`<h1>SignWay</h1><p>${tr('המסמכים שלך, ב-Drive שלך','Your documents, in your Drive')}</p><button type="button" class="google-signin">${tr('התחברות עם Google','Sign in with Google')}</button><p role="status"></p>`;
   root.querySelector('button').onclick=async()=>{if(busy)return;if(signed&&!window.confirm(tr('להתנתק מהחשבון? המסמכים יישארו ב-Drive שלך.','Sign out? Your documents will remain in your Drive.')))return;busy=true;root.querySelector('button').disabled=true;try{const result=signed?await db.auth.signOut():await db.auth.signInWithOAuth({provider:'google'});if(result.error)throw result.error;if(signed)onSignedOut()}catch(e){root.querySelector('[role=status]').textContent=e.message}finally{busy=false;const button=root.querySelector('button');if(button)button.disabled=false}};
  }
  render();return {setUser(next){current=next;render()},render,remove(){root.remove()},showError(error){root.querySelector('[role=status]').textContent=error.message||String(error)}};
 }
 return {mount,callbackError:()=>null,cleanCallback(){}};
})();
