// H.264 Annex B, realtime WebCodecs, persistent local sockets. No JPEG polling.
import {motionOnly} from './control-policy.js';
function closeCodec(codec){if(codec && codec.state!=='closed')codec.close();}
export function packet(chunk, epoch){
 const out=new Uint8Array(13+chunk.byteLength),d=new DataView(out.buffer);
 out[0]=chunk.type==='key'?1:0;d.setUint32(1,epoch);d.setFloat64(5,chunk.timestamp);chunk.copyTo(out.subarray(13));return out;
}
export function unpack(buffer){const d=new DataView(buffer);if(d.byteLength<14)throw Error('짧은 영상 패킷');return {epoch:d.getUint32(1),type:d.getUint8(0)?'key':'delta',timestamp:d.getFloat64(5),data:new Uint8Array(buffer,13)};}
export function dimensions(canvas,edge=1920){const scale=Math.min(1,edge/Math.max(canvas.width,canvas.height));return {width:Math.max(2,Math.floor(canvas.width*scale/2)*2),height:Math.max(2,Math.floor(canvas.height*scale/2)*2)};}
export function send(socket,value){if(socket?.readyState!==1||socket.bufferedAmount>=65536)return false;try{socket.send(JSON.stringify(value));return true;}catch{return false;}}
export async function openLane(signal,lane,onMessage,onClose=()=>{}){
 const config=await signal.api('live-info');return signal.socket(config.url,lane,onMessage,onClose);
}
export function installLiveSender(bridge,signal,{status,onControl,onReady,state,profile,onStats=()=>{}}){
 let control=null,video=null,encoder=null,config=null,active=false,busy=false,disposed=false,epoch=0,forceKey=true,lastKey=0,lastFrame=0;
 let count=0,bytes=0,dropped=0,encodeTotal=0,submitted=new Map(),statsAt=performance.now(),lastStats=null;
 let connection=0,reconnectTimer=null,retryAt=0;
 const report=()=>send(control,{type:'state',...state()});
 const announce=()=>{if(config)send(control,{type:'config',epoch,config:{codec:config.codec,codedWidth:config.width,codedHeight:config.height}});};
 function reconnect(gen,event){if(gen!==connection||disposed)return;active=false;connection++;control?.close();video?.close();
  if(event?.reason==='replaced'){disposed=true;status('다른 V5.4 지형 창이 연결되었습니다.');return;}
  clearTimeout(reconnectTimer);status('영상 연결 복구 중');reconnectTimer=setTimeout(connect,1500);
 }
 async function connect(){const gen=++connection;try{
  const nextControl=await openLane(signal,'control',e=>{if(gen!==connection)return;const m=JSON.parse(e.data);if(m.type==='video-ready'||m.type==='ready'){active=true;forceKey=true;onReady();announce();report();}
   if(m.type==='keyframe'){forceKey=true;announce();}if(m.type==='video-stop')active=false;
   if(m.type==='control'){onControl(m);if(!motionOnly(m))report();}if(m.type==='receiverStats')status(`H.264 송신 · 폰 ${m.fps.toFixed(1)} FPS · 조작 왕복 ${m.rtt}ms`);
  },e=>reconnect(gen,e));
  if(gen!==connection||disposed){nextControl.close();return;}control=nextControl;
  const nextVideo=await openLane(signal,'video',()=>{},e=>reconnect(gen,e));
  if(gen!==connection||disposed){nextVideo.close();return;}video=nextVideo;
 }catch(e){if(gen===connection){status('실시간 연결: '+e.message);reconnect(gen);}}}
 async function configure(p,size){
  if(!globalThis.VideoEncoder)throw Error('PC 브라우저에 WebCodecs가 없습니다. WebRTC를 선택하세요.');
  const base={codec:'avc1.42002a',...size,bitrate:p.bitrate,framerate:p.fps,latencyMode:'realtime',avc:{format:'annexb'}};
  let chosen=null;
  for(const preference of ['prefer-hardware','prefer-software']){const candidate={...base,hardwareAcceleration:preference};if((await VideoEncoder.isConfigSupported(candidate)).supported){chosen=candidate;break;}}
  if(!chosen)throw Error('H.264 인코더 미지원 · WebRTC를 선택하세요.');
  closeCodec(encoder);submitted.clear();epoch++;config=chosen;forceKey=true;
  encoder=new VideoEncoder({output(chunk){const now=performance.now(),start=submitted.get(chunk.timestamp);submitted.delete(chunk.timestamp);if(start!=null)encodeTotal+=now-start;
   if(video?.readyState!==1||video.bufferedAmount>256*1024){dropped++;forceKey=true;return;}
   video.send(packet(chunk,epoch));count++;bytes+=chunk.byteLength;
  },error(e){config=null;retryAt=performance.now()+1000;forceKey=true;status('H.264 인코더 복구 중: '+e.message);}});
  encoder.configure(chosen);send(control,{type:'config',epoch,config:{codec:chosen.codec,codedWidth:size.width,codedHeight:size.height}});
 }
 async function tick(){if(disposed||!active||busy||document.hidden||video?.readyState!==1||performance.now()<retryAt)return;
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
  }catch(e){retryAt=performance.now()+1000;forceKey=true;status('프레임 재시도 중: '+e.message);}finally{busy=false;}}
 const timer=setInterval(tick,4),stateTimer=setInterval(()=>{if(!disposed)report();},250),statsTimer=setInterval(()=>{
  const now=performance.now(),seconds=(now-statsAt)/1000;
  lastStats={type:'encoderStats',fps:count/seconds,mbps:bytes*8/seconds/1e6,encodeMs:count?encodeTotal/count:0,dropped,width:config?.width||0,height:config?.height||0,hardwarePreference:config?.hardwareAcceleration||'unavailable',queue:encoder?.encodeQueueSize||0};
  send(control,lastStats);if(active)onStats(lastStats);count=bytes=dropped=encodeTotal=0;statsAt=now;
 },1000);connect();
 return {stats:()=>lastStats,suspend(){active=false;},stop(){disposed=true;active=false;connection++;clearTimeout(reconnectTimer);clearInterval(timer);clearInterval(stateTimer);clearInterval(statsTimer);control?.close();video?.close();closeCodec(encoder);}};
}
export function createLiveReceiver(signal,canvas,{status,onState,onStats}){
 let control=null,video=null,decoder=null,epoch=-1,needsKey=true,running=false,generation=0,frames=0,total=0,dropped=0,rtt=0,statsTimer=null,last=0,config=null;
 let reconnectTimer=null,lastOutput=0,lastRecovery=0,lastKeyRequest=-Infinity,hostHidden=false,recoveries=0;
 const ctx=canvas.getContext('2d',{alpha:false});
 function keyframe(){needsKey=true;if(performance.now()-lastKeyRequest<500)return;lastKeyRequest=performance.now();send(control,{type:'keyframe'});}
 function configure(message){
  if(decoder?.state==='configured'&&epoch===message.epoch&&JSON.stringify(config)===JSON.stringify(message.config))return;
  epoch=message.epoch;config=message.config;closeCodec(decoder);const gen=generation;
  decoder=new VideoDecoder({output(frame){try{if(!running||gen!==generation)return;if(canvas.width!==frame.displayWidth)canvas.width=frame.displayWidth;if(canvas.height!==frame.displayHeight)canvas.height=frame.displayHeight;ctx.drawImage(frame,0,0);frames++;total++;lastOutput=performance.now();canvas.hidden=false;}finally{frame.close();}},error(e){if(gen!==generation)return;status('디코더 재동기화: '+e.message);decoder=null;keyframe();}});
  decoder.configure({...config,optimizeForLatency:true});needsKey=true;
 }
 function reconnect(gen,event){if(!running||gen!==generation)return;generation++;clearInterval(statsTimer);control?.close();video?.close();closeCodec(decoder);control=video=decoder=null;epoch=-1;config=null;needsKey=true;
  if(event?.reason==='replaced'){running=false;status('다른 휴대폰 연결로 전환되었습니다.');return;}
  recoveries++;status('영상 자동 재연결 중');clearTimeout(reconnectTimer);const next=generation;reconnectTimer=setTimeout(()=>{if(running&&next===generation)connect().catch(()=>reconnect(next));},1000);
 }
 async function connect(){const gen=generation;
  const nextControl=await openLane(signal,'control',event=>{if(gen!==generation)return;const d=JSON.parse(event.data);
   if(d.type==='state'){hostHidden=d.hostHidden===true;onState(d);}if(d.type==='config')configure(d);if(d.type==='encoderStats')onStats?.(d);
   if(d.type==='pong')rtt=Math.round(performance.now()-d.at);
  },e=>reconnect(gen,e));
  if(gen!==generation||!running){nextControl.close();return;}control=nextControl;
  const nextVideo=await openLane(signal,'video',event=>{if(gen!==generation)return;try{const m=unpack(event.data);
   if(m.epoch!==epoch||!config){keyframe();return;}
   if(!decoder)configure({epoch,config});
   if(decoder.decodeQueueSize>2){dropped++;decoder.reset();decoder.configure({...config,optimizeForLatency:true});needsKey=true;if(m.type!=='key'){keyframe();return;}}
   if(needsKey&&m.type!=='key'){dropped++;return;}needsKey=false;
   decoder.decode(new EncodedVideoChunk(m));
  }catch(e){closeCodec(decoder);decoder=null;keyframe();status('영상 재동기화 중 · '+e.message);}},e=>reconnect(gen,e));
  if(gen!==generation||!running){nextVideo.close();return;}video=nextVideo;send(control,{type:'ready'});last=lastOutput=lastRecovery=performance.now();frames=0;
  statsTimer=setInterval(()=>{if(gen!==generation)return;if(control?.readyState!==1||video?.readyState!==1){reconnect(gen);return;}const now=performance.now(),fps=frames*1000/(now-last);last=now;frames=0;send(control,{type:'ping',at:now});send(control,{type:'receiverStats',fps,rtt,dropped});onStats?.({type:'receiverStats',fps,rtt,dropped,total,recoveries,width:canvas.width,height:canvas.height});
   if(hostHidden){status('PC 지형 창이 숨겨져 있습니다. 지형 창을 화면에 띄우세요.');return;}
   if(now-lastOutput>=8000){reconnect(gen);return;}
   if(now-lastOutput>=2500&&now-lastRecovery>=2000){lastRecovery=now;closeCodec(decoder);decoder=null;keyframe();status('멈춘 영상 재동기화 중');return;}
   status(fps>0?'V5.4 로컬 H.264 영상 수신 중':total?'영상 갱신 대기 · 자동 복구 중':'H.264 연결됨 · 첫 영상 대기');},1000);
 }
 async function start(){stop();if(!globalThis.VideoDecoder)throw Error('이 Android WebView는 WebCodecs 미지원입니다. WebRTC를 선택하세요.');running=true;try{await connect();}catch(e){stop();throw e;}}
 function stop(){running=false;generation++;clearTimeout(reconnectTimer);clearInterval(statsTimer);control?.close();video?.close();closeCodec(decoder);control=video=decoder=null;epoch=-1;config=null;needsKey=true;total=0;frames=0;hostHidden=false;lastKeyRequest=-Infinity;canvas.hidden=true;}
 return {start,stop,send(data){return running&&send(control,data);},get connected(){return running&&control?.readyState===1;}};
}
