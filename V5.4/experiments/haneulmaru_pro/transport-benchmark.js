// Local harness: same real scene, decoder on the SAME PC. Not a phone/hotspot test.
import {createLiveReceiver} from './live-video.js';
import {configureSender,streamProfiles,wait} from './rtc.js';
export async function runBenchmark(bridge,signal,live,status){
 const result={date:new Date().toISOString(),scope:'same-PC loopback; not physical Android/hotspot',gpu:bridge.metrics().gpu,tests:[],completed:false};
 const duration=10000;let cleanup=()=>{};
 const save=()=>signal.api('transport-benchmark',result);
 try{
  bridge.resetSession();bridge.control({seq:0,aspect:16/9});
  const info=await signal.api('info'),key=new URL(info.url).hash.slice(1);
  const phone={api:async path=>path==='live-info'?{url:'ws://127.0.0.1:8814'}:null,
   socket(url,lane,onMessage,onClose){return new Promise((resolve,reject)=>{const ws=new WebSocket(url);ws.binaryType='arraybuffer';let ready=false;
    const timer=setTimeout(()=>{ws.close();reject(Error('bench auth timeout'));},6000);
    ws.onopen=()=>ws.send(JSON.stringify({role:'phone',lane,key}));ws.onmessage=e=>{if(!ready){if(JSON.parse(e.data).type==='authenticated'){ready=true;clearTimeout(timer);resolve(ws);}return;}onMessage(e);};ws.onerror=()=>reject(Error('bench socket'));ws.onclose=()=>{clearTimeout(timer);onClose?.();};});}
  };
  const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;bottom:10px;right:10px;width:240px;height:135px;z-index:1000';document.body.append(canvas);
  for(const quality of ['balanced','sharp','fast']){
   const samples=[],enc=[];const rx=createLiveReceiver(phone,canvas,{status,onState:()=>{},onStats:m=>(m.type==='encoderStats'?enc:samples).push(m)});cleanup=()=>rx.stop();
   document.getElementById('streamQuality').value=quality;document.getElementById('streamQuality').dispatchEvent(new Event('change'));
   status('V5.4 H.264 벤치마크 '+quality);await rx.start();await wait(3000);samples.length=enc.length=0;await wait(duration);
   result.tests.push({mode:'V5.4 H.264 sockets',quality,samples,encoder:enc,meanFps:samples.reduce((s,x)=>s+x.fps,0)/Math.max(1,samples.length),render:bridge.metrics()});rx.stop();await save();await wait(1000);
  }
  live.suspend();canvas.hidden=true;
  // Equivalent to V5.1 captureStream/configureSender, with actual negotiated codec stats.
  for(const quality of ['balanced','sharp']){
   status('V5.1 WebRTC 방식 비교 '+quality);const a=new RTCPeerConnection({iceServers:[]}),b=new RTCPeerConnection({iceServers:[]});
   const media=bridge.canvas.captureStream(30);bridge.setStreamEdge(streamProfiles[quality].edge);
   const video=document.createElement('video');video.muted=true;video.autoplay=true;video.style.cssText=canvas.style.cssText;document.body.append(video);
   cleanup=()=>{a.close();b.close();media.getTracks().forEach(t=>t.stop());video.remove();};
   const qa=[],qb=[];a.onicecandidate=e=>{if(e.candidate){if(b.remoteDescription)b.addIceCandidate(e.candidate).catch(()=>{});else qb.push(e.candidate);}};b.onicecandidate=e=>{if(e.candidate){if(a.remoteDescription)a.addIceCandidate(e.candidate).catch(()=>{});else qa.push(e.candidate);}};
   b.ontrack=e=>{video.srcObject=e.streams[0];video.play().catch(()=>{});};
   const track=media.getVideoTracks()[0];track.contentHint='detail';const sender=a.addTrack(track,media);
   await a.setLocalDescription(await a.createOffer());await b.setRemoteDescription(a.localDescription);for(const c of qb)await b.addIceCandidate(c);
   await b.setLocalDescription(await b.createAnswer());await a.setRemoteDescription(b.localDescription);for(const c of qa)await a.addIceCandidate(c);
   await configureSender(sender,streamProfiles[quality]);await wait(3000);
   const samples=[];let prev=null;for(let i=0;i<11;i++){
    const reports=await b.getStats(),out=await a.getStats();
    for(const s of reports.values())if(s.type==='inbound-rtp'&&s.kind==='video'){
     const tx=[...out.values()].find(x=>x.type==='outbound-rtp'&&x.kind==='video');
     if(prev)samples.push({fps:(s.framesDecoded-prev.frames)*1000/(s.timestamp-prev.at),width:s.frameWidth,height:s.frameHeight,encoder:tx?.encoderImplementation,codec:out.get(tx?.codecId)?.mimeType,encodeMs:tx?.framesEncoded?tx.totalEncodeTime*1000/tx.framesEncoded:0});prev={frames:s.framesDecoded,at:s.timestamp};
    }await wait(1000);
   }
   result.tests.push({mode:'V5.1-equivalent WebRTC',quality,samples,meanFps:samples.reduce((s,x)=>s+x.fps,0)/Math.max(1,samples.length),render:bridge.metrics()});cleanup();await save();
  }
  // Existing V5.2 sender and receiver pacing, with actual HTTP JPEG and image decode.
  status('V5.2 JPEG 호환 방식 비교');bridge.setStreamEdge(1280);const headers={Authorization:'Bearer '+key};const session=crypto.randomUUID();
  await fetch('/stream/signal',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({type:'preview-ready',session})});
  const jpeg=[];let previous='',unique=0;const start=performance.now();
  while(performance.now()-start<duration){const t=performance.now(),r=await fetch('/stream/preview-frame',{headers,cache:'no-store'});if(r.status===200){const blob=await r.blob(),buf=await blob.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buf))).join(',');if(hash!==previous){unique++;previous=hash;}
   const bitmap=await createImageBitmap(blob);jpeg.push({fetchDecodeMs:performance.now()-t,width:bitmap.width,height:bitmap.height,bytes:blob.size});bitmap.close();}await wait(100);}
  result.tests.push({mode:'V5.2 JPEG polling',meanFps:unique*1000/(performance.now()-start),uniqueFrames:unique,samples:jpeg,render:bridge.metrics()});
  canvas.remove();result.completed=true;await save();status('통신 비교 완료 · output/transport-benchmark.json');
 }catch(e){cleanup();result.error=e.message;await save();status('비교 실패: '+e.message);}
}
