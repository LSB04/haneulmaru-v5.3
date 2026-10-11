import test from 'node:test';import assert from 'node:assert/strict';
import {PerspectiveCamera,Vector3,Group} from './vendor/three.module.min.js';
import {configureCameraDepth} from './render-quality.js';
import {addCity} from './city-world.js';

test('overview separates 20 cm surfaces at 1 km in a 24-bit depth buffer',()=>{
 const camera=new PerspectiveCamera(62,1,.1,4500);
 const steps=()=>Math.abs(new Vector3(0,0,-1000).project(camera).z-new Vector3(0,0,-1000.2).project(camera).z)/2*(2**24-1);
 const old=steps();configureCameraDepth(camera,'overview');
 assert.ok(old<1);assert.ok(steps()>6);
 assert.ok(Math.abs(new Vector3(0,0,-4).project(camera).z)<1,'nearby overview objects remain visible');
 configureCameraDepth(camera,'cockpit');assert.ok(Math.abs(new Vector3(0,0,-.3).project(camera).z)<1,'onboard close view remains available');
 configureCameraDepth(camera,'chase');assert.ok(Math.abs(new Vector3(0,0,-1).project(camera).z)<1);
});

test('generated road, sidewalk and markings have separate surfaces; roof outlines cannot overwrite depth',()=>{
 const previous=globalThis.document;
 globalThis.document={createElement(){return {getContext(){return {fillRect(){},strokeRect(){},fillText(){}};}};}};
 const root=new Group();
 try{
  addCity(root,'low');const city=root.children[0],walk=city.getObjectByName('walk'),road=city.getObjectByName('road'),lane=city.getObjectByName('lane');
  const heights=m=>new Set(Array.from(m.geometry.attributes.position.array).filter((_,i)=>i%3===1).map(y=>y.toFixed(3)));
  for(const [a,b]of [[walk,road],[road,lane]])for(const y of heights(a))assert.ok(!heights(b).has(y),'different layers cannot be coplanar');
  assert.ok(road.material.polygonOffsetFactor<walk.material.polygonOffsetFactor);
  assert.ok(lane.material.polygonOffsetFactor<road.material.polygonOffsetFactor);
  assert.equal(city.children.find(m=>m.isLineSegments).material.depthWrite,false);
 }finally{globalThis.document=previous;root.traverse(m=>{m.geometry?.dispose();m.material?.map?.dispose();m.material?.dispose();});}
});
