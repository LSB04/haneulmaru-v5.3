import test from 'node:test';
import assert from 'node:assert/strict';
import {previewSize,createPreviewReceiver} from './lan-preview.js';
test('LAN preview bounds both orientations without upscaling',()=>{
 assert.deepEqual(previewSize(2560,1440),{width:1280,height:720});
 assert.deepEqual(previewSize(1080,2400),{width:576,height:1280});
 assert.deepEqual(previewSize(640,480),{width:640,height:480});
});
test('stop discards an in-flight response before displaying it',async()=>{
 let finish;const signal={raw:()=>new Promise(resolve=>finish=resolve)};
 const image={hidden:true,src:'',removeAttribute(){this.src='';}};
 const receiver=createPreviewReceiver(signal,image,()=>{},()=>{});
 const pending=receiver.start();receiver.stop();finish({status:200,blob(){throw Error('stale frame read');}});
 await pending;assert.equal(image.src,'');assert.equal(image.hidden,true);
});
