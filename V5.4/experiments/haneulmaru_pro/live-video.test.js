import test from 'node:test';import assert from 'node:assert/strict';
import {packet,unpack,dimensions,send} from './live-video.js';
test('video header preserves epoch timestamp and key/delta dependency',()=>{
 for(const type of ['key','delta']){const chunk={type,timestamp:123456789,byteLength:3,copyTo:a=>a.set([1,2,3])};const frame=unpack(packet(chunk,42).buffer);assert.equal(frame.type,type);assert.equal(frame.timestamp,123456789);assert.equal(frame.epoch,42);assert.deepEqual([...frame.data],[1,2,3]);}
 assert.throws(()=>unpack(new ArrayBuffer(12)));
});
test('portrait and landscape sizes are even and never upscale',()=>{
 assert.deepEqual(dimensions({width:2560,height:1440},1920),{width:1920,height:1080});
 assert.deepEqual(dimensions({width:1080,height:2400},1920),{width:864,height:1920});
 assert.deepEqual(dimensions({width:641,height:481},1920),{width:640,height:480});
});
test('a disconnected or congested control socket is never reported as sent',()=>{
 assert.equal(send(null,{zoom:.8}),false);
 assert.equal(send({readyState:3,send(){throw Error('closed');}},{zoom:.8}),false);
 assert.equal(send({readyState:1,bufferedAmount:65536,send(){throw Error('full');}},{zoom:.8}),false);
 assert.equal(send({readyState:1,bufferedAmount:0,send(){throw Error('closed during send');}},{zoom:.8}),false);
 const messages=[];assert.equal(send({readyState:1,bufferedAmount:0,send:s=>messages.push(JSON.parse(s))},{zoom:.8}),true);
 assert.deepEqual(messages,[{zoom:.8}]);
});
