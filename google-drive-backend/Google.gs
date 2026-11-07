/* Deploy in a NEW Apps Script project. No legacy service or credentials are used.
 * Script Properties are server-private; never write credentials to Drive manifests. */
var WORKSPACE_TABLES_=['sign_requests','signature_groups','signature_events','event_participants'];
var LIMIT_BYTES_=5*1024*1024,personalContext_=null;
function hash_(v){return hashBytes_(Utilities.newBlob(v).getBytes())}
function hashBytes_(b){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,b).map(v=>('0'+((v+256)%256).toString(16)).slice(-2)).join('')}
function randomToken_(){return (Utilities.getUuid()+Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,'')}
function props_(){return PropertiesService.getScriptProperties()}
function readProp_(key){var v=props_().getProperty(key);return v?JSON.parse(v):null}
function writeProp_(key,value){props_().setProperty(key,JSON.stringify(value))}
function locked_(fn){var lock=LockService.getScriptLock();lock.waitLock(30000);try{return fn()}finally{lock.releaseLock()}}
function googleConfig_(){var p=props_(),clientId=p.getProperty('GOOGLE_CLIENT_ID'),clientSecret=p.getProperty('GOOGLE_CLIENT_SECRET'),origin=p.getProperty('APP_ORIGIN');if(!clientId||!clientSecret||!/^https:\/\/[^/]+$/.test(origin||''))throw new Error('Google service is not configured');return {clientId:clientId,clientSecret:clientSecret,origin:origin,redirect:ScriptApp.getService().getUrl()}}
function doGet(e){
 var p=e&&e.parameter||{};
 if(p.mode==='bridge'){if(!/^[a-f0-9]{32}$/.test(p.channel||''))throw new Error('Invalid channel');var t=HtmlService.createTemplateFromFile('Bridge');t.channel=p.channel;t.appOrigin=googleConfig_().origin;return t.evaluate().setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)}
 if(p.code||p.error){try{var completion=googleCallback_(p);return HtmlService.createHtmlOutput('<meta name="referrer" content="no-referrer"><p>החיבור ל-Google הושלם.</p><a target="_top" href="'+completion.replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'">המשך ל-SignWay / Continue to SignWay</a>')}catch(error){return HtmlService.createHtmlOutput('<p>החיבור לא הושלם. חזרו ל-SignWay ונסו שוב.</p>')}}
 return HtmlService.createHtmlOutput('<p>SignWay Google service</p>');
}
function googleTokenRequest_(payload){var r=UrlFetchApp.fetch('https://oauth2.googleapis.com/token',{method:'post',payload:payload,muteHttpExceptions:true,followRedirects:false});if(r.getResponseCode()!==200)throw new Error('Google authorization expired. Reconnect your account.');return JSON.parse(r.getContentText())}
function googleBegin_(p,session){
 if(!p||!/^[a-f0-9]{64}$/.test(p.proofHash||''))throw new Error('Invalid browser proof');
 var c=googleConfig_(),state=randomToken_(),nonce=randomToken_(),expected=null;if(p.gmail===true){var current=googleSession_(session,false);expected=readProp_('account:'+current.id)}
 CacheService.getScriptCache().put('oauth:'+hash_(state),JSON.stringify({proofHash:p.proofHash,nonce:nonce,gmail:p.gmail===true,expectedSub:expected?expected.id:null,expires:Date.now()+600000}),600);
 var scope='openid email profile https://www.googleapis.com/auth/drive.file'+(p.gmail===true?' https://www.googleapis.com/auth/gmail.send':'');
 var q={client_id:c.clientId,redirect_uri:c.redirect,response_type:'code',scope:scope,state:state,nonce:nonce,access_type:'offline',prompt:'consent',include_granted_scopes:'true'};
 if(expected)q.login_hint=expected.email;
 return {url:'https://accounts.google.com/o/oauth2/v2/auth?'+Object.keys(q).map(k=>encodeURIComponent(k)+'='+encodeURIComponent(q[k])).join('&')};
}
function googleCallback_(p){return locked_(function(){
 if(!/^[a-f0-9]{96}$/.test(p.state||''))throw new Error('Invalid state');var cache=CacheService.getScriptCache(),key='oauth:'+hash_(p.state),raw=cache.get(key);if(!raw)throw new Error('Authorization expired');cache.remove(key);var flow=JSON.parse(raw);if(flow.expires<Date.now())throw new Error('Authorization expired');if(p.error){throw new Error('Google authorization was declined')}
 var c=googleConfig_(),tokens=googleTokenRequest_({code:p.code,client_id:c.clientId,client_secret:c.clientSecret,redirect_uri:c.redirect,grant_type:'authorization_code'});
 // Google's token endpoint is the issuer. Check its ID-token claims before use.
 var parts=String(tokens.id_token||'').split('.');if(parts.length!==3)throw new Error('Missing Google identity');var claims=JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[1])).getDataAsString());
 if(claims.aud!==c.clientId||!['https://accounts.google.com','accounts.google.com'].includes(claims.iss)||claims.nonce!==flow.nonce||claims.exp*1000<=Date.now()||claims.email_verified!==true||!/^\d{1,40}$/.test(claims.sub||''))throw new Error('Google identity could not be verified');
 if(flow.expectedSub&&claims.sub!==flow.expectedSub)throw new Error('Choose the same Google account for Gmail authorization');
 var scopes=String(tokens.scope||'').split(' ');if(!scopes.includes('https://www.googleapis.com/auth/drive.file'))throw new Error('Approve personal Drive access');if(flow.gmail&&!scopes.includes('https://www.googleapis.com/auth/gmail.send'))throw new Error('Gmail access was not approved');
 var account=readProp_('account:'+claims.sub)||{id:claims.sub};account.email=claims.email;account.name=claims.name||'';account.picture=claims.picture||'';account.refreshToken=tokens.refresh_token||account.refreshToken;if(!account.refreshToken)throw new Error('Offline Drive access is required');
 account.scopes=scopes;writeProp_('account:'+account.id,account);CacheService.getScriptCache().put('google-token:'+account.id,tokens.access_token,Math.min(3500,Number(tokens.expires_in)||3500));
 var session=randomToken_();writeProp_('session:'+hash_(session),{id:account.id,expires:Date.now()+7*86400000});var handoff=randomToken_();cache.put('handoff:'+hash_(handoff),JSON.stringify({session:session,proofHash:flow.proofHash}),600);
 var appUrl=props_().getProperty('APP_URL');if(!appUrl||!appUrl.startsWith(c.origin+'/')||/[#?]/.test(appUrl))throw new Error('APP_URL is not configured');return appUrl+'#google_handoff='+handoff+'&proof_hash='+flow.proofHash;
})}
function googleFinish_(p){return locked_(function(){
 if(!p||!/^[a-f0-9]{64}$/.test(p.proof||'')||!/^[a-f0-9]{96}$/.test(p.handoff||''))throw new Error('Invalid browser proof');
 var cache=CacheService.getScriptCache(),key='handoff:'+hash_(p.handoff),raw=cache.get(key);if(!raw)throw new Error('Authorization expired');var result=JSON.parse(raw);if(result.proofHash!==hash_(p.proof))throw new Error('Browser proof mismatch');cache.remove(key);return {session:result.session};
})}
function googleSession_(token,guest){
 if(typeof token!=='string'||!/^[a-f0-9]{96}$/.test(token))throw new Error('Sign in again');
 var key='session:'+hash_(token),s=readProp_(key);if(!s||s.expires<Date.now()||(!guest&&s.guest)){if(s&&s.expires<Date.now())props_().deleteProperty(key);throw new Error('Sign in again')}return s;
}
function googleAccess_(account){var cache=CacheService.getScriptCache(),key='google-token:'+account.id,token=cache.get(key);if(token)return token;var c=googleConfig_(),result=googleTokenRequest_({client_id:c.clientId,client_secret:c.clientSecret,refresh_token:account.refreshToken,grant_type:'refresh_token'});cache.put(key,result.access_token,Math.min(3500,Number(result.expires_in)||3500));return result.access_token}
function publicUser_(account){return {id:account.id,email:account.email,is_anonymous:false,user_metadata:{full_name:account.name,avatar_url:account.picture,signway_gmail_send_confirmed_v1:!!personalContext_?.workspace?.settings.gmailSendConfirmed}}}
function setContext_(id){var account=readProp_('account:'+id);if(!account)throw new Error('Account is unavailable');personalContext_={account:account,workspace:null};return account}
function appOwner_(token){var s=googleSession_(token,false);if(!personalContext_||personalContext_.account.id!==s.id)setContext_(s.id);return s.id}
function config_(){return {SHEET_ID:'manifest',ROOT_ID:personalContext_.account.rootId}}
function pdfBytes_(base64){var bytes=workspacePdf_(base64);if(bytes.length>LIMIT_BYTES_)throw new Error('Shared PDF limit is 5MB');return bytes}
function personalBootstrap_(){
 var a=personalContext_.account;if(a.manifestId)return workspaceLoad_();
 var d=personalDrive_();if(!a.rootId){a.rootId=d.createFolder('SignWay').getId();writeProp_('account:'+a.id,a)}
 for(var pair of [['originalsId','Originals'],['signedId','Signed'],['sharedId','Shared'],['dataId','Data']])if(!a[pair[0]]){a[pair[0]]=d.getFolderById(a.rootId).createFolder(pair[1]).getId();writeProp_('account:'+a.id,a)}
 var w={version:2,ownerId:a.id,folderId:a.dataId,tables:{sign_requests:[],signature_groups:[],signature_events:[],event_participants:[]},settings:{language:'he',gmailSendConfirmed:false},files:[],sharedRows:[],revision:0};workspaceSave_(w);return w;
}
function workspaceLoad_(){if(personalContext_.workspace)return personalContext_.workspace;var a=personalContext_.account;if(!a.manifestId)throw new Error('Connect personal Drive first');var w=JSON.parse(personalDrive_().getFileById(a.manifestId).getBlob().getDataAsString());if(w.ownerId!==a.id)throw new Error('Workspace ownership mismatch');personalContext_.workspace=w;return w}
function workspaceSave_(w){
 var a=personalContext_.account;if(w.ownerId!==a.id)throw new Error('Workspace ownership mismatch');w.revision=(w.revision||0)+1;
 var text=JSON.stringify(w),f=personalDrive_().getFolderById(w.folderId).createFile(Utilities.newBlob(text,'application/json','workspace-'+Utilities.getUuid()+'.json'));
 if(hash_(f.getBlob().getDataAsString())!==hash_(text))throw new Error('Drive verification failed');
 // Publish link routing first. An unpublished manifest never exposes data: resolve checks current state.
 for(var r of w.tables.sign_requests)writeProp_('route:'+r.token_hash,{id:a.id});
 for(var p of w.tables.event_participants)writeProp_('route:'+hash_(p.token),{id:a.id});
 var next=Object.assign({},a,{manifestId:f.getId()});writeProp_('account:'+a.id,next);personalContext_.account=next;personalContext_.workspace=w;
}
function routeContext_(token){if(typeof token!=='string'||token.length>200)throw new Error('Invalid signing link');var route=readProp_('route:'+hash_(token));if(!route)throw new Error('Signing link unavailable');setContext_(route.id);return workspaceLoad_()}
function googleDispatch(session,action,p){
 p=p||{};
 if(action==='auth-begin')return googleBegin_(p,session);
 if(action==='auth-finish')return googleFinish_(p);
 if(action==='auth-guest'){var token=randomToken_();writeProp_('session:'+hash_(token),{id:'guest:'+hash_(token),guest:true,expires:Date.now()+6*3600000});return {access_token:token,user:{id:'guest:'+hash_(token),is_anonymous:true}}}
 if(action==='auth-logout'){googleSession_(session,true);props_().deleteProperty('session:'+hash_(session));return true}
 if(action==='workspace-public-resolve'){try{var w=routeContext_(p.token);return {found:!!workspaceResolve_(w,p.token)}}catch(e){return {found:false}}}
 if(action==='workspace-public-call'){var actor=googleSession_(session,true);return locked_(function(){var w=routeContext_(p.token);return workspacePublic_(w,actor.id,p)})}
 if(action.indexOf('shared-public-')===0){routeContext_(p.token);return sharedPublicDispatch(action,p)}
 if(action==='auth-session'){var checked=googleSession_(session,true);if(checked.guest)return {access_token:session,user:{id:checked.id,is_anonymous:true}}}
 var s=googleSession_(session,false);setContext_(s.id);
 if(action==='auth-session')return locked_(function(){personalBootstrap_();return {access_token:session,user:publicUser_(personalContext_.account)}});
 if(action==='auth-gmail-token'){var a=personalContext_.account;if(!a.scopes.includes('https://www.googleapis.com/auth/gmail.send'))throw new Error('CONNECT');return {token:googleAccess_(a)}}
 if(action.indexOf('shared-')===0)return sharedOwnerDispatch(session,action,p);
 return locked_(function(){var w=workspaceLoad_();if(action==='workspace-status')return {active:true,version:2};if(action!=='workspace-owner-call')throw new Error('Unsupported operation');return personalOwner_(w,p)});
}
function personalOwner_(w,p){var result;
 if(p.op==='query')result=workspaceQuery_(w,p);
 else if(p.op==='rpc')result=workspaceRpc_(w,p);
 else if(p.op==='download')return workspaceDownload_(w,p.path);
 else if(p.op==='upload'){var r=w.tables.sign_requests.find(r=>r.original_path===p.path);if(!r||r.status!=='pending')throw new Error('Original upload unavailable');workspacePut_(w,p.path,p.base64);result={path:p.path}}
 else if(p.op==='remove'){if(!Array.isArray(p.paths)||p.paths.length>10)throw new Error('Invalid file list');for(var path of p.paths){if(!w.tables.sign_requests.some(r=>[r.original_path,r.signed_path].includes(path)))throw new Error('File ownership mismatch');w.files=w.files.filter(f=>f.path!==path)}result=p.paths.map(name=>({name:name}))}
 else if(p.op==='settings-get')return w.settings;
 else if(p.op==='settings-set'){var patch=p.settings||{};if(Object.keys(patch).some(k=>!['language','gmailSendConfirmed'].includes(k))||('language'in patch&&!['he','en'].includes(patch.language))||('gmailSendConfirmed'in patch&&typeof patch.gmailSendConfirmed!=='boolean'))throw new Error('Invalid settings');Object.assign(w.settings,patch);result=w.settings}
 else if(p.op==='self-save')result=workspaceSelf_(w,p);
 else throw new Error('Unsupported workspace operation');
 if(!(p.op==='query'&&p.query.operation==='select'))workspaceSave_(w);return result;
}
