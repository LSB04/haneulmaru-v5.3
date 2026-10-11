// Touch gestures control the virtual camera; no USB/IMU connection is required.
// A scheduled flush combines rotation and multiplicative zoom at at most 30 Hz.
export function installPhoneGestures(element,control,options={}){
 const win=options.windowTarget??globalThis,doc=options.documentTarget??globalThis.document;
 const schedule=options.schedule??((fn,ms)=>setTimeout(fn,ms)),cancel=options.cancel??(id=>clearTimeout(id));
 const viewport=options.viewport??(()=>({width:element.clientWidth||win.innerWidth,height:element.clientHeight||win.innerHeight}));
 const hz=Number.isFinite(options.maxHz)?Math.max(1,Math.min(30,options.maxHz)):30,interval=1000/hz;
 const points=new Map(),listeners=[];let timer=null,dx=0,dy=0,zoomLog=0,pinch=0,afterPinch=false,destroyed=false;
 const epsilon=1e-10,maxZoomLog=Math.log(4),previousTouchAction=element.style?.touchAction;
 if(element.style)element.style.touchAction='none';
 const hasPending=()=>Math.abs(dx)>epsilon||Math.abs(dy)>epsilon||Math.abs(zoomLog)>epsilon;
 function queue(){if(!destroyed&&timer===null&&hasPending())timer=schedule(flush,interval);}
 function flush(){
  timer=null;if(destroyed||!hasPending())return;
  const data={};
  if(Math.abs(dx)>epsilon||Math.abs(dy)>epsilon){
   data.dx=Math.max(-1,Math.min(1,dx));data.dy=Math.max(-1,Math.min(1,dy));dx-=data.dx;dy-=data.dy;
  }
  if(Math.abs(zoomLog)>epsilon){
   const step=Math.max(-maxZoomLog,Math.min(maxZoomLog,zoomLog));
   data.zoom=Math.exp(step);zoomLog-=step;
  }
  // Very long gestures are split across future flushes, never into a burst.
  // Each factor remains strictly inside the host's accepted (0.2, 5) range.
  control(data);queue();
 }
 function distance(){const [a,b]=points.values();return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;}
 function releaseCapture(id){try{if(element.hasPointerCapture?.(id))element.releasePointerCapture(id);}catch{}}
 function stop(){
  if(timer!==null){cancel(timer);timer=null;}dx=dy=zoomLog=pinch=0;afterPinch=false;
  const ids=[...points.keys()];points.clear();for(const id of ids)releaseCapture(id);
 }
 function down(event){
  if(destroyed||points.has(event.pointerId)||points.size>=2||event.button>0||![event.clientX,event.clientY].every(Number.isFinite))return;
  event.preventDefault();points.set(event.pointerId,{x:event.clientX,y:event.clientY});
  try{element.setPointerCapture?.(event.pointerId);}catch{}
  if(points.size===2){pinch=distance();afterPinch=true;}else{pinch=0;afterPinch=false;}
 }
 function move(event){
  const old=points.get(event.pointerId);if(!old||![event.clientX,event.clientY].every(Number.isFinite))return;
  event.preventDefault();points.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(points.size===2){
   const next=distance();if(pinch>=1&&next>=1)zoomLog+=Math.log(pinch/next);pinch=next;
  }else if(!afterPinch){
   const size=viewport();if(size.width>0&&size.height>0&&Number.isFinite(size.width)&&Number.isFinite(size.height)){
    dx+=(event.clientX-old.x)/size.width;dy+=(event.clientY-old.y)/size.height;
   }
  }
  queue();
 }
 function up(event){
  if(!points.has(event.pointerId))return;event.preventDefault();
  const wasPinch=points.size===2;points.delete(event.pointerId);pinch=0;
  if(wasPinch)afterPinch=true;if(!points.size)afterPinch=false;releaseCapture(event.pointerId);
 }
 function abort(event){if(points.has(event.pointerId)){event.preventDefault();stop();}}
 function hidden(){if(doc?.hidden)stop();}
 function listen(target,name,handler,opts){if(!target?.addEventListener)return;target.addEventListener(name,handler,opts);listeners.push(()=>target.removeEventListener(name,handler,opts));}
 const nonPassive={passive:false};
 listen(element,'pointerdown',down,nonPassive);listen(element,'pointermove',move,nonPassive);
 listen(element,'pointerup',up,nonPassive);listen(element,'pointercancel',abort,nonPassive);listen(element,'lostpointercapture',abort,nonPassive);
 listen(win,'blur',stop);listen(win,'pagehide',stop);listen(win,'haneulmaru-app-hidden',stop);listen(doc,'visibilitychange',hidden);
 return {stop,destroy(){if(destroyed)return;destroyed=true;stop();for(const remove of listeners)remove();if(element.style)element.style.touchAction=previousTouchAction??'';}};
}
