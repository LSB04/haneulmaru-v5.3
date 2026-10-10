import {installScenarioControls} from './scenario-controls.js';
import {createLiveReceiver} from './live-video.js';
import {installMovementPad} from './manual-controls.js';
import {createPreviewReceiver} from './lan-preview.js';
import {installAI} from './clika-panel.js';
import {signaling,peer,sendData,connectionRoute} from './rtc.js';import {updateHUD} from './hud.js';
const $=id=>document.getElementById(id),video=$('remote');let pc=null,id='',pending=[],seq=0,state=null,catalog=null,statsLast=null,rtt=0,streamKey='fast',hostHidden=false;
const status=s=>$('status').textContent=s,signal=signaling('phone',status),points=new Map();let pinch=0;
const fastOption=document.createElement('option');fastOption.value='fast';fastOption.textContent='실시간 1920 / 60 FPS';$('streamQuality').prepend(fastOption);$('streamQuality').value='fast';
let liveMode=false;
let fallback=false,fallbackTimer=null;
const previewImage=document.createElement('img');previewImage.hidden=true;previewImage.alt='PC 로컬 영상';previewImage.style.cssText='position:fixed;inset:0;width:100%;height:100%;object-fit:contain;background:#020e13;pointer-events:none';video.after(previewImage);
const preview=createPreviewReceiver(signal,previewImage,status,text=>$('metric').textContent=text);
const compat=document.createElement('button');compat.id='compat';compat.textContent='로컬 호환 연결';$('start').after(compat);compat.onclick=()=>startPreview().catch(e=>status(e.message));
const liveCanvas=document.createElement('canvas');liveCanvas.hidden=true;liveCanvas.style.cssText=previewImage.style.cssText;previewImage.after(liveCanvas);
const live=createLiveReceiver(signal,liveCanvas,{status,onState:data,onStats(m){if(m.type==='receiverStats')$('metric').textContent=`H.264 영상 ${m.fps.toFixed(1)} FPS · 조작 왕복 ${m.rtt}ms · ${m.width}×${m.height} · 드롭 ${m.dropped}`;else $('transport').textContent=`H.264 ${m.mbps.toFixed(1)} Mbps · 인코딩 대기 포함 ${m.encodeMs.toFixed(1)}ms · ${m.hardwarePreference==='prefer-hardware'?'HW 우선 요청 (실사용 별도 확인)':'SW 인코더'}`;}});
const rtcButton=document.createElement('button');rtcButton.textContent='WebRTC 연결';$('start').after(rtcButton);rtcButton.onclick=()=>start().catch(e=>status(e.message));
async function startLive(){clearTimeout(fallbackTimer);fallback=false;preview.stop();pc?.close();pc=null;video.srcObject=null;pad.stop();liveMode=true;await live.start();control({aspect:innerWidth/innerHeight,streamKey});status('H.264 영상 연결 · PC 지형 탭을 열어두세요.');}
function control(data){if(liveMode){live.send({type:'control',...data,seq:++seq});return;}if(fallback){signal.send({type:'preview-control',session:id,control:{...data,seq:++seq}}).catch(e=>status(e.message));return;}if(pc?.channel?.readyState!=='open'){status('PC 연결 시작으로 먼저 연결하세요.');return;}sendData(pc,{type:'control',...data,seq:++seq});}
const pad=installMovementPad($('movePad'),control);
const sceneUI=installScenarioControls({spawn:color=>control({spawn:true,spawnColor:color}),zoom:factor=>control({zoom:factor})});
function padState(){const manual=state?.pilot==='manual';$('movePad').hidden=!manual;document.body.classList.toggle('manual-flight',manual);pad.setEnabled(manual&&!state.paused&&(live.connected||fallback||pc?.channel?.readyState==='open'));$('moveHint').textContent=state?.paused?'일시정지 · 재생 후 이동':'왼쪽 이동 · 오른쪽 높이 / 센서는 시선';}
function data(d){
 if(d.type==='pong'){rtt=Math.round(performance.now()-d.at);return;}if(d.type!=='state'||!d.scenario)return;
 state=d.scenario;sceneUI.update(state);hostHidden=d.hostHidden===true;updateHUD(state,catalog);
 $('flight').classList.toggle('active',state.mode==='flight');$('game').classList.toggle('active',state.mode==='game');document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===d.view));
 $('pilot').value=state.pilot;padState();$('spawn').disabled=state.mode!=='game'||state.paused;$('pause').textContent=state.paused?'재생':'일시정지';$('autoArrival').checked=state.auto;$('count').value=d.count;$('countText').textContent=d.count;$('gpu').textContent='PC GPU: '+d.gpu;
 if(d.streamKey){streamKey=d.streamKey;$('streamQuality').value=streamKey;}
 if(d.transport)$('transport').textContent=`송신 ${d.transport.mbps.toFixed(1)} Mbps · 인코딩 ${d.transport.encodeMs.toFixed(1)}ms`;
}
async function startPreview(){liveMode=false;live.stop();clearTimeout(fallbackTimer);pad.stop();pad.setEnabled(false);fallback=true;pc?.close();pc=null;video.srcObject=null;id=crypto.randomUUID();await signal.send({type:'preview-ready',session:id});control({aspect:innerWidth/innerHeight});$('transport').textContent='로컬 HTTPS 호환 전송 · 최대 1280px / 10 FPS';preview.start();}
async function start(){liveMode=false;live.stop();clearTimeout(fallbackTimer);fallback=false;preview.stop();pad.stop();pad.setEnabled(false);pc?.close();pending=[];id=crypto.randomUUID();pc=peer(status,data);const current=pc,thisId=id;statsLast=null;
 pc.onicecandidate=e=>{if(e.candidate)signal.send({type:'ice',session:thisId,candidate:e.candidate.toJSON()}).catch(e=>status(e.message));};
 pc.ontrack=e=>{if(pc!==current)return;video.srcObject=e.streams[0]||new MediaStream([e.track]);video.play().catch(()=>status('영상 재생을 위해 PC 연결 시작을 눌러주세요.'));};
 pc.ondatachannel=e=>{pc.channel=e.channel;e.channel.onclose=()=>pad.setEnabled(false);e.channel.onmessage=ev=>{try{data(JSON.parse(ev.data));}catch{}};e.channel.onopen=()=>{control({aspect:innerWidth/innerHeight,streamKey});status('연결됨 · 첫 영상 대기');};};
 await signal.send({type:'ready',session:id});status('PC 렌더러 연결 대기 · 12초 후 로컬 호환 연결');fallbackTimer=setTimeout(()=>{if(id===thisId&&(!video.videoWidth||video.readyState<2))startPreview().catch(e=>status(e.message));},12000);}
