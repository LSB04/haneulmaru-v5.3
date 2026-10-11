import * as T from './vendor/three.module.min.js';
import {CITY} from './city-data.js';
import {CITY_BUILDINGS,FILL_BUILDINGS} from './city-fill.js';
import {GROUND,inside,clipSegment} from './city-spatial.js';
import {mergeGeometry,primitive} from './geometry-utils.js';

const ROAD_WIDTH={motorway:18,trunk:17,primary:16,secondary:12,tertiary:9,residential:6,unclassified:6,service:4,living_street:5,footway:2,path:1.8,cycleway:2.2,steps:2,pedestrian:4,river:22};
const pavement=new Set(['footway','path','cycleway','steps','pedestrian']);
function shape(points){const s=new T.Shape();points.forEach(([x,z],i)=>i?s.lineTo(x,-z):s.moveTo(x,-z));s.closePath();return s;}
function extrusion(points,h){const g=new T.ExtrudeGeometry(shape(points),{depth:h,bevelEnabled:false,steps:1,curveSegments:1});g.rotateX(-Math.PI/2);g.translate(0,GROUND,0);return g;}
function polygon(points,y){const g=new T.ShapeGeometry(shape(points));g.rotateX(-Math.PI/2);g.translate(0,y,0);return g;}
function facade(color){const m=new T.MeshStandardMaterial({color,roughness:.78});m.onBeforeCompile=s=>{s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vCityPos;varying vec3 vCityNormal;').replace('#include <begin_vertex>','#include <begin_vertex>\nvCityPos=position;vCityNormal=normal;');s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vCityPos;varying vec3 vCityNormal;').replace('#include <color_fragment>',`#include <color_fragment>
 if(abs(vCityNormal.y)<0.45){float u=abs(vCityNormal.x)>abs(vCityNormal.z)?vCityPos.z:vCityPos.x;vec2 tile=fract(vec2(u*.24,(vCityPos.y-14.)/3.4));float pane=step(.17,tile.x)*step(tile.x,.78)*step(.23,tile.y)*step(tile.y,.8);float lit=step(.81,fract(sin(floor(u*.24)*12.9+floor(vCityPos.y/3.4)*78.2)*43758.5));diffuseColor.rgb=mix(diffuseColor.rgb,mix(vec3(.15,.27,.34),vec3(.68,.64,.48),lit),pane*.83);}
 `);};return m;}
export function addCity(root,quality='high'){
 const group=new T.Group();group.name='yangjae-osm-city';root.add(group);const batches=new Map();
 const mats={ground:new T.MeshStandardMaterial({color:0xc6c3b6,roughness:1}),walk:new T.MeshStandardMaterial({color:0xd4d3c6,roughness:1}),road:new T.MeshStandardMaterial({color:0x414e56,roughness:.94}),lane:new T.MeshBasicMaterial({color:0xe6d898}),park:new T.MeshStandardMaterial({color:0x769077,roughness:1}),water:new T.MeshStandardMaterial({color:0x4a95a7,roughness:.26,metalness:.25}),roof:new T.MeshStandardMaterial({color:0x526472,roughness:.65}),edge:new T.LineBasicMaterial({color:0x657981,transparent:true,opacity:.38})};
 const palette=[0xc1c7c7,0xaabdc5,0xc8bfae,0x9daebb,0xb4b9b4,0xcac6bc];palette.forEach((c,i)=>mats['b'+i]=facade(c));
 const push=(key,g)=>{if(!batches.has(key))batches.set(key,[]);batches.get(key).push(g);};
 function box(key,w,h,d,x,y,z,angle=0){push(key,primitive(new T.BoxGeometry(w,h,d),[x,y,z],[1,1,1],[0,angle,0]));}
 box('ground',1200,3,1200,0,GROUND-1.5,0);
 for(const p of CITY.land)push(p.kind==='water'?'water':'park',polygon(p.points,GROUND+.12));
 let segments=0;
 for(const r of CITY.roads){if(r.tunnel)continue;const width=Math.max(1,Math.min(35,r.width||(r.lanes?r.lanes*3.3:ROAD_WIDTH[r.kind]||4)));for(let i=1;i<r.points.length;i++){const seg=clipSegment(r.points[i-1],r.points[i]);if(!seg)continue;const [a,b]=seg,dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.1)continue;segments++;const x=(a[0]+b[0])/2,z=(a[1]+b[1])/2,angle=Math.atan2(dx,dz),y=GROUND+(r.bridge?1.4:.3);
  if(r.kind==='river'){box('park',width+30,.12,length+1,x,GROUND+.16,z,angle);box('water',width,.12,length+1,x,GROUND+.24,z,angle);continue;}
  box('walk',width+3.8,.13,length+2,x,y,z,angle);box(pavement.has(r.kind)?'walk':'road',width,.12,length+1,x,y+.1,z,angle);
  if(width>=9){for(let t=5;t<length-2;t+=13){const f=t/length;box('lane',.28,.03,6,a[0]+dx*f,y+.2,a[1]+dz*f,angle);}}
 }}
 const roofEdges=[];let heightsFromTags=0;
 for(const b of CITY_BUILDINGS){push('b'+b.id%palette.length,extrusion(b.points,b.height));if(['osm_height','osm_levels'].includes(b.heightSource))heightsFromTags++;
  const y=GROUND+b.height+.08;for(let i=0;i<b.points.length;i++){const a=b.points[i],c=b.points[(i+1)%b.points.length];roofEdges.push(a[0],y,a[1],c[0],y,c[1]);}
  const x=b.points.reduce((n,p)=>n+p[0],0)/b.points.length,z=b.points.reduce((n,p)=>n+p[1],0)/b.points.length;
  if(quality!=='low'&&b.area>150&&inside(x,z,b.points))box('roof',3.4,1.3,4.8,x,y+.65,z,(b.id%8)*Math.PI/4);
 }
 const edges=new T.BufferGeometry();edges.setAttribute('position',new T.Float32BufferAttribute(roofEdges,3));group.add(new T.LineSegments(edges,mats.edge));
 // Instanced planting is illustrative: it is not surveyed tree placement.
 const trees=[],rand=()=>{treeSeed=(Math.imul(treeSeed,1664525)+1013904223)>>>0;return treeSeed/4294967296;};let treeSeed=540;
 for(const park of CITY.land.filter(p=>p.kind==='park'||p.kind==='forest'||p.kind==='wood')){const xs=park.points.map(p=>p[0]),zs=park.points.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);const count=quality==='low'?25:85;for(let i=0;i<count;i++){const x=minX+rand()*(maxX-minX),z=minZ+rand()*(maxZ-minZ);if(inside(x,z,park.points))trees.push([x,z,3+rand()*2]);}}
 const treeMat=new T.MeshStandardMaterial({color:0x416953,roughness:1}),treeMesh=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),treeMat,trees.length),trunks=new T.InstancedMesh(new T.CylinderGeometry(.25,.38,3,5),new T.MeshStandardMaterial({color:0x77644f}),trees.length),dummy=new T.Object3D();trees.forEach(([x,z,size],i)=>{dummy.position.set(x,GROUND+size+2,z);dummy.scale.set(size,size*1.1,size);dummy.updateMatrix();treeMesh.setMatrixAt(i,dummy.matrix);dummy.position.set(x,GROUND+1.5,z);dummy.scale.setScalar(1);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);});group.add(treeMesh,trunks);
 for(const [key,geos]of batches){const m=new T.Mesh(mergeGeometry(geos),mats[key]);m.name=key;m.receiveShadow=true;m.castShadow=key.startsWith('b');group.add(m);}
 // The venue is an address marker; no invented building footprint is presented as measured.
 const ring=new T.Mesh(new T.TorusGeometry(14,.65,6,64),new T.MeshBasicMaterial({color:0x3bdcdb,depthTest:false,transparent:true,opacity:.85}));ring.rotation.x=Math.PI/2;ring.position.y=GROUND+.8;ring.renderOrder=3;group.add(ring);
 const beacon=new T.Mesh(new T.CylinderGeometry(.35,.35,50,6),new T.MeshBasicMaterial({color:0x41e3d6,transparent:true,opacity:.5}));beacon.position.y=GROUND+25;group.add(beacon);
 function label(text,x,y,z,sub='',width=85){const c=document.createElement('canvas');c.width=768;c.height=192;const ctx=c.getContext('2d');ctx.fillStyle='#082b38ee';ctx.fillRect(0,0,768,192);ctx.strokeStyle='#6be5d3';ctx.lineWidth=5;ctx.strokeRect(3,3,762,186);ctx.fillStyle='#e6fffa';ctx.textAlign='center';ctx.font='bold 49px sans-serif';ctx.fillText(text,384,83);ctx.fillStyle='#8dcbd2';ctx.font='26px sans-serif';ctx.fillText(sub,384,139);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const sprite=new T.Sprite(new T.SpriteMaterial({map:tex,depthTest:false,transparent:true}));sprite.position.set(x,y,z);sprite.scale.set(width,width/4,1);sprite.renderOrder=5;group.add(sprite);return sprite;}
 label('아크 강남 · 대회장',0,GROUND+58,0,'강남대로30길 7 · 주소 기준점',110);
 const names=new Set();for(const r of CITY.roads){if(!['강남대로','남부순환로','강남대로30길','양재천'].includes(r.name)||names.has(r.name))continue;const p=r.points.find(([x,z])=>Math.abs(x)<500&&Math.abs(z)<500&&Math.hypot(x,z)>90);if(p){names.add(r.name);label(r.name,p[0],GROUND+10,p[1],'YANGJAE · SEOUL',70);}}
 return {ground:group.children.find(x=>x.name==='ground'),stats:{buildings:CITY.buildings.length,illustrativeBuildings:FILL_BUILDINGS.length,totalBuildings:CITY_BUILDINGS.length,roadSegments:segments,heightsFromTags,estimatedHeights:CITY.buildings.length-heightsFromTags,trees:trees.length}};
}
