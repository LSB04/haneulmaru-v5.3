import {zoomCamera} from './camera-zoom.js';
import {installScenarioControls} from './scenario-controls.js';
import {motionOnly} from './control-policy.js';
import {validateScene} from './scene-settings.js';
import * as T from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {buildWorld,profiles} from './world.js';
import {Scenario,COLORS} from './scenario.js';
import {updateHUD} from './hud.js';
const $=id=>document.getElementById(id),say=s=>$('message').textContent=s;
let renderError='';addEventListener('error',e=>{renderError=e.message;say('화면 오류: '+renderError);});
const sim=new Scenario(),renderer=new T.WebGLRenderer({canvas:$('view'),antialias:true,powerPreference:'high-performance'});
renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.shadowMap.type=T.PCFShadowMap;renderer.shadowMap.autoUpdate=false;
const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info'),gpu=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),software=/swiftshader|software|llvmpipe|basic render/i.test(gpu);
$('gpu').textContent='WebGL: '+gpu;
const scene=new T.Scene();scene.background=new T.Color(0x8cb4c3);scene.fog=new T.FogExp2(0x83adb9,.0005);
const camera=new T.PerspectiveCamera(62,innerWidth/innerHeight,.1,4500),ortho=new T.OrthographicCamera(-700,700,700,-700,.1,4000);ortho.position.set(0,1200,0);ortho.up.set(0,0,-1);ortho.lookAt(0,0,0);
camera.position.set(620,450,660);const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,40,0);controls.enableDamping=true;controls.minDistance=12;controls.maxDistance=1900;controls.maxPolarAngle=Math.PI*.49;
scene.add(new T.HemisphereLight(0xd8efff,0x6a7259,2.2));const sun=new T.DirectionalLight(0xffe6c3,3);sun.position.set(-380,620,240);sun.castShadow=true;sun.shadow.camera.left=sun.shadow.camera.bottom=-650;sun.shadow.camera.right=sun.shadow.camera.top=650;sun.shadow.camera.near=1;sun.shadow.camera.far=1800;sun.shadow.bias=-.0003;sun.shadow.normalBias=1.2;scene.add(sun);
let world,quality='high',view='chase',lookYaw=0,lookPitch=.2,chaseDistance=40,remoteAspect=null,streamEdge=1920,remoteSeq=-1,imuEnabled=false,clockLast=0,hudAt=0,statAt=0,frameSamples=[],latestMetrics={gpu,software},catalog=null,bench=null,benchmarkResult=null,remoteMovement={},remoteUntil=0;
const keys=new Set(),effects=new Map(),pointer=new Map();
function resize(){const aspect=remoteAspect||innerWidth/innerHeight;if(remoteAspect){renderer.setPixelRatio(1);renderer.setSize(aspect>1?streamEdge:Math.round(streamEdge*aspect),aspect>1?Math.round(streamEdge/aspect):streamEdge,false);}else{renderer.setPixelRatio(Math.min(devicePixelRatio,profiles[quality].dpr));renderer.setSize(innerWidth,innerHeight,false);}camera.aspect=aspect;camera.updateProjectionMatrix();ortho.left=-700*aspect;ortho.right=700*aspect;ortho.updateProjectionMatrix();}
function setQuality(value){if(!Object.hasOwn(profiles,value))return;quality=value;const old=world;world=buildWorld(value);scene.add(world.root);if(old){scene.remove(old.root);old.dispose();}renderer.shadowMap.enabled=profiles[value].shadow>0;sun.shadow.mapSize.setScalar(profiles[value].shadow||512);if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}renderer.shadowMap.needsUpdate=true;$('quality').value=value;resize();}
setQuality(software?'low':'high');
function setView(value){if(!['chase','cockpit','overview','map'].includes(value))return;view=value;lookYaw=0;lookPitch=value==='chase'?.2:0;controls.enabled=value==='overview'&&!imuEnabled;if(value==='overview'){camera.position.set(620,450,660);controls.target.set(0,40,0);controls.update();}document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('viewLabel').textContent={chase:'CHASE / 추적 시점',cockpit:'ON BOARD / 드론 탑승',overview:'WORLD / 전체 3D',map:'TOP / 2D 지도'}[view];}
function setMode(mode){sim.setMode(mode);setView(mode==='game'?'overview':'chase');sync();}
function resetView(){lookYaw=0;lookPitch=view==='chase'?.2:0;if(view==='overview')setView('overview');say('선택한 시점의 기준 방향으로 복귀했습니다.');}
function restart(){sim.seed=Number($('seed').value)>>>0;sim.reset();keys.clear();remoteMovement={};remoteUntil=0;clearEffects();setView(sim.mode==='flight'?'chase':'overview');sync();}
function sync(){
 $('flight').classList.toggle('active',sim.mode==='flight');$('game').classList.toggle('active',sim.mode==='game');$('spawn').disabled=sim.mode!=='game'||sim.paused;$('autoArrival').checked=sim.auto;$('pilot').value=sim.pilot;$('pause').textContent=sim.paused?'재생':'일시정지';$('count').value=sim.count;$('countText').textContent=sim.count;
 sceneUI.update(sim.summary());updateHUD(sim.summary(),catalog);
}
$('flight').onclick=()=>setMode('flight');$('game').onclick=()=>setMode('game');
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{setView(b.dataset.view);sync();});
$('selected').onchange=()=>{sim.select($('selected').value);resetView();sync();};$('pilot').onchange=()=>{sim.setPilot($('pilot').value);sync();};
$('count').oninput=()=>{sim.setCount(+$('count').value);sync();};$('quality').onchange=()=>setQuality($('quality').value);
$('pause').onclick=()=>{sim.paused=!sim.paused;keys.clear();remoteMovement={};sync();};$('reset').onclick=resetView;$('restart').onclick=restart;
const sceneUI=installScenarioControls({spawn(color){sim.spawn(color);sync();},zoom:applyZoom});
function applyZoom(factor){chaseDistance=zoomCamera({view,camera,ortho,controls,chaseDistance},factor);}
$('spawn').onclick=()=>{sim.spawn();sync();};$('autoArrival').onchange=()=>sim.auto=$('autoArrival').checked;
$('sun').oninput=()=>{const a=+$('sun').value*Math.PI/180;sun.position.set(-Math.cos(a)*700,Math.sin(a)*800,240);renderer.shadowMap.needsUpdate=true;};
$('hide').onclick=async()=>{document.body.classList.add('immersed');$('show').hidden=false;try{await document.documentElement.requestFullscreen();}catch{}};
$('show').onclick=()=>{document.body.classList.remove('immersed');$('show').hidden=true;if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});};
addEventListener('keydown',e=>{if(e.target.closest('input,select,textarea'))return;const k=e.key.toLowerCase();if(['w','a','s','d','q','e','arrowleft','arrowright',' '].includes(k)){e.preventDefault();keys.add(k);}if(e.repeat)return;if(k==='r')resetView();if(k==='v')setView(view==='cockpit'?'chase':'cockpit');if(k===' '){sim.paused=!sim.paused;sync();}});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));addEventListener('blur',()=>keys.clear());
function look(dx,dy){if(view==='map')return;lookYaw-=dx*Math.PI*2;lookPitch=T.MathUtils.clamp(lookPitch+dy*Math.PI,-1.25,1.25);}
$('view').addEventListener('pointerdown',e=>{if(view==='overview'||view==='map'||imuEnabled)return;$('view').setPointerCapture(e.pointerId);pointer.set(e.pointerId,[e.clientX,e.clientY]);});
$('view').addEventListener('pointermove',e=>{const p=pointer.get(e.pointerId);if(!p)return;look((e.clientX-p[0])/innerWidth,(e.clientY-p[1])/innerHeight);pointer.set(e.pointerId,[e.clientX,e.clientY]);});
for(const name of ['pointerup','pointercancel'])$('view').addEventListener(name,e=>pointer.delete(e.pointerId));
$('view').addEventListener('wheel',e=>{if(view==='overview'&&controls.enabled)return;e.preventDefault();applyZoom(Math.exp(Math.max(-500,Math.min(500,e.deltaY))*.001));},{passive:false});
function moveInput(){const remote=performance.now()<remoteUntil?remoteMovement:{};return {forward:Number(keys.has('w'))-Number(keys.has('s'))+(remote.forward||0),side:Number(keys.has('d'))-Number(keys.has('a'))+(remote.side||0),up:Number(keys.has('e'))-Number(keys.has('q'))+(remote.up||0),turn:Number(keys.has('arrowleft'))-Number(keys.has('arrowright'))+(remote.turn||0)};}
function cameraTick(agent){
 if(view==='overview'){if(controls.enabled)controls.update();return;}
 if(view==='map'||!agent)return;
 const yaw=agent.heading+lookYaw,p=lookPitch;
 if(view==='cockpit'){camera.position.set(agent.x,agent.y+2,agent.z);camera.lookAt(agent.x-Math.sin(yaw)*Math.cos(p)*30,agent.y+2+Math.sin(p)*30,agent.z-Math.cos(yaw)*Math.cos(p)*30);}
 else{const d=chaseDistance;camera.position.set(agent.x+Math.sin(yaw)*d*Math.cos(p),agent.y+8+d*Math.sin(p),agent.z+Math.cos(yaw)*d*Math.cos(p));camera.lookAt(agent.x,agent.y+2,agent.z);}
}
function clearEffects(){for(const g of effects.values()){scene.remove(g);g.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}effects.clear();}
function effectTick(){
 const ids=new Set(sim.effects.map(e=>e.id));
 for(const [id,g]of effects)if(!ids.has(id)){scene.remove(g);g.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});effects.delete(id);}
 for(const e of sim.effects){
  let g=effects.get(e.id);
  if(!g){
   g=new T.Group();
   const from=new T.Vector3(e.from.x,e.from.y,e.from.z),to=new T.Vector3(e.x,e.y,e.z),delta=to.clone().sub(from);
   const beam=new T.Mesh(new T.CylinderGeometry(.65,.65,1,8),new T.MeshBasicMaterial({color:0xc3efff}));
   const glow=new T.Mesh(new T.CylinderGeometry(2.2,2.2,1,8),new T.MeshBasicMaterial({color:0x379aff,transparent:true,opacity:.4,depthWrite:false,blending:T.AdditiveBlending}));
   for(const ray of [beam,glow]){ray.position.copy(from).add(to).multiplyScalar(.5);ray.scale.y=from.distanceTo(to);if(delta.lengthSq()>0)ray.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());}
   const flash=new T.Mesh(new T.SphereGeometry(1,16,10),new T.MeshBasicMaterial({color:0xffbd65,transparent:true,opacity:.5,wireframe:true,depthWrite:false}));
   flash.position.set(e.x,e.y,e.z);g.add(beam,glow,flash);scene.add(g);effects.set(e.id,g);
  }
  const age=sim.time-e.at,[beam,glow,flash]=g.children;
  beam.visible=age<1;glow.visible=age<1;
  flash.visible=age>=1;flash.scale.setScalar(e.radius*(.2+Math.max(0,age-1)));flash.material.opacity=Math.max(0,(2.2-age)/1.2)*.7;
 }
}
function metrics(samples){const sorted=[...samples].sort((a,b)=>a-b),avg=samples.reduce((a,b)=>a+b,0)/Math.max(1,samples.length);return {gpu,software,quality,count:sim.agents().length,mode:sim.mode,width:renderer.domElement.width,height:renderer.domElement.height,frames:samples.length,meanFps:avg?1000/avg:0,p95FrameMs:sorted[Math.floor(sorted.length*.95)]||0};}
$('bench').onclick=()=>{bench={start:performance.now(),samples:[]};say('10초 성능 측정 중 · PC 화면을 유지하세요.');};
$('export').onclick=()=>{if(!benchmarkResult)return say('먼저 성능 측정을 실행하세요.');const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(benchmarkResult,null,2)],{type:'application/json'}));a.href=url;a.download='haneulmaru-v5-benchmark.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
renderer.setAnimationLoop(now=>{
 const ms=clockLast?now-clockLast:0,dt=Math.min(ms/1000,.1);clockLast=now;sim.step(dt*+$('speed').value,moveInput());
 sim.ensureSelection();const agents=sim.agents();
 cameraTick(agents.find(a=>a.id===sim.selected));world.update(sim.time,agents,view==='cockpit'?sim.selected:null);effectTick();renderer.render(scene,view==='map'?ortho:camera);
 for(const capture of [...frameCaptures])capture();
 if(ms>0&&!document.hidden){frameSamples.push(ms);if(bench)bench.samples.push(ms);}
 if(now-hudAt>160){sync();hudAt=now;}
 if(now-statAt>1000){latestMetrics=metrics(frameSamples);$('fps').textContent=latestMetrics.meanFps.toFixed(1)+' FPS';$('stats').textContent=`${renderer.domElement.width} × ${renderer.domElement.height} · ${renderer.info.render.calls} calls · ${renderer.info.render.triangles.toLocaleString()} triangles`;frameSamples=[];statAt=now;}
 if(bench&&now-bench.start>=10000){benchmarkResult=metrics(bench.samples);say(`실측 ${benchmarkResult.meanFps.toFixed(1)} FPS · P95 ${benchmarkResult.p95FrameMs.toFixed(1)} ms`);bench=null;}
});
addEventListener('resize',resize);screen.orientation?.addEventListener('change',resize);addEventListener('visibilitychange',()=>{clockLast=0;keys.clear();remoteMovement={};if(document.hidden)bench=null;});
$('view').addEventListener('webglcontextlost',e=>{e.preventDefault();renderer.setAnimationLoop(null);say('GPU 연결을 확인하고 새로고침하세요.');});
$('modelReport').textContent='모든 객체와 지형은 합성 데이터입니다. 외부 탐지 모델과 연결하지 않습니다.';
const frameCaptures=new Set(); function inRenderedFrame(fn){return new Promise((resolve,reject)=>{const finish=()=>{clearTimeout(timer);frameCaptures.delete(finish);try{resolve(fn());}catch(e){reject(e);}};const timer=setTimeout(()=>{frameCaptures.delete(finish);reject(Error("PC 렌더러 탭이 멈춰 있습니다. 지형 창을 열어두세요."));},2000);frameCaptures.add(finish);});}
export const streamBridge={
 capturePreview(ctx,width,height){return inRenderedFrame(()=>ctx.drawImage(renderer.domElement,0,0,width,height));}, captureVideoFrame(){return inRenderedFrame(()=>new VideoFrame(renderer.domElement,{timestamp:Math.round(performance.now()*1000)}));},
 canvas:renderer.domElement,metrics:()=>({...latestMetrics,...(document.hidden?{meanFps:0,frames:0}:{})}),benchmarkMetrics:()=>benchmarkResult,
 applyScene(s){validateScene(s);if(Number.isInteger(s.count))sim.setCount(s.count);if(Object.hasOwn(profiles,s.quality))setQuality(s.quality);if([.25,1,2].includes(s.speed))$('speed').value=String(s.speed);if(Number.isFinite(s.sun)&&s.sun>=10&&s.sun<=80){$('sun').value=s.sun;$('sun').oninput();}if(typeof s.paused==='boolean')sim.paused=s.paused;if(typeof s.top==='boolean')setView(s.top?'map':'overview');sync();},
 setStreamEdge(edge){if([960,1280,1920,2560].includes(edge)){streamEdge=edge;resize();}},
 setImuEnabled(value){imuEnabled=!!value;controls.enabled=view==='overview'&&!imuEnabled;return true;},resetView,
 imuRotate(yaw,pitch){if(!imuEnabled||![yaw,pitch].every(Number.isFinite))return;if(view==='overview'){const e=new T.Euler().setFromQuaternion(camera.quaternion,'YXZ');e.y+=yaw;e.x=T.MathUtils.clamp(e.x+pitch,-1.4,1.4);camera.quaternion.setFromEuler(e);}else{lookYaw+=yaw;lookPitch=T.MathUtils.clamp(lookPitch+pitch,-1.25,1.25);}},
 state:()=>({renderError,cameraDistance:camera.position.distanceTo(controls.target),cameraZoom:view==='map'?ortho.zoom:camera.fov,gpu,count:sim.count,paused:sim.paused,top:view==='map',quality,imuEnabled,view,scenario:sim.summary()}),
 control(d){
  if(!Number.isSafeInteger(d.seq)||d.seq<=remoteSeq)return;remoteSeq=d.seq;
  if(d.scene){try{this.applyScene(validateScene(d.scene));}catch{return;}}
  if(Number.isFinite(d.aspect)&&d.aspect>=.2&&d.aspect<=5){remoteAspect=d.aspect;resize();}
  if(['flight','game'].includes(d.mission))setMode(d.mission);
  if(['chase','cockpit','overview','map'].includes(d.view))setView(d.view);
  if(typeof d.selected==='string'){remoteMovement={};remoteUntil=0;sim.select(d.selected);}
  if(['auto','manual'].includes(d.pilot)){remoteMovement={};remoteUntil=0;sim.setPilot(d.pilot);}
  if(typeof d.auto==='boolean')sim.auto=d.auto;
  if(typeof d.paused==='boolean'){sim.paused=d.paused;remoteMovement={};}
  if(Number.isInteger(d.count))sim.setCount(d.count);
  if(typeof d.top==='boolean')setView(d.top?'map':'overview');
  if(d.reset===true)resetView();if(d.restart===true)restart();if(d.spawn===true)sim.spawn(typeof d.spawnColor==='string'?d.spawnColor:'unknown');
  if(d.move&&typeof d.move==='object'){remoteMovement=Object.fromEntries(['forward','side','up','turn'].map(k=>[k,Number.isFinite(d.move[k])?T.MathUtils.clamp(d.move[k],-1,1):0]));remoteUntil=performance.now()+350;}
  if(!imuEnabled&&[d.dx,d.dy].every(x=>Number.isFinite(x)&&Math.abs(x)<=2)){
   if(view==='overview'){const sph=new T.Spherical().setFromVector3(camera.position.clone().sub(controls.target));sph.theta-=d.dx*Math.PI*2;sph.phi=T.MathUtils.clamp(sph.phi+d.dy*Math.PI,.05,Math.PI*.49);camera.position.copy(controls.target).add(new T.Vector3().setFromSpherical(sph));camera.lookAt(controls.target);controls.update();}
   else look(d.dx,d.dy);
  }
  applyZoom(d.zoom);
  if(!motionOnly(d))sync();
 },resetSession(){remoteSeq=-1;remoteMovement={};remoteUntil=0;}
};
setView('chase');sync();
if(location.pathname==='/host')Promise.all([import('./imu-input.js'),import('./host-stream.js')]).then(()=>{
 const target=$('connectionPanels');for(const el of [document.querySelector('.imu-panel'),$('streamStatus')?.closest('section'),$('clikaPanel')])if(el)target.append(el);
}).catch(e=>say('연결 패널: '+e.message));
