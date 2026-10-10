import test from 'node:test';
import assert from 'node:assert/strict';
import {MovementInput,installMovementPad} from './manual-controls.js';
import {motionOnly} from './control-policy.js';
import {Scenario} from './scenario.js';
test('two thumbs combine translation and altitude; releasing one retains the other',()=>{const m=new MovementInput();m.press(1,'forward',1);assert.deepEqual(m.press(2,'up',1),{forward:1,side:0,up:1});assert.deepEqual(m.release(1),{forward:0,side:0,up:1});assert.deepEqual(m.release(2),{forward:0,side:0,up:0});});
test('opposite directions cancel; cancel/blur clears every axis',()=>{const m=new MovementInput();m.press(1,'side',-1);m.press(2,'side',1);assert.equal(m.value().side,0);m.release(2);assert.equal(m.value().side,-1);assert.deepEqual(m.clear(),{forward:0,side:0,up:0});});
test('all six touch axes move selected synthetic drone, pause holds position',()=>{for(const axis of ['forward','side','up'])for(const sign of [-1,1]){const s=new Scenario(42,2);s.setPilot('manual');s.manual={x:0,y:100,z:0,heading:0};s.step(.1,{[axis]:sign});const p=s.agents()[0];assert.equal(p[axis==='forward'?'z':axis==='side'?'x':'y'],axis==='forward'?-5.5*sign:axis==='side'?5.5*sign:100+4*sign);s.paused=true;s.step(.1,{[axis]:sign});assert.deepEqual(s.agents()[0],p);}});
test('only high rate motion skips immediate full state echo',()=>{assert.equal(motionOnly({type:'control',seq:1,move:{forward:1}}),true);assert.equal(motionOnly({seq:2,dx:.01,dy:0}),true);assert.equal(motionOnly({seq:3,pilot:'manual',move:{}}),false);assert.equal(motionOnly({seq:4,count:50}),false);});
test('pointer capture cancel, blur and mode switch stop repeating movement',async()=>{
 const handlers={},windowHandlers={},docHandlers={},sent=[];
 const buttons=['forward','up'].map(axis=>({dataset:{move:axis,sign:'1'},classList:{toggle(){}},setPointerCapture(){},addEventListener(n,fn){(handlers[axis]??={})[n]=fn;}}));
 globalThis.addEventListener=(n,fn)=>windowHandlers[n]=fn;globalThis.removeEventListener=n=>delete windowHandlers[n];globalThis.document={hidden:false,addEventListener:(n,fn)=>docHandlers[n]=fn,removeEventListener:n=>delete docHandlers[n]};
 const pad=installMovementPad({querySelectorAll:()=>buttons},d=>sent.push(d));const e=id=>({pointerId:id,preventDefault(){},stopPropagation(){}});
 try{pad.setEnabled(true);handlers.forward.pointerdown(e(1));handlers.up.pointerdown(e(2));await new Promise(r=>setTimeout(r,75));assert.deepEqual(sent.at(-1).move,{forward:1,side:0,up:1});handlers.forward.lostpointercapture(e(1));assert.equal(sent.at(-1).move.up,1);windowHandlers.blur();assert.deepEqual(sent.at(-1).move,{forward:0,side:0,up:0});handlers.up.pointerdown(e(3));pad.setEnabled(false);assert.equal(sent.at(-1).move.up,0);const n=sent.length;handlers.forward.pointerdown(e(4));await new Promise(r=>setTimeout(r,75));assert.equal(sent.length,n);}finally{pad.destroy();delete globalThis.document;delete globalThis.addEventListener;delete globalThis.removeEventListener;}
});
