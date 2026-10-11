import * as T from './vendor/three.module.min.js';

// Local camera only: never attach this stream to an RTCPeerConnection or upload it.
export function cameraSession({getStream,play,attach,changed}){
 let epoch=0,stream=null,active=false;
 const stopTracks=s=>s?.getTracks().forEach(t=>t.stop());
 function stop(){epoch++;active=false;stopTracks(stream);stream=null;attach(null);changed(false);}
 async function start(){
  stop();const token=epoch;let acquired=null;
  try{
   acquired=await getStream();if(token!==epoch){stopTracks(acquired);return;}
   stream=acquired;attach(stream);await play();
   if(token!==epoch){stopTracks(acquired);return;}
   active=true;for(const track of stream.getTracks())track.onended=stop;changed(true);
  }catch(e){if(token!==epoch){stopTracks(acquired);return;}stop();throw e;}
 }
 return {start,stop,get active(){return active;}};
}

export const keyFragment=`uniform sampler2D image; varying vec2 uvv;
void main(){vec4 c=texture2D(image,uvv);float key=min(c.r,c.b)-c.g;
float a=1.-smoothstep(.28,.58,key);gl_FragColor=vec4(c.rgb,a);}`;

export function installCameraAR({camera,overlay,button,hint,source,control,connected}){
 let renderer=null,material=null,texture=null,current=null,raf=0,last=0,pending=false,disposed=false;
 let scene,view,host=null;
 function prepare(){
  if(renderer)return;
  renderer=new T.WebGLRenderer({canvas:overlay,alpha:true,antialias:false,powerPreference:'low-power'});
  renderer.setClearColor(0,0);renderer.setPixelRatio(1);
  scene=new T.Scene();view=new T.OrthographicCamera(-1,1,1,-1,0,2);view.position.z=1;
  material=new T.ShaderMaterial({transparent:true,depthTest:false,uniforms:{image:{value:null}},vertexShader:'varying vec2 uvv;void main(){uvv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:keyFragment});
  scene.add(new T.Mesh(new T.PlaneGeometry(2,2),material));
 }
 function describe(){
  if(!session.active)return;
  const name={chase:'추적',cockpit:'탑승',overview:'전체 3D',map:'2D 지도'}[host?.view]||'시점';
  hint.textContent=`카메라 AR · ${host?.scenario?.selected||'드론 선택'} · ${name} / 터치·NU40로 시선 조작 · 실공간 위치 고정 아님`;
 }
 const session=cameraSession({
  getStream:()=>navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30}}}),
  attach:s=>{camera.srcObject=s;},play:()=>camera.play(),
  changed:on=>{
   camera.hidden=overlay.hidden=!on;document.body.classList.toggle('camera-ar',on);
   button.textContent=on?'가상환경으로 전환':'카메라 AR 켜기';
   if(connected())control({ar:on});
   if(on){describe();raf=requestAnimationFrame(draw);}else{cancelAnimationFrame(raf);renderer?.clear();hint.textContent='가상환경 · AR은 선택 드론 시점을 카메라 위에 합성합니다.';}
  }
 });
 function draw(now){
  if(!session.active||disposed)return;raf=requestAnimationFrame(draw);
  if(now-last<1000/30)return;last=now;
  const input=source(),w=input?.videoWidth||input?.naturalWidth||input?.width,h=input?.videoHeight||input?.naturalHeight||input?.height;
  if(!input||input.hidden||!w||!h||(input.tagName==='VIDEO'&&input.readyState<2)||(input.tagName==='IMG'&&!input.complete)){renderer.clear();return;}
  if(current!==input){texture?.dispose();texture=input.tagName==='VIDEO'?new T.VideoTexture(input):new T.Texture(input);texture.minFilter=texture.magFilter=T.LinearFilter;texture.generateMipmaps=false;material.uniforms.image.value=texture;current=input;}
  texture.needsUpdate=true;
  const vw=innerWidth,vh=innerHeight,scale=Math.min(1,1280/Math.max(vw,vh)),rw=Math.round(vw*scale),rh=Math.round(vh*scale);
  if(overlay.width!==rw||overlay.height!==rh)renderer.setSize(rw,rh,false);
  renderer.setViewport(0,0,rw,rh);renderer.clear();
  // Match the ordinary stream's contain fit; never stretch the drone view.
  const fit=Math.min(rw/w,rh/h),fw=Math.round(w*fit),fh=Math.round(h*fit);
  renderer.setViewport((rw-fw)/2,(rh-fh)/2,fw,fh);renderer.render(scene,view);
 }
 button.onclick=async()=>{
  if(session.active||pending){session.stop();pending=false;return;}
  if(!connected()){hint.textContent='먼저 PC 연결 시작을 누르세요.';return;}
  if(!navigator.mediaDevices?.getUserMedia){hint.textContent='카메라 AR은 HTTPS와 새 V5.4 AR 앱이 필요합니다.';return;}
  pending=true;
  try{prepare();await session.start();}catch(e){hint.textContent='카메라 시작 실패 · V5.4 AR 앱 설치 및 카메라 권한을 확인하세요. ('+e.name+')';}finally{pending=false;}
 };
 function hide(){if(document.hidden)session.stop();}
 const stop=()=>session.stop();
 document.addEventListener('visibilitychange',hide);addEventListener('haneulmaru-app-hidden',stop);
 return {
  hostState(d){host=d;if(session.active&&d.ar!==true&&connected())control({ar:true});describe();},
  destroy(){disposed=true;session.stop();document.removeEventListener('visibilitychange',hide);removeEventListener('haneulmaru-app-hidden',stop);texture?.dispose();scene?.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});renderer?.dispose();},
  get active(){return session.active;}
 };
}
