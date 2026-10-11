export const wait=ms=>new Promise(r=>setTimeout(r,ms));
export function signaling(role,status){
 let key=location.hash.slice(1)||sessionStorage.getItem('v5-stream-'+role)||(role==='phone'?localStorage.getItem('v5-stream-phone'):'')||'';if(key){sessionStorage.setItem('v5-stream-'+role,key);if(role==='phone')localStorage.setItem('v5-stream-phone',key);}history.replaceState(null,'',location.pathname+location.search);
 let cursor=0,alive=true,bootstrap=null,hostReady=false;
 const localHost=role==='host'&&location.hostname==='127.0.0.1';
 async function recover(){if(!bootstrap)bootstrap=(async()=>{const r=await fetch('/stream/host-session',{cache:'no-store',signal:AbortSignal.timeout(6000)});if(!r.ok)throw Error('PC 세션 복구 실패: '+r.status);const d=await r.json();if(typeof d.key!=='string'||!d.key)throw Error('PC 세션 응답 오류');if(key!==d.key)cursor=0;key=d.key;sessionStorage.setItem('v5-stream-host',key);hostReady=true;})().finally(()=>{bootstrap=null;});return bootstrap;}
 async function api(path,body,timeout=6000){if(localHost&&!hostReady)await recover();for(let attempt=0;attempt<2;attempt++){const r=await fetch('/stream/'+path,{method:body?'POST':'GET',headers:{'Authorization':'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(timeout)});if(r.status===401&&localHost&&attempt===0){hostReady=false;await recover();continue;}if(!r.ok){const d=await r.json().catch(()=>({}));throw Error(r.status===401?'접속 코드가 만료됐습니다. 휴대폰은 PC의 새 QR로 접속하세요.':d.error||'연결 오류 '+r.status);}return r.status===204?null:r.json();}}
 async function raw(path,body){if(localHost&&!hostReady)await recover();for(let attempt=0;attempt<2;attempt++){const r=await fetch('/stream/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,...(body?{'Content-Type':'image/jpeg'}:{})},body,cache:'no-store',signal:AbortSignal.timeout(5000)});if(r.status===401&&localHost&&attempt===0){hostReady=false;await recover();continue;}if(!r.ok)throw Error(r.status===401?'연결키 만료 · 새 QR로 연결하세요.':'로컬 영상 HTTP '+r.status);return r;}}
async function socket(url,lane,onMessage,onClose){
  if(localHost&&!hostReady)await recover();
  return new Promise((resolve,reject)=>{const ws=new WebSocket(url);ws.binaryType='arraybuffer';let authed=false;
   const timer=setTimeout(()=>{ws.close();reject(Error('영상 소켓 연결 시간 초과 · 로컬 방화벽 8813 확인'));},6000);
   ws.onopen=()=>ws.send(JSON.stringify({role,lane,key}));
   ws.onmessage=e=>{if(!authed){try{if(JSON.parse(e.data).type==='authenticated'){authed=true;clearTimeout(timer);resolve(ws);}}catch{}return;}onMessage(e);};
   ws.onerror=()=>{clearTimeout(timer);reject(Error('영상 소켓 연결 실패 · V5.4 앱 / 방화벽 확인'));};
   ws.onclose=e=>{clearTimeout(timer);if(!authed)reject(Error('영상 소켓 인증 실패'));onClose?.(e);};
  });
 }
 return {api,raw,socket,send:message=>api('signal',message),stop:()=>alive=false,async poll(onMessage){while(alive){try{const data=await api('signal?after='+cursor);for(const item of data){cursor=item.id;await onMessage(item.message);}}catch(e){status(e.message);}await wait(300);}}};
}
export function peer(status,onMessage){const pc=new RTCPeerConnection({iceServers:[]});pc.onconnectionstatechange=()=>status('WebRTC '+pc.connectionState+(pc.connectionState==='failed'?' · 같은 노트북 핫스팟 연결을 확인하세요.':''));pc.ondatachannel=e=>{pc.channel=e.channel;e.channel.onmessage=ev=>{try{onMessage(JSON.parse(ev.data));}catch{}};};return pc;}
export function sendData(pc,data){if(pc?.channel?.readyState==='open'&&pc.channel.bufferedAmount<65536)pc.channel.send(JSON.stringify(data));}

export function connectionRoute(reports){
 let pair=null;
 for(const s of reports.values())if(s.type==='transport'&&s.selectedCandidatePairId)pair=reports.get(s.selectedCandidatePairId);
 if(!pair)for(const s of reports.values())if(s.type==='candidate-pair'&&s.state==='succeeded'&&s.nominated)pair=s;
 if(!pair)return {route:'경로 확인 중',networkRttMs:null};
 const local=reports.get(pair.localCandidateId),remote=reports.get(pair.remoteCandidateId);
 return {route:local?.candidateType==='host'&&remote?.candidateType==='host'?`직접 연결 · ${local.protocol||'UDP'}`:`${local?.candidateType||'?'} ↔ ${remote?.candidateType||'?'}`,
  networkRttMs:Number.isFinite(pair.currentRoundTripTime)?Math.round(pair.currentRoundTripTime*1000):null};
}


export const streamProfiles={
 fast:{edge:1920,fps:60,bitrate:18000000,label:'실시간 · 1920 / 60 FPS / 최대 18 Mbps'},
 smooth:{edge:960,fps:30,bitrate:6000000,label:'부드럽게 · 960 / 최대 6 Mbps'},
 balanced:{edge:1280,fps:24,bitrate:10000000,label:'균형 · 1280 / 최대 10 Mbps'},
 sharp:{edge:1920,fps:30,bitrate:18000000,label:'선명 · 1920 / 30 FPS / 최대 18 Mbps'},
 ultra:{edge:2560,fps:20,bitrate:28000000,label:'최고 선명 · 2560 / 최대 28 Mbps'}
};
export async function configureSender(sender,profile){
 const p=sender.getParameters();if(!p.encodings?.length)throw Error('인코더 협상 대기');
 p.degradationPreference='maintain-resolution';
 for(const e of p.encodings){e.maxBitrate=profile.bitrate;e.maxFramerate=profile.fps;e.scaleResolutionDownBy=1;}
 await sender.setParameters(p);return sender.getParameters();
}
export function streamDelta(s,old){
 const dt=old?(s.timestamp-old.timestamp)/1000:0;
 const frames=old?s.framesEncoded-old.framesEncoded:0;
 return {mbps:dt>0?(s.bytesSent-old.bytesSent)*8/dt/1e6:0,
 fps:dt>0?frames/dt:0,encodeMs:frames>0?(s.totalEncodeTime-old.totalEncodeTime)*1000/frames:0,
 width:s.frameWidth||0,height:s.frameHeight||0,reason:s.qualityLimitationReason||'unknown',encoder:s.encoderImplementation||'미제공'};
}