$('start').onclick=()=>startLive().catch(e=>status(e.message));signal.poll(async m=>{if(m.session!==id)return;if(m.type==='preview-state'&&fallback){data(m.state);return;}if(!pc||fallback)return;if(m.type==='offer'){status('PC 응답 수신 · 영상 경로 연결 중');await pc.setRemoteDescription(m.sdp);for(const c of pending)await pc.addIceCandidate(c);pending=[];await pc.setLocalDescription(await pc.createAnswer());await signal.send({type:'answer',session:id,sdp:pc.localDescription});}if(m.type==='ice'){if(pc.remoteDescription)await pc.addIceCandidate(m.candidate);else pending.push(m.candidate);}});
$('flight').onclick=()=>control({mission:'flight'});$('game').onclick=()=>control({mission:'game'});document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>control({view:b.dataset.view}));
$('selected').onchange=()=>{pad.stop();control({selected:$('selected').value});};$('pilot').onchange=()=>{pad.stop();control({pilot:$('pilot').value,...($('pilot').value==='manual'?{paused:false,view:'cockpit'}:{})});};$('spawn').onclick=()=>control({spawn:true});$('pause').onclick=()=>control({paused:!state?.paused});$('reset').onclick=()=>control({reset:true});$('restart').onclick=()=>control({restart:true});$('autoArrival').onchange=()=>control({auto:$('autoArrival').checked});$('count').oninput=()=>control({count:+$('count').value});$('streamQuality').onchange=()=>control({streamKey:$('streamQuality').value});
const touch=$('touch');touch.onpointerdown=e=>{touch.setPointerCapture(e.pointerId);points.set(e.pointerId,[e.clientX,e.clientY]);pinch=0;};touch.onpointermove=e=>{const old=points.get(e.pointerId);if(!old)return;points.set(e.pointerId,[e.clientX,e.clientY]);if(points.size===1)control({dx:(e.clientX-old[0])/innerWidth,dy:(e.clientY-old[1])/innerHeight});else{const [a,b]=[...points.values()],next=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pinch>0)control({zoom:pinch/next});pinch=next;}};touch.onpointerup=touch.onpointercancel=e=>{points.delete(e.pointerId);pinch=0;};
function resize(){if(live.connected||fallback||pc?.channel?.readyState==='open')control({aspect:innerWidth/innerHeight});}addEventListener('resize',resize);screen.orientation?.addEventListener('change',resize);
$('moveStop').onclick=()=>{pad.stop();control({pilot:'auto'});};
$('menu').onclick=async()=>{const clean=document.body.classList.toggle('clean');$('menu').textContent=clean?'메뉴 열기':'몰입 화면';if(clean){try{await document.documentElement.requestFullscreen();}catch{}}else if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});};
setInterval(async()=>{if(pc?.connectionState!=='connected')return;sendData(pc,{type:'ping',at:performance.now()});try{const reports=await pc.getStats(),route=connectionRoute(reports);for(const s of reports.values())if(s.type==='inbound-rtp'&&s.kind==='video'){const fps=statsLast?(s.framesDecoded-statsLast.frames)*1000/(s.timestamp-statsLast.at):0;statsLast={frames:s.framesDecoded,at:s.timestamp};$('metric').textContent=`영상 ${fps.toFixed(1)} FPS · 조작 왕복 ${rtt}ms · ${s.frameWidth||0}×${s.frameHeight||0} · ${route.route}`;sendData(pc,{type:'receiverStats',fps,rtt,lost:s.packetsLost||0,jitterMs:Math.round((s.jitter||0)*1000)});status(hostHidden?'PC 지형 탭을 맨 앞으로 띄우세요.':s.framesDecoded>0?'V5.3 로컬 영상 수신 중':'첫 영상 프레임 대기');}}catch{}},1000);
fetch('game-info.json').then(r=>r.json()).then(d=>catalog=d).catch(()=>{});
addEventListener('pagehide',()=>{live.stop();clearTimeout(fallbackTimer);preview.stop();pad.destroy();pc?.close();signal.stop();});

installAI({applyScene(s){if(!live.connected&&!fallback&&pc?.channel?.readyState!=="open")throw Error("PC 연결 시작으로 먼저 연결하세요.");control({scene:s});}},signal,()=>null,document.getElementById("phoneControls"));
