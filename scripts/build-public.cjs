/* Publish only the Google-only application. Historical migration/backend sources
 * stay in Git, but must never be served as alternate production applications. */
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const PUBLIC_FILES=[
 'index.html','google-drive.html','oauth-callback.html','privacy.html','terms.html','manifest.webmanifest','sw.js',
 'i18n.js','document-preview.js','google-drive-config.js','google-drive-client.js','google-workspace.js',
 'google-account.js','google-migration.js','gmail-mail.js','upload-hold.js','pdf-transfer.js','document-scanner.js','events.js',
 'signature-studio.js','signature-studio.css','fonts/gveret-levin.ttf','fonts/caveat.ttf','fonts/allura.ttf','fonts/allura-OFL.txt','fonts/lobster.ttf','fonts/lobster-OFL.txt','fonts/aref-ruqaa.ttf','fonts/aref-ruqaa-OFL.txt','fonts/gveret-levin-OFL.txt','fonts/caveat-OFL.txt',
 'shared-signatures.js','signature-fields.js','design-ui.js','design.css','events.css',
 'icons/signway-logo.png','icons/icon-192.png','icons/icon-512.png',
 'icons/icon-maskable-512.png','icons/apple-touch-icon.png','icons/favicon-32.png',
 'vendor/pdf.min.js','vendor/pdf.worker.min.js','vendor/pdf-lib.min.js'
];
const RETIRED_PAGES=['drive-preview.html','drive-migration.html'];
function build(destination=path.join(ROOT,'dist')){
 destination=path.resolve(destination);
 if(destination===ROOT||ROOT.startsWith(destination+path.sep))throw Error('Refusing to overwrite source tree');
 fs.mkdirSync(destination,{recursive:true});
 if(fs.readdirSync(destination).length)throw Error('Build destination must be empty');
 const compiler=require('./localize.cjs').compiler();
 for(const file of PUBLIC_FILES){
  const source=path.join(ROOT,file);
  if(/\.(?:html|js|css|webmanifest)$/.test(file)&&/supabase/i.test(fs.readFileSync(source,'utf8')))throw Error('Previous provider found in public file: '+file);
  const target=path.join(destination,file);fs.mkdirSync(path.dirname(target),{recursive:true});if(file.endsWith('.html')&&!['privacy.html','terms.html'].includes(file))fs.writeFileSync(target,compiler.html(fs.readFileSync(source,'utf8')));else if(file.endsWith('.js')&&!file.startsWith('vendor/')&&!['sw.js','i18n.js'].includes(file))fs.writeFileSync(target,compiler.javascript(fs.readFileSync(source,'utf8')));else fs.copyFileSync(source,target);
 }
 fs.mkdirSync(path.join(destination,'locales'),{recursive:true});fs.writeFileSync(path.join(destination,'locales/source.json'),JSON.stringify(compiler.catalog()));
 const redirect='<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Sign Away</title></head><body><p>המשך לגרסת Sign Away המעודכנת.</p><a href="./">פתיחת Sign Away</a><script>const target=new URL("./",location.href);target.search=location.search;target.hash=location.hash;location.replace(target.href);</script></body></html>';
 for(const file of RETIRED_PAGES)fs.writeFileSync(path.join(destination,file),redirect);
 // Every source change gets a new service-worker cache, including future UI strings.
 const crypto=require('node:crypto'),digest=crypto.createHash('sha256');
 for(const file of [...PUBLIC_FILES,'locales/source.json'].sort())digest.update(file).update(fs.readFileSync(path.join(destination,file)));
 const revision=digest.digest('hex').slice(0,20);
 const version=url=>{const file=url.replace(/^\.\//,'').split('?')[0];return file!=='sw.js'&&PUBLIC_FILES.includes(file)&&/\.(js|css)$/.test(file)?url.split('?')[0]+'?v='+revision:url};
 for(const file of ['index.html','google-drive.html','oauth-callback.html']){const target=path.join(destination,file);fs.writeFileSync(target,fs.readFileSync(target,'utf8').replace(/\b(src|href)="([^"\s]+)"/g,(_,attribute,url)=>attribute+'="'+version(url)+'"'))}
 const catalogUrl='./locales/source.json?v='+revision;
 const client=path.join(destination,'i18n.js');fs.writeFileSync(client,fs.readFileSync(client,'utf8').replace("'./locales/source.json'",JSON.stringify(catalogUrl)));
 const worker=path.join(destination,'sw.js');let workerCode=fs.readFileSync(worker,'utf8').replace(/const CACHE_VERSION='[^']+'/,'const CACHE_VERSION='+JSON.stringify('sign-pdf-shell-'+revision+'-google'));
 workerCode=workerCode.replace(/'([^'\s]+\.(?:js|css)(?:\?[^']*)?)'/g,(_,url)=>JSON.stringify(version(url))).replace("'./locales/source.json'",JSON.stringify(catalogUrl));fs.writeFileSync(worker,workerCode);
 fs.writeFileSync(path.join(destination,'.nojekyll'),'');
 return destination;
}
if(require.main===module)console.log('Public Google-only app: '+build(process.argv[2]));
module.exports={build,PUBLIC_FILES,RETIRED_PAGES};
