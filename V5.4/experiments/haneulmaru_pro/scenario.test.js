import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Scenario} from './scenario.js';
import {height} from './terrain.js';
import {formationPoint} from './formation.js';
const advance=(s,seconds)=>{for(let i=0;i<Math.ceil(seconds/.05);i++)s.step(.05);};
test('initial scene is blue; objects originate only from synthetic game spawn',()=>{const s=new Scenario();assert.equal(s.agents().length,24);assert.ok(s.agents().every(a=>a.color==='blue'));assert.equal(s.spawn(),false);s.setMode('game');s.auto=false;s.spawn();assert.equal(s.agents().at(-1).color,'unknown');});
test('green warning expires and removes only that game object',()=>{const s=new Scenario();s.setMode('game');s.auto=false;s.rng=()=>.9;const id=s.spawn();advance(s,3.2);assert.equal(s.agents().find(a=>a.id===id).color,'green');advance(s,4.2);assert.ok(!s.agents().some(a=>a.id===id));assert.equal(s.totals.exits,1);assert.equal(s.effects.length,0);assert.equal(s.agents().length,20);});
test('red game visual begins at a blue object, then removes exactly one blue',()=>{const s=new Scenario();s.setMode('game');s.auto=false;s.rng=()=>.5;const id=s.spawn();advance(s,5.2);assert.equal(s.effects.length,1);assert.ok(s.agents().some(a=>a.id===s.effects[0].sourceId&&a.color==='blue'));assert.ok(s.agents().some(a=>a.id===id));advance(s,1.1);assert.ok(!s.agents().some(a=>a.id===id));assert.equal(s.totals.hits,1);advance(s,2);assert.equal(s.effects.length,0);assert.equal(s.agents().length,19);});
test('pause freezes event lifetime and reset restores default scene',()=>{const s=new Scenario();s.setMode('game');s.spawn();advance(s,2);s.paused=true;const before=JSON.stringify(s.summary());advance(s,10);assert.equal(JSON.stringify(s.summary()),before);s.reset();assert.equal(s.intruders.length,0);assert.equal(s.effects.length,0);assert.equal(s.totals.hits,0);});
test('automatic flight clears urban roofs throughout its route',()=>{const s=new Scenario();for(let t=0;t<120;t++){s.step(1);for(const a of s.agents()){assert.ok(Number.isFinite(a.y));assert.ok(a.y>=height(a.x,a.z)+8);}}});
test('new blue joins a unique distributed slot rather than the origin',()=>{
 const s=new Scenario();s.setMode('game');s.setCount(18);s.auto=false;
 const one=s.spawn('blue'),two=s.spawn('blue');advance(s,5.1);
 for(const id of [one,two]){const a=s.agents().find(a=>a.id===id);const dest=formationPoint(s.formationSlots.get(id),s.time);assert.ok(Math.hypot(a.x-dest.x,a.z-dest.z)<1e-7);assert.ok(a.y>=height(a.x,a.z)+20);}
 const a=s.agents().find(a=>a.id===one),b=s.agents().find(a=>a.id===two);assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=159.99);
});
test('pause freezes blue slot approach and resume completes arrival',()=>{
 const s=new Scenario();s.setMode('game');s.setCount(19);s.auto=false;const id=s.spawn('blue');advance(s,3.5);
 const before=s.agents().find(a=>a.id===id);s.paused=true;advance(s,3);assert.deepEqual(s.agents().find(a=>a.id===id),before);
 s.paused=false;advance(s,1.6);const after=s.agents().find(a=>a.id===id);const dest=formationPoint(s.formationSlots.get(id),s.time);assert.ok(Math.hypot(after.x-dest.x,after.z-dest.z)<1e-7);
});
test('C visibly travels outside the map before disappearing; pause freezes departure',()=>{
 const s=new Scenario();s.setMode('game');s.auto=false;s.rng=()=>.9;const id=s.spawn();advance(s,3.2);
 const start=s.agents().find(a=>a.id===id);advance(s,3.6);const leaving=s.agents().find(a=>a.id===id);
 assert.ok(Math.abs(leaving.x)>600);assert.ok(Math.abs(leaving.x)>Math.abs(start.x));
 s.paused=true;advance(s,2);assert.deepEqual(s.agents().find(a=>a.id===id),leaving);
 s.paused=false;advance(s,.5);assert.ok(!s.agents().some(a=>a.id===id));
});
