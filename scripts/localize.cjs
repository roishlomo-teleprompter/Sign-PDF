const acorn=require('acorn'),crypto=require('node:crypto');
const id=text=>crypto.createHash('sha256').update(text).digest('hex').slice(0,24);
function compiler(){
 const entries=new Map();
 function add(text){if(typeof text!=='string'||!text.trim())return null;const key=id(text);entries.set(key,text);return key}
 function javascript(source){
  const tree=acorn.parse(source,{ecmaVersion:'latest',sourceType:'script',allowAwaitOutsideFunction:true}),edits=[];
  function visit(node){
   if(!node||typeof node!=='object')return;
   if(node.type==='CallExpression'&&node.callee.type==='Identifier'&&node.callee.name==='tr'&&node.arguments.length===2){
    const values=[];
    function template(n){if(n.type==='Literal'&&typeof n.value==='string')return n.value;if(n.type==='BinaryExpression'&&n.operator==='+')return template(n.left)+template(n.right);if(n.type==='TemplateLiteral'){let out='';n.quasis.forEach((q,i)=>{out+=q.value.cooked;if(n.expressions[i])out+=template(n.expressions[i])});return out}const i=values.push(source.slice(n.start,n.end))-1;return '{p'+i+'}'}
    const key=add(template(node.arguments[1]));if(key)edits.push({start:node.end-1,text:','+JSON.stringify(key)+',['+values.join(',')+']'});
   }
   for(const v of Object.values(node))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);
  }visit(tree);for(const e of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,e.start)+e.text+source.slice(e.start);return source;
 }
 function html(source){const {JSDOM}=require('jsdom');const dom=new JSDOM(source);for(const el of dom.window.document.querySelectorAll('[data-en]'))add(el.dataset.en);dom.window.close();return source.replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/g,(_,a,code,b)=>a+javascript(code)+b)}
 function catalog(){const strings=Object.fromEntries([...entries].sort(([a],[b])=>a.localeCompare(b)));return {version:crypto.createHash('sha256').update(JSON.stringify(strings)).digest('hex'),strings}}
 return {javascript,html,catalog};
}
module.exports={compiler,id};
