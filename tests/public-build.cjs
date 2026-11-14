const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {build,PUBLIC_FILES,RETIRED_PAGES}=require('../scripts/build-public.cjs');
test('published artifact contains the complete Google app and no historical provider/backend',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'signway-public-'));
 try{
  build(root);
  for(const file of PUBLIC_FILES)assert(fs.existsSync(path.join(root,file)),file);
  for(const file of ['vendor/supabase.js','account-auth.js','drive-workspace.js','shared-drive.js','drive-migration.js','supabase','apps-script-prototype','google-drive-backend','.git','tests'])assert(!fs.existsSync(path.join(root,file)),file);
  const shell=vm.runInNewContext(fs.readFileSync(path.join(root,'sw.js'),'utf8').match(/const APP_SHELL=(\[[^;]+\]);/)[1]);
  const cached=new Set(shell.map(ref=>new URL(ref,'https://example.com/Sign-PDF/').href));
  for(const entry of ['index.html','google-drive.html']){
   const html=fs.readFileSync(path.join(root,entry),'utf8');
   for(const match of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)){if(/^https?:/.test(match[1]))continue;assert.match(match[1],/\?v=[a-f0-9]{20}$/);assert(cached.has(new URL(match[1],'https://example.com/Sign-PDF/').href),'Current assets must bypass older worker caches and match the new shell')}
   for(const match of html.matchAll(/(?:src|href)="([^"#?]+)(?:\?[^"#]*)?"/g)){
    const ref=match[1];if(/^[a-z]+:/i.test(ref)||ref.startsWith('#'))continue;
    assert(fs.existsSync(path.resolve(root,ref)),entry+' -> '+ref);
   }
  }
  assert.match(fs.readFileSync(path.join(root,'index.html'),'utf8'),/google-site-verification/);
  assert(fs.existsSync(path.join(root,'privacy.html')));assert(fs.existsSync(path.join(root,'terms.html')));
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('retired app URLs preserve existing link queries and fragments while leaving the old provider',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'signway-redirect-'));
 try{build(root);for(const name of RETIRED_PAGES){const html=fs.readFileSync(path.join(root,name),'utf8');assert(!/supabase|<script src=/i.test(html));let target;vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{URL,location:{href:'https://example.com/Sign-PDF/'+name+'?sign=personal',search:'?sign=personal',hash:'#private-fragment',replace:url=>target=url}});assert.equal(target,'https://example.com/Sign-PDF/?sign=personal#private-fragment')}}finally{fs.rmSync(root,{recursive:true,force:true})}
});
