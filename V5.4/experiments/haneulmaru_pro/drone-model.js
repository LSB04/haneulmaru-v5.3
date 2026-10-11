import * as T from './vendor/three.module.min.js';
import {mergeGeometry,primitive} from './geometry-utils.js';
export const paints={blue:0x579dff,red:0xf46a7b,green:0x5edb96,unknown:0xf3f5fa};
const CAPACITY=232;
export const DRONE_DESIGNS=['SURVEY / 카메라형','COMPACT / 가드형','SPORT / 슬림형'];
const std=(color,more={})=>new T.MeshStandardMaterial({color,metalness:.35,roughness:.42,...more});
export function createDroneFleet(root){
 const fleet=new T.Group();fleet.name='v54-detailed-instanced-drones';root.add(fleet);const variants=[];
 for(let v=0;v<3;v++){
  const arm=v===1?2.7:3.3,stretch=v===2?1.25:1,frame=[],shell=[],glass=[];
  const box=(a,w,h,d,p,r=[0,0,0])=>a.push(primitive(new T.BoxGeometry(w,h,d),p,[1,1,1],r));
  frame.push(primitive(new T.SphereGeometry(1,16,10),[0,0,0],[1.15,.65,1.9*stretch]));
  shell.push(primitive(new T.SphereGeometry(1,16,10),[0,.42,-.1],[1.15,.5,1.65*stretch]));
  box(shell,.38,.15,2.5,[0,.91,0]);
  shell.push(primitive(new T.TorusGeometry(4.6,.12,6,48),[0,-1.65,0],[1,1,1],[Math.PI/2,0,0]));
  const hubs=[];
  for(const x of [-arm,arm])for(const z of [-arm,arm]){
   const point=[x,.28,z*stretch];hubs.push(point);
   const len=Math.hypot(x,z*stretch);box(frame,.5,.45,len,[x/2,0,z*stretch/2],[0,Math.atan2(x,z*stretch),0]);
   frame.push(primitive(new T.CylinderGeometry(.52,.57,.7,10),point));
   shell.push(primitive(new T.CylinderGeometry(.57,.57,.17,10),[x,.6,z*stretch]));
   if(v===1)frame.push(primitive(new T.TorusGeometry(1.48,.09,5,24),[x,.55,z*stretch],[1,1,1],[Math.PI/2,0,0]));
   box(shell,.3,.18,.62,[x,.81,z*stretch]);
  }
  // Visible landing skids, camera pod, front lens and contrasting battery panel.
  for(const x of [-.95,.95]){box(frame,.15,1.1,.15,[x,-.85,1]);box(frame,.15,1.1,.15,[x,-.85,-1]);box(frame,.22,.2,3.4,[x,-1.4,0]);}
  box(frame,1.12,.8,.95,[0,-.64,-1.65*stretch]);
  glass.push(primitive(new T.CylinderGeometry(.34,.34,.12,16),[0,-.62,-2.17*stretch],[1,1,1],[Math.PI/2,0,0]));
  box(frame,.66,.12,1.6,[0,1.02,.25]);
  const materials=[std(0x293642),new T.MeshBasicMaterial({color:0xffffff,toneMapped:false}),std(0x113f55,{metalness:.8,roughness:.15})];
  const meshes=[frame,shell,glass].map((geos,i)=>{const m=new T.InstancedMesh(mergeGeometry(geos),materials[i],CAPACITY);m.count=0;m.frustumCulled=false;m.instanceMatrix.setUsage(T.DynamicDrawUsage);fleet.add(m);return m;});
  const blade=mergeGeometry([new T.BoxGeometry(2.85,.065,.19),new T.BoxGeometry(.19,.065,2.85)]),prop=new T.InstancedMesh(blade,std(0xd1dce0,{metalness:.6}),CAPACITY*4);prop.count=0;prop.frustumCulled=false;prop.instanceMatrix.setUsage(T.DynamicDrawUsage);fleet.add(prop);
  variants.push({meshes,prop,hubs});
 }
 const base=new T.Matrix4(),local=new T.Matrix4(),q=new T.Quaternion(),p=new T.Vector3(),s=new T.Vector3(),axis=new T.Vector3(0,1,0),dummy=new T.Object3D(),paint=new T.Color(),counts=[0,0,0];
 return {group:fleet,update(time,agents,hiddenId){counts.fill(0);for(const a of agents){if(a.id===hiddenId)continue;const v=(a.index??Number(a.id.replace(/\D/g,''))??0)%3,entry=variants[v],i=counts[v]++;if(i>=CAPACITY)continue;const scale=a.id.startsWith('NEW-')?1.7:1.45;q.setFromAxisAngle(axis,a.heading||0);base.compose(p.set(a.x,a.y,a.z),q,s.setScalar(scale));for(const m of entry.meshes)m.setMatrixAt(i,base);entry.meshes[1].setColorAt(i,paint.setHex(paints[a.color]??paints.unknown));entry.hubs.forEach((h,j)=>{dummy.position.set(h[0],.83,h[2]);dummy.rotation.set(0,time*28*(j%2?1:-1)+j,0);dummy.scale.setScalar(1);dummy.updateMatrix();local.multiplyMatrices(base,dummy.matrix);entry.prop.setMatrixAt(i*4+j,local);});}variants.forEach((v,i)=>{for(const m of v.meshes){m.count=Math.min(counts[i],CAPACITY);m.instanceMatrix.needsUpdate=true;}if(v.meshes[1].instanceColor)v.meshes[1].instanceColor.needsUpdate=true;v.prop.count=Math.min(counts[i],CAPACITY)*4;v.prop.instanceMatrix.needsUpdate=true;});}};
}
