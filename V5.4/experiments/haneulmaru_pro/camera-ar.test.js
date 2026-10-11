import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cameraSession} from './camera-ar.js';

function fixture(overrides={}){
 const events=[];let stopped=0,attached=null;
 const track={stop(){stopped++;}},stream={getTracks:()=>[track]};
 const session=cameraSession({getStream:async()=>stream,play:async()=>{},attach:s=>attached=s,changed:x=>events.push(x),...overrides});
 return {session,stream,track,events,get stopped(){return stopped;},get attached(){return attached;}};
}
test('camera is acquired on demand and fully released when AR ends',async()=>{
 const f=fixture();assert.equal(f.attached,null);await f.session.start();assert.equal(f.session.active,true);assert.equal(f.attached,f.stream);
 f.session.stop();assert.equal(f.session.active,false);assert.equal(f.attached,null);assert.equal(f.stopped,1);
});
test('a late permission result cannot reopen the camera after cancellation',async()=>{
 let resolve;const f=fixture({getStream:()=>new Promise(r=>resolve=r)});const start=f.session.start();f.session.stop();resolve(f.stream);await start;
 assert.equal(f.session.active,false);assert.equal(f.attached,null);assert.equal(f.stopped,1);assert.ok(!f.events.includes(true));
});
test('playback failure releases hardware and permits a later retry',async()=>{
 let fail=true;const f=fixture({play:async()=>{if(fail)throw Error('denied');}});
 await assert.rejects(f.session.start());assert.equal(f.stopped,1);assert.equal(f.attached,null);fail=false;await f.session.start();assert.equal(f.session.active,true);f.session.stop();
});
test('OS camera revocation leaves virtual mode, with no live track',async()=>{
 const f=fixture();await f.session.start();f.track.onended();assert.equal(f.session.active,false);assert.equal(f.attached,null);assert.equal(f.stopped,1);
});
