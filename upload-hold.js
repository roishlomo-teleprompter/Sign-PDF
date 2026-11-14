window.UploadHold={mount({element,ready,disabled=()=>false,cancel,duration=3000}){
 let timer=null,pointer=null,start=null,key=null,blockClick=false;
 const stop=()=>{if(timer!==null)clearTimeout(timer);timer=null;pointer=null;start=null;key=null;element.classList.remove('hold-cancelling')};
 const begin=()=>{if(timer!==null||!ready()||disabled())return;element.classList.add('hold-cancelling');timer=setTimeout(()=>{const valid=ready()&&!disabled();stop();if(valid)cancel()},duration)};
 const down=event=>{if(!ready())return;blockClick=true;event.preventDefault();if(event.button!==0||event.isPrimary===false||disabled())return;pointer=event.pointerId;start={x:event.clientX,y:event.clientY};element.setPointerCapture?.(pointer);begin()};
 const move=event=>{if(start&&event.pointerId===pointer&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>14)stop()};
 const up=event=>{if(event.pointerId===pointer)stop()};
 const click=event=>{if(ready()||blockClick)event.preventDefault();blockClick=false};
 const keydown=event=>{if(!ready()||!['Enter',' '].includes(event.key))return;event.preventDefault();if(event.repeat||key)return;key=event.key;begin()};
 const keyup=event=>{if(event.key===key){event.preventDefault();stop()}};
 const context=event=>{if(ready())event.preventDefault()};
 const hidden=()=>{if(document.hidden)stop()};
 const listeners={pointerdown:down,pointermove:move,pointerup:up,pointercancel:stop,lostpointercapture:stop,click,keydown,keyup,contextmenu:context,blur:stop};
 for(const [type,handler]of Object.entries(listeners))element.addEventListener(type,handler);
 document.addEventListener('visibilitychange',hidden);window.addEventListener('blur',stop);
 return {reset:stop,dispose(){stop();for(const [type,handler]of Object.entries(listeners))element.removeEventListener(type,handler);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('blur',stop)}};
}};
