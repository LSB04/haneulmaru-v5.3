// H.264 Annex B, realtime WebCodecs, persistent local sockets. No JPEG polling.
import {motionOnly} from './control-policy.js';
export function packet(chunk, epoch){
 const out=new Uint8Array(13+chunk.byteLength),d=new DataView(out.buffer);
 out[0]=chunk.type==='key'?1:0;d.setUint32(1,epoch);d.setFloat64(5,chunk.timestamp);chunk.copyTo(out.subarray(13));return out;
}
export function unpack(buffer){const d=new DataView(buffer);if(d.byteLength<14)throw Error('짧은 영상 패킷');return {epoch:d.getUint32(1),type:d.getUint8(0)?'key':'delta',timestamp:d.getFloat64(5),data:new Uint8Array(buffer,13)};}
export function dimensions(canvas,edge=1920){const scale=Math.min(1,edge/Math.max(canvas.width,canvas.height));return {width:Math.max(2,Math.floor(canvas.width*scale/2)*2),height:Math.max(2,Math.floor(canvas.height*scale/2)*2)};}
export function send(socket,value){if(socket?.readyState===1&&socket.bufferedAmount<65536)socket.send(JSON.stringify(value));}
export async function openLane(signal,lane,onMessage,onClose=()=>{}){
 const config=await signal.api('live-info');return signal.socket(config.url,lane,onMessage,onClose);
}
export function installLiveSender(bridge,signal,{status,onControl,onReady,state,profile,onStats=()=>{}}){
 let control=null,video=null,encoder=null,config=null,active=false,busy=false,disposed=false,epoch=0,forceKey=true,lastKey=0,lastFrame=0;
 let count=0,bytes=0,dropped=0,encodeTotal=0,submitted=new Map(),statsAt=performance.now(),lastStats=null;
 const report=()=>send(control,{type:'state',...state()});
 async function connect(){try{
  control=await openLane(signal,'control',e=>{const m=JSON.parse(e.data);if(m.type==='video-ready'||m.type==='ready'){active=true;forceKey=true;onReady();if(config)send(control,{type:'config',epoch,config:{codec:config.codec,codedWidth:config.width,codedHeight:config.height}});report();}
   if(m.type==='keyframe')forceKey=true;if(m.type==='video-stop')active=false;
   if(m.type==='control'){onControl(m);if(!motionOnly(m))report();}if(m.type==='receiverStats')status(`H.264 송신 · 폰 ${m.fps.toFixed(1)} FPS · 조작 왕복 ${m.rtt}ms`);
  },e=>{active=false;if(e?.reason==="replaced"){disposed=true;video?.close();status("다른 V5.4 지형 창이 연결되었습니다.");return;}if(!disposed)setTimeout(connect,1500);});
  video?.close();video=await openLane(signal,'video',()=>{},()=>{active=false;});
 }catch(e){status('실시간 연결: '+e.message);if(!disposed)setTimeout(connect,2000);}}
 async function configure(p,size){
  if(!globalThis.VideoEncoder)throw Error('PC 브라우저에 WebCodecs가 없습니다. WebRTC를 선택하세요.');
  const base={codec:'avc1.42002a',...size,bitrate:p.bitrate,framerate:p.fps,latencyMode:'realtime',avc:{format:'annexb'}};
  let chosen=null;
  for(const preference of ['prefer-hardware','prefer-software']){const candidate={...base,hardwareAcceleration:preference};if((await VideoEncoder.isConfigSupported(candidate)).supported){chosen=candidate;break;}}
  if(!chosen)throw Error('H.264 인코더 미지원 · WebRTC를 선택하세요.');
  encoder?.close();submitted.clear();epoch++;config=chosen;forceKey=true;
  encoder=new VideoEncoder({output(chunk){const now=performance.now(),start=submitted.get(chunk.timestamp);submitted.delete(chunk.timestamp);if(start!=null)encodeTotal+=now-start;
   if(video?.readyState!==1||video.bufferedAmount>256*1024){dropped++;forceKey=true;return;}
   video.send(packet(chunk,epoch));count++;bytes+=chunk.byteLength;
  },error(e){active=false;status('H.264 오류: '+e.message+' · WebRTC 연결을 사용하세요.');}});
  encoder.configure(chosen);send(control,{type:'config',epoch,config:{codec:chosen.codec,codedWidth:size.width,codedHeight:size.height}});
 }
 async function tick(){if(disposed||!active||busy||document.hidden||video?.readyState!==1)return;
  const p=profile();
  if(video.bufferedAmount>256*1024||encoder?.encodeQueueSize>1){dropped++;return;}
  busy=true;try{const size=dimensions(bridge.canvas,p.edge);
   if(!config||config.width!==size.width||config.height!==size.height||config.bitrate!==p.bitrate||config.framerate!==p.fps)await configure(p,size);
   const frame=await bridge.captureVideoFrame();
   if(!active||disposed||encoder.state!=='configured'){frame.close();return;}
   const stamp=frame.timestamp,now=stamp/1000,interval=1000/p.fps;
   if(now+1<lastFrame){frame.close();return;}
   lastFrame=Math.max(lastFrame+interval,now);
   const key=forceKey||performance.now()-lastKey>1000;forceKey=false;if(key)lastKey=performance.now();submitted.set(stamp,performance.now());
   try{encoder.encode(frame,{keyFrame:key});}finally{frame.close();}
  }catch(e){active=false;status(e.message);}finally{busy=false;}}
 const timer=setInterval(tick,4),stateTimer=setInterval(()=>{if(!disposed)report();},250),statsTimer=setInterval(()=>{
  const now=performance.now(),seconds=(now-statsAt)/1000;
  lastStats={type:'encoderStats',fps:count/seconds,mbps:bytes*8/seconds/1e6,encodeMs:count?encodeTotal/count:0,dropped,width:config?.width||0,height:config?.height||0,hardwarePreference:config?.hardwareAcceleration||'unavailable',queue:encoder?.encodeQueueSize||0};
  send(control,lastStats);if(active)onStats(lastStats);count=bytes=dropped=encodeTotal=0;statsAt=now;
 },1000);connect();
 return {stats:()=>lastStats,suspend(){active=false;},stop(){disposed=true;active=false;clearInterval(timer);clearInterval(stateTimer);clearInterval(statsTimer);control?.close();video?.close();encoder?.close();}};
}
export function createLiveReceiver(signal,canvas,{status,onState,onStats}){
 let control=null,video=null,decoder=null,epoch=-1,needsKey=true,running=false,generation=0,frames=0,total=0,dropped=0,rtt=0,statsTimer=null,last=0,config=null;
 const ctx=canvas.getContext('2d',{alpha:false});
 function keyframe(){needsKey=true;send(control,{type:'keyframe'});}
 function configure(message){epoch=message.epoch;config=message.config;decoder?.close();
  decoder=new VideoDecoder({output(frame){try{if(!running)return;canvas.width=frame.displayWidth;canvas.height=frame.displayHeight;ctx.drawImage(frame,0,0);frames++;total++;canvas.hidden=false;}finally{frame.close();}},error(e){status('디코더 재동기화: '+e.message);decoder=null;keyframe();}});
  decoder.configure({...config,optimizeForLatency:true});keyframe();
 }
 async function start(){stop();if(!globalThis.VideoDecoder)throw Error('이 Android WebView는 WebCodecs 미지원입니다. WebRTC를 선택하세요.');running=true;const gen=generation;
  control=await openLane(signal,'control',event=>{if(gen!==generation)return;const d=JSON.parse(event.data);
   if(d.type==='state')onState(d);if(d.type==='config')configure(d);if(d.type==='encoderStats')onStats?.(d);
   if(d.type==='pong')rtt=Math.round(performance.now()-d.at);
  },()=>{if(running)status('실시간 연결 끊김 · PC 연결 시작을 다시 누르세요.');});
  if(gen!==generation){control.close();return;}
  video=await openLane(signal,'video',event=>{if(gen!==generation)return;try{const m=unpack(event.data);
   if(m.epoch!==epoch||!config){keyframe();return;}
   if(!decoder)configure({epoch,config});
   if(decoder.decodeQueueSize>2){dropped++;decoder.reset();decoder.configure({...config,optimizeForLatency:true});keyframe();return;}
   if(needsKey&&m.type!=='key'){dropped++;return;}needsKey=false;
   decoder.decode(new EncodedVideoChunk(m));
  }catch(e){keyframe();status('영상 재동기화 중 · '+e.message);}},()=>{if(running)status('영상 소켓 끊김 · 다시 연결하세요.');});
  if(gen!==generation){video.close();return;}send(control,{type:'ready'});last=performance.now();
  statsTimer=setInterval(()=>{const now=performance.now(),fps=frames*1000/(now-last);last=now;frames=0;send(control,{type:'ping',at:now});send(control,{type:'receiverStats',fps,rtt,dropped});onStats?.({type:'receiverStats',fps,rtt,dropped,total,width:canvas.width,height:canvas.height});status(total?'V5.4 로컬 H.264 영상 수신 중':'H.264 연결됨 · 첫 영상 대기');},1000);
 }
 function stop(){running=false;generation++;clearInterval(statsTimer);control?.close();video?.close();decoder?.close();control=video=decoder=null;epoch=-1;needsKey=true;total=0;frames=0;canvas.hidden=true;}
 return {start,stop,send(data){send(control,data);},get connected(){return running&&control?.readyState===1;}};
}
