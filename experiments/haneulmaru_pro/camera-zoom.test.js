import {test} from 'node:test';import assert from 'node:assert/strict';
import {PerspectiveCamera,OrthographicCamera,Vector3} from './vendor/three.module.min.js';
import {zoomCamera} from './camera-zoom.js';
test('overview zoom works while IMU disables orbit; orientation is preserved',()=>{
 const camera=new PerspectiveCamera();camera.position.set(620,450,660);camera.rotation.set(.2,.4,.1);
 const before=camera.quaternion.clone(),controls={target:new Vector3(0,40,0),enabled:false,update(){throw Error('must preserve IMU');}};
 const old=camera.position.distanceTo(controls.target);zoomCamera({view:'overview',camera,controls,chaseDistance:40},.5);
 assert.ok(Math.abs(camera.position.distanceTo(controls.target)-old*.5)<1e-6);assert.ok(camera.quaternion.equals(before));
 zoomCamera({view:'overview',camera,controls,chaseDistance:40},2);assert.ok(Math.abs(camera.position.distanceTo(controls.target)-old)<1e-6);
});
test('2D zoom and distance limits are effective and invalid factors ignored',()=>{
 const camera=new PerspectiveCamera(),ortho=new OrthographicCamera(-1,1,1,-1),controls={target:new Vector3(),enabled:false};camera.position.set(0,0,15);
 const context={view:'overview',camera,ortho,controls,chaseDistance:40};for(let i=0;i<30;i++)zoomCamera(context,.3);assert.equal(camera.position.length(),12);
 for(let i=0;i<30;i++)zoomCamera(context,3);assert.equal(camera.position.length(),1900);
 zoomCamera({...context,view:'map'},.5);assert.equal(ortho.zoom,2);zoomCamera({...context,view:'map'},2);assert.equal(ortho.zoom,1);
 assert.equal(zoomCamera({...context,view:'chase'},.5),20);assert.equal(zoomCamera(context,NaN),40);
});
