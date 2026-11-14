/* Only versioned application UI literals are translated. User text never goes to this service. */
window.SignWayI18n=(()=>{
 const languages=[['he','עברית','rtl'],['en','English'],['es','Español'],['pt-BR','Português (Brasil)'],['fr','Français'],['de','Deutsch'],['ar','العربية','rtl'],['hi','हिन्दी'],['id','Bahasa Indonesia'],['ja','日本語'],['ko','한국어'],['zh-CN','简体中文'],['ru','Русский']];
 // Short signing labels need context that machine translation may not infer.
 const terms={es:{Sign:'Firmar'},'pt-BR':{Sign:'Assinar'},fr:{Sign:'Signer'},de:{Sign:'Unterschreiben'},ar:{Sign:'توقيع','Upload document':'رفع مستند'},hi:{Sign:'हस्ताक्षर'},id:{Sign:'Tanda tangan'},ja:{Sign:'署名'},ko:{Sign:'서명'},'zh-CN':{Sign:'签名'},ru:{Sign:'Подписать'}};
 let catalog,locale='en',dictionary={},transport,loading,generation=0;
 const supported=lang=>languages.some(x=>x[0]===lang);
 function detect(lang){if(supported(lang))return lang;const base=String(lang||'').split('-')[0];return base==='pt'?'pt-BR':base==='zh'?'zh-CN':supported(base)?base:'en'}
 function translate(he,en,key,values=[]){if(locale==='he')return he;if(terms[locale]?.[en])return terms[locale][en];if(locale==='en'||!key||!dictionary[key])return en;return dictionary[key].replace(/\{p(\d+)\}/g,(_,i)=>String(values[Number(i)]??''))}
 async function prepare(lang){lang=detect(lang);if(lang==='he'||lang==='en'){generation++;locale=lang;dictionary={};return}if(loading?.lang===lang)return loading.promise;const attempt=++generation;
  const promise=(async()=>{catalog ||= await fetch('./locales/source.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Translation catalog unavailable');return r.json()});const key='signway-ui:v1:'+lang;let saved;try{saved=JSON.parse(localStorage.getItem(key)||'null')}catch{}if(saved&&Object.keys(catalog.strings).every(k=>typeof saved[k]==='string')){if(attempt===generation){locale=lang;dictionary=saved}return}
   const result=saved||{};transport ||= window.SharedDrive.create();const keys=Object.keys(catalog.strings);for(let offset=0;offset<keys.length;offset+=20){if(keys.slice(offset,offset+20).every(k=>typeof result[k]==='string'))continue;let batch;for(let retry=0;retry<2;retry++){try{batch=await transport.call('i18n-catalog',{language:lang,version:catalog.version,offset});break}catch(error){if(retry||!String(error.message).includes('version changed'))throw error}}if(!batch||batch.version!==catalog.version)throw Error('Translation version changed');Object.assign(result,batch.strings);try{localStorage.setItem(key,JSON.stringify(result))}catch{}}if(keys.some(k=>typeof result[k]!=='string'))throw Error('Translation is incomplete');try{localStorage.setItem(key,JSON.stringify(result))}catch{}if(attempt===generation){locale=lang;dictionary=result;}
  })();loading={lang,promise};try{await promise}finally{if(loading?.promise===promise)loading=null}
 }
 function staticText(en){if(terms[locale]?.[en])return terms[locale][en];if(locale==='he'||locale==='en'||!catalog)return en;for(const [key,text]of Object.entries(catalog.strings))if(text===en)return dictionary[key]||en;return en}
 return {languages,supported,detect,prepare,translate,staticText,direction:lang=>languages.find(x=>x[0]===lang)?.[2]||'ltr'};
})();
