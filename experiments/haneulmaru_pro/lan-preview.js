// Authenticated, bounded JPEG frames over the existing LAN HTTPS connection.
// No WAN service or additional port. Only the newest frame is retained.
export function previewSize(width,height,edge=1280){const scale=Math.min(1,edge/Math.max(width,height,1));return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};}
export function installPreviewSender(bridge,signal,status){
 const canvas=bridge.canvas;
 const copy=document.createElement('canvas'),ctx=copy.getContext('2d');let busy=false,active=false,closed=false,lastDemand=0;
 const timer=setInterval(async()=>{
  if(busy||closed)return;busy=true;
  try{
   if(performance.now()-lastDemand>1000){active=(await signal.api('preview-demand')).active;lastDemand=performance.now();}
   if(!active||closed)return;
   if(document.hidden){status('로컬 호환 연결 · PC 지형 창을 맨 앞으로 띄우세요.');return;}
   const size=previewSize(canvas.width,canvas.height);if(copy.width!==size.width||copy.height!==size.height){copy.width=size.width;copy.height=size.height;}
   await bridge.capturePreview(ctx,copy.width,copy.height);
   const blob=await new Promise(resolve=>copy.toBlob(resolve,'image/jpeg',.8));
   if(blob&&blob.size<=1048576&&!closed){await signal.raw('preview-frame',blob);status('로컬 호환 영상 송신 · HTTPS / 최대 10 FPS');}
  }catch(e){if(active)status('로컬 호환 송신 실패: '+e.message);}finally{busy=false;}
 },100);
 return ()=>{closed=true;clearInterval(timer);};
}
export function createPreviewReceiver(signal,image,status,metric){
 let generation=0,url='';
 function stop(){generation++;image.hidden=true;image.removeAttribute('src');if(url)URL.revokeObjectURL(url);url='';}
 async function start(){stop();const current=generation;image.hidden=false;let frames=0,since=performance.now();status('로컬 호환 연결 · PC 영상 요청 중');
  while(current===generation){
   try{
    const response=await signal.raw('preview-frame');if(current!==generation)break;
    if(response.status===204){status('로컬 호환 연결 · PC 프레임 대기 · PC 지형 창을 확인하세요.');}
    else{const blob=await response.blob();if(current!==generation)break;const next=URL.createObjectURL(blob);image.src=next;if(url)URL.revokeObjectURL(url);url=next;frames++;status('V5.3 로컬 호환 영상 수신 중');const now=performance.now();if(now-since>=1000){metric(`HTTPS 영상 ${(frames*1000/(now-since)).toFixed(1)} FPS · 최대 1280px · 로컬망`);frames=0;since=now;}}
   }catch(e){if(current===generation)status('로컬 영상 오류: '+e.message);}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
 }
 return {start,stop};
}
