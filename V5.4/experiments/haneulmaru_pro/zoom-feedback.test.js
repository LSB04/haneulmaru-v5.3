import test from 'node:test';import assert from 'node:assert/strict';
import {createZoomFeedback} from './zoom-feedback.js';
function setup(){let next=0,text='',zoom=null;const timers=new Map();return {feedback:createZoomFeedback({show:s=>text=s,render:z=>{zoom=z;text=z.label;},schedule:f=>{timers.set(++next,f);return next;},cancel:id=>timers.delete(id)}),get text(){return text;},get zoom(){return zoom;},timers,expire(){const tasks=[...timers.values()];timers.clear();tasks.forEach(f=>f());}};}
test('phone waits for the latest zoom command acknowledgement, not an old state',()=>{
 const t=setup(),z={label:'전체 3D',ratio:1.25};t.feedback.sent(10);t.feedback.sent(11);
 t.feedback.state({lastControlSeq:10,zoomState:z});assert.match(t.text,/확인 중/);assert.equal(t.timers.size,1);
 t.feedback.state({lastControlSeq:11,zoomState:z});assert.equal(t.text,z.label);assert.equal(t.zoom,z);assert.equal(t.timers.size,0);
});
test('failed send and no host response are visible even while old states arrive',()=>{
 const t=setup(),z={label:'추적',ratio:1};t.feedback.sent(null);t.feedback.state({lastControlSeq:0,zoomState:z});assert.match(t.text,/조작 연결 없음/);
 t.feedback.sent(2);t.expire();t.feedback.state({lastControlSeq:0,zoomState:z});assert.match(t.text,/PC 응답 없음/);
 t.feedback.sent(3);t.feedback.state({lastControlSeq:3,zoomState:z});assert.equal(t.text,'추적');
 t.feedback.sent(4);t.feedback.reset();assert.equal(t.timers.size,0);assert.equal(t.text,'추적');
 t.feedback.sent(5);t.feedback.destroy();assert.equal(t.timers.size,0);
});
test('progressing acknowledgements keep long gestures alive and late replies recover after timeout',()=>{
 const t=setup(),z={label:'전체 3D',ratio:1};t.feedback.sent(1);
 const initialTimer=[...t.timers.keys()][0];
 for(let i=2;i<=60;i++){t.feedback.sent(i);t.feedback.state({lastControlSeq:i-1,zoomState:{...z,ratio:i/10}});}
 assert.notEqual([...t.timers.keys()][0],initialTimer);assert.equal(t.timers.size,1);assert.doesNotMatch(t.text,/응답 없음/);
 t.expire();assert.match(t.text,/PC 응답 없음/);
 t.feedback.state({lastControlSeq:60,zoomState:{...z,ratio:6}});assert.equal(t.text,z.label);assert.equal(t.zoom.ratio,6);assert.equal(t.timers.size,0);
});
