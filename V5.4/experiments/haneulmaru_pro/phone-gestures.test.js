import test from 'node:test';
import assert from 'node:assert/strict';
import {installPhoneGestures} from './phone-gestures.js';

function target(){
 const handlers=new Map();return {style:{touchAction:'pan-y'},hidden:false,
  addEventListener(name,fn){const set=handlers.get(name)||new Set();set.add(fn);handlers.set(name,set);},
  removeEventListener(name,fn){handlers.get(name)?.delete(fn);},
  emit(name,event={}){for(const fn of handlers.get(name)||[])fn(event);},
  get listenerCount(){return [...handlers.values()].reduce((n,set)=>n+set.size,0);}
 };
}
function fixture(extra={}){
 const element=target(),win=target(),doc=target(),captured=new Set(),jobs=new Map(),sent=[],delays=[];let next=0;
 element.setPointerCapture=id=>captured.add(id);element.hasPointerCapture=id=>captured.has(id);element.releasePointerCapture=id=>{captured.delete(id);element.emit('lostpointercapture',{pointerId:id,preventDefault(){}});};
 const gestures=installPhoneGestures(element,d=>sent.push(d),{windowTarget:win,documentTarget:doc,viewport:()=>({width:100,height:200}),
  schedule(fn,ms){const id=++next;jobs.set(id,fn);delays.push(ms);return id;},cancel:id=>jobs.delete(id),...extra});
 function emit(name,id,x=0,y=0){const e={pointerId:id,clientX:x,clientY:y,button:0,prevented:false,preventDefault(){this.prevented=true;}};element.emit(name,e);return e;}
 function flush(){const job=jobs.entries().next().value;if(!job)return false;jobs.delete(job[0]);job[1]();return true;}
 return {element,win,doc,captured,jobs,sent,delays,gestures,emit,flush};
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('second pointerdown seeds pinch immediately; first move already zooms',()=>{
 const f=fixture();assert.equal(f.element.style.touchAction,'none');
 assert.equal(f.emit('pointerdown',1,0,0).prevented,true);f.emit('pointerdown',2,100,0);
 assert.equal(f.emit('pointermove',2,200,0).prevented,true);assert.equal(f.sent.length,0);assert.equal(f.jobs.size,1);
 f.flush();assert.deepEqual(f.sent,[{zoom:.5}]);assert.equal(f.delays[0],1000/30);f.gestures.destroy();
});

test('rotation sums and pinch multiplies into one scheduled control message',()=>{
 const f=fixture();f.emit('pointerdown',1,0,0);f.emit('pointermove',1,10,20);f.emit('pointermove',1,20,40);
 f.emit('pointerdown',2,120,40);f.emit('pointermove',2,220,40);f.emit('pointermove',2,420,40);
 assert.equal(f.jobs.size,1);f.flush();assert.equal(f.sent.length,1);close(f.sent[0].dx,.2);close(f.sent[0].dy,.2);close(f.sent[0].zoom,.25);
 assert.equal(f.jobs.size,0);f.gestures.destroy();
});

test('large cumulative zoom is split over rate-limited valid factors without losing scale',()=>{
 for(const outward of [true,false]){
  const f=fixture({maxHz:120});f.emit('pointerdown',1,0,0);f.emit('pointerdown',2,outward?100:10000,0);f.emit('pointermove',2,outward?10000:100,0);
  let ticks=0;while(f.flush()){ticks++;assert.equal(f.sent.length,ticks);assert.ok(ticks<10);}
  assert.ok(ticks>1);assert.ok(f.sent.every(d=>d.zoom>.2&&d.zoom<5));close(f.sent.reduce((factor,d)=>factor*d.zoom,1),outward?.01:100);
  assert.ok(f.delays.every(ms=>ms>=1000/30));f.gestures.destroy();
 }
});

test('pinch release cannot rotate remaining finger; fresh contact resumes rotation',()=>{
 const f=fixture();f.emit('pointerdown',1,0,0);f.emit('pointerdown',2,100,0);f.emit('pointermove',2,200,0);f.flush();
 f.emit('pointerup',2,200,0);f.emit('pointermove',1,80,180);assert.equal(f.jobs.size,0);assert.equal(f.sent.length,1);
 f.emit('pointerup',1,80,180);f.emit('pointerdown',3,80,180);f.emit('pointermove',3,90,200);f.flush();assert.deepEqual(f.sent[1],{dx:.1,dy:.1});f.gestures.destroy();
});

test('cancel, lost capture, blur, hidden page, and native app hiding discard unsent movement',()=>{
 for(const source of ['pointercancel','lostpointercapture','blur','visibilitychange','haneulmaru-app-hidden','pagehide']){
  const f=fixture();f.emit('pointerdown',1,0,0);f.emit('pointermove',1,10,20);assert.equal(f.jobs.size,1);
  if(source==='visibilitychange'){f.doc.hidden=true;f.doc.emit(source);}else if(['pointercancel','lostpointercapture'].includes(source))f.emit(source,1);else f.win.emit(source);
  assert.equal(f.jobs.size,0,source);assert.equal(f.captured.size,0,source);f.emit('pointermove',1,90,100);assert.equal(f.flush(),false);assert.equal(f.sent.length,0);f.gestures.destroy();
 }
});

test('normal pointerup keeps pending movement, unknown capture loss does not cancel',()=>{
 const f=fixture();f.emit('pointerdown',1,0,0);f.emit('pointermove',1,20,20);f.emit('lostpointercapture',99);assert.equal(f.jobs.size,1);
 f.emit('pointerup',1,20,20);assert.equal(f.captured.size,0);f.flush();assert.deepEqual(f.sent,[{dx:.2,dy:.1}]);f.gestures.destroy();
});

test('coincident fingers and extra pointers never emit invalid zoom',()=>{
 const f=fixture();f.emit('pointerdown',1,0,0);f.emit('pointerdown',2,0,0);f.emit('pointerdown',3,999,999);
 assert.equal(f.captured.size,2);f.emit('pointermove',2,100,0);assert.equal(f.jobs.size,0);f.emit('pointermove',2,200,0);f.flush();assert.deepEqual(f.sent,[{zoom:.5}]);f.gestures.destroy();
});

test('long rotation chunks stay within host limits and destroy removes callbacks',()=>{
 const f=fixture();f.emit('pointerdown',1,0,0);f.emit('pointermove',1,500,-600);while(f.flush()){}
 close(f.sent.reduce((sum,d)=>sum+(d.dx||0),0),5);close(f.sent.reduce((sum,d)=>sum+(d.dy||0),0),-3);
 assert.ok(f.sent.every(d=>Math.abs(d.dx)<=1&&Math.abs(d.dy)<=1));
 f.emit('pointermove',1,600,-600);f.gestures.destroy();f.gestures.destroy();assert.equal(f.jobs.size,0);assert.equal(f.element.listenerCount+f.win.listenerCount+f.doc.listenerCount,0);assert.equal(f.element.style.touchAction,'pan-y');
});
