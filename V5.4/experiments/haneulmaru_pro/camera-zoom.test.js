import {test} from 'node:test';import assert from 'node:assert/strict';
import {PerspectiveCamera,OrthographicCamera,Vector3} from './vendor/three.module.min.js';
import {zoomCamera,cameraZoomState} from './camera-zoom.js';
test('overview zoom works while IMU disables orbit; orientation is preserved',()=>{
 const camera=new PerspectiveCamera();camera.position.set(620,450,660);camera.rotation.set(.2,.4,.1);
 const before=camera.quaternion.clone(),controls={target:new Vector3(0,40,0),enabled:false,update(){throw Error('must preserve IMU');}};
 const old=camera.position.distanceTo(controls.target);zoomCamera({view:'overview',camera,controls,chaseDistance:40},.5);
 assert.ok(Math.abs(camera.position.distanceTo(controls.target)-old*.5)<1e-6);assert.ok(camera.quaternion.equals(before));
 zoomCamera({view:'overview',camera,controls,chaseDistance:40},2);assert.ok(Math.abs(camera.position.distanceTo(controls.target)-old)<1e-6);
});
test('all four views report an increasing magnification on zoom-in without an IMU',()=>{
 for(const view of ['overview','map','chase','cockpit']){
  const camera=new PerspectiveCamera(62);camera.position.set(430,360,510);
  const ctx={view,camera,ortho:new OrthographicCamera(-1,1,1,-1),controls:{target:new Vector3(0,40,0),enabled:true,update(){}},chaseDistance:40};
  const before=cameraZoomState(ctx);ctx.chaseDistance=zoomCamera(ctx,.8);const after=cameraZoomState(ctx);
  assert.ok(after.ratio>before.ratio,view);ctx.chaseDistance=zoomCamera(ctx,1.25);
  assert.ok(Math.abs(cameraZoomState(ctx).ratio-before.ratio)<1e-10,view);
  for(let i=0;i<100;i++)ctx.chaseDistance=zoomCamera(ctx,.5);
  assert.equal(cameraZoomState(ctx).canIn,false,view);assert.equal(cameraZoomState(ctx).canOut,true,view);
  for(let i=0;i<100;i++)ctx.chaseDistance=zoomCamera(ctx,2);
  assert.equal(cameraZoomState(ctx).canIn,true,view);assert.equal(cameraZoomState(ctx).canOut,false,view);
 }
});
test('2D zoom and distance limits are effective and invalid factors ignored',()=>{
 const camera=new PerspectiveCamera(),ortho=new OrthographicCamera(-1,1,1,-1),controls={target:new Vector3(),enabled:false};camera.position.set(0,0,15);
 const context={view:'overview',camera,ortho,controls,chaseDistance:40};for(let i=0;i<30;i++)zoomCamera(context,.3);assert.equal(camera.position.length(),12);
 for(let i=0;i<30;i++)zoomCamera(context,3);assert.equal(camera.position.length(),1900);
 zoomCamera({...context,view:'map'},.5);assert.equal(ortho.zoom,2);zoomCamera({...context,view:'map'},2);assert.equal(ortho.zoom,1);
 assert.equal(zoomCamera({...context,view:'chase'},.5),20);assert.equal(zoomCamera(context,NaN),40);
});
