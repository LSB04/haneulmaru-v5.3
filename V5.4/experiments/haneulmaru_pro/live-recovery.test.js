import test from 'node:test';
import assert from 'node:assert/strict';
import {installLiveSender,createLiveReceiver,packet} from './live-video.js';

function harness(t){
 let now=0;const intervals=[],timeouts=[],sockets=[],encoded=[],decoded=[];
 const replace=(key,value)=>{const descriptor=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});t.after(()=>{if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});};
 replace('document',{hidden:false});replace('performance',{now:()=>now});
 replace('setInterval',(fn,ms)=>{const item={fn,ms};intervals.push(item);return item;});replace('clearInterval',item=>{if(item)item.off=true;});
 replace('setTimeout',(fn,ms)=>{const item={fn,ms};timeouts.push(item);return item;});replace('clearTimeout',item=>{if(item)item.off=true;});
 class Encoder{
  static async isConfigSupported(){return {supported:true};}
  constructor(callbacks){this.callbacks=callbacks;this.state='unconfigured';this.encodeQueueSize=0;}
  configure(){this.state='configured';}close(){this.state='closed';}
  encode(frame,options){encoded.push(options);this.callbacks.output({type:options.keyFrame?'key':'delta',timestamp:frame.timestamp,byteLength:1,copyTo:a=>a.set([1])});}
 }
 class Decoder{
  constructor(callbacks){this.callbacks=callbacks;this.state='unconfigured';this.decodeQueueSize=0;decoded.push(this);}
  configure(){this.state='configured';}close(){this.state='closed';}reset(){this.state='unconfigured';this.decodeQueueSize=0;}
  decode(chunk){this.lastChunk=chunk;this.callbacks.output({displayWidth:640,displayHeight:360,close(){}});}
 }
 replace('VideoEncoder',Encoder);replace('VideoDecoder',Decoder);replace('EncodedVideoChunk',class {constructor(m){Object.assign(this,m);}});
 const signal={api:async()=>({url:'local'}),socket:async(url,lane,onMessage,onClose)=>{const ws={lane,onMessage,onClose,readyState:1,bufferedAmount:0,sent:[],send(s){this.sent.push(typeof s==='string'?JSON.parse(s):s);},close(){if(this.readyState===3)return;this.readyState=3;onClose({});}};sockets.push(ws);return ws;}};
 return {signal,intervals,timeouts,sockets,encoded,decoded,setTime:v=>now=v,
  message(ws,data){ws.onMessage({data:JSON.stringify(data)});},
  frame(ws,epoch,type='key'){ws.onMessage({data:packet({type,timestamp:now*1000,byteLength:1,copyTo:a=>a.set([1])},epoch).buffer});},
  async flush(){for(let i=0;i<12;i++)await Promise.resolve();},
  async timers(){for(const item of timeouts.splice(0))if(!item.off)await item.fn();},
 };
}
test('sender resumes after one capture timeout without a new ready message',async t=>{
 const h=harness(t);let captures=0;
 const sender=installLiveSender({canvas:{width:640,height:360},captureVideoFrame:async()=>{if(++captures===1)throw Error('render timeout');return {timestamp:2000000,close(){}};}},h.signal,{status(){},onControl(){},onReady(){},state:()=>({}),profile:()=>({edge:1920,fps:60,bitrate:6000000})});
 await h.flush();h.message(h.sockets[0],{type:'ready'});await h.intervals.find(x=>x.ms===4).fn();
 h.setTime(2000);await h.intervals.find(x=>x.ms===4).fn();assert.equal(h.encoded.length,1);assert.equal(h.encoded[0].keyFrame,true);sender.stop();
});
test('sender recovers its video lane and repeats decoder config on keyframe request',async t=>{
 const h=harness(t);const sender=installLiveSender({canvas:{width:640,height:360},captureVideoFrame:async()=>({timestamp:2000000,close(){}})},h.signal,{status(){},onControl(){},onReady(){},state:()=>({}),profile:()=>({edge:1920,fps:60,bitrate:6000000})});
 await h.flush();h.message(h.sockets[0],{type:'ready'});await h.intervals.find(x=>x.ms===4).fn();h.sockets[0].sent=[];h.message(h.sockets[0],{type:'keyframe'});assert.equal(h.sockets[0].sent[0].type,'config');
 h.sockets[1].close();await h.timers();await h.flush();assert.equal(h.sockets.length,4);sender.stop();await h.timers();assert.equal(h.sockets.length,4);
});
test('receiver resynchronizes stalled video and reconnects only while running',async t=>{
 const h=harness(t);let paints=0;
 const receiver=createLiveReceiver(h.signal,{width:640,height:360,hidden:true,getContext:()=>({drawImage(){paints++;}})},{status(){},onState(){}});
 await receiver.start();const ctl=h.sockets[0],video=h.sockets[1];
 const cfg={type:'config',epoch:1,config:{codec:'avc1.42002a',codedWidth:640,codedHeight:360}};
 h.message(ctl,cfg);h.frame(video,1);assert.equal(paints,1);
 h.setTime(3000);h.intervals.find(x=>x.ms===1000&&!x.off).fn();assert.ok(ctl.sent.some(x=>x.type==='keyframe'));
 h.message(ctl,cfg);h.frame(video,1);assert.equal(paints,2);
 video.close();await h.timers();await h.flush();assert.equal(h.sockets.length,4);
 receiver.stop();await h.timers();assert.equal(h.sockets.length,4);
});
test('repeated codec metadata does not reset decoder; a congested keyframe is retained',async t=>{
 const h=harness(t);let paints=0;const receiver=createLiveReceiver(h.signal,{width:640,height:360,getContext:()=>({drawImage(){paints++;}})},{status(){},onState(){}});
 await receiver.start();const cfg={type:'config',epoch:2,config:{codec:'avc1.42002a',codedWidth:640,codedHeight:360}};
 h.message(h.sockets[0],cfg);h.message(h.sockets[0],cfg);assert.equal(h.decoded.length,1);
 h.decoded[0].decodeQueueSize=3;h.frame(h.sockets[1],2);assert.equal(paints,1);receiver.stop();
});
