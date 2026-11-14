/* Public UI catalog only: clients cannot supply content, URLs, documents or user text. */
function translationCatalog_(p){
 var allowed=['es','pt-BR','fr','de','ar','hi','id','ja','ko','zh-CN','ru'];
 if(allowed.indexOf(p.language)<0||!/^[a-f0-9]{64}$/.test(p.version)||!Number.isInteger(p.offset)||p.offset<0||p.offset>2000)throw new Error('Invalid translation request');
 var cache=CacheService.getScriptCache(),raw=cache.get('ui-source');
 if(!raw){var response=UrlFetchApp.fetch('https://roishlomo-teleprompter.github.io/Sign-PDF/locales/source.json',{muteHttpExceptions:true});if(response.getResponseCode()!==200)throw new Error('Translation source unavailable');raw=response.getContentText();if(raw.length>95000)throw new Error('Translation source too large');cache.put('ui-source',raw,300)}
 var source=JSON.parse(raw);if(source.version!==p.version){cache.remove('ui-source');throw new Error('Translation version changed. Refresh the application.')}
 var keys=Object.keys(source.strings).slice(p.offset,p.offset+20),strings={};
 for(var key of keys){var text=source.strings[key];if(typeof text!=='string'||text.length>4000)throw new Error('Invalid catalog');var ck='ui:'+p.language+':'+key,translated=cache.get(ck);if(!translated){translated=LanguageApp.translate(text,'en',p.language==='pt-BR'?'pt':p.language);var placeholders=text.match(/\{p\d+\}/g)||[],actual=translated.match(/\{p\d+\}/g)||[];if(placeholders.sort().join('|')!==actual.sort().join('|'))throw new Error('Translation placeholder mismatch');cache.put(ck,translated,21600)}strings[key]=translated}
 return {version:source.version,strings:strings};
}
