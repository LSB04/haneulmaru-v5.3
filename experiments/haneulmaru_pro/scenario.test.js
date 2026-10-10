import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Scenario} from './scenario.js';
import {height} from './terrain.js';
const advance=(s,seconds)=>{for(let i=0;i<Math.ceil(seconds/.05);i++)s.step(.05);};
test('initial scene is blue; objects originate only from synthetic game spawn',()=>{const s=new Scenario();assert.equal(s.agents().length,24);assert.ok(s.agents().every(a=>a.color==='blue'));assert.equal(s.spawn(),false);s.setMode('game');s.auto=false;s.spawn();assert.equal(s.agents().at(-1).color,'unknown');});
test('green warning expires and removes only that game object',()=>{const s=new Scenario();s.setMode('game');s.auto=false;s.rng=()=>.9;const id=s.spawn();advance(s,3.2);assert.equal(s.agents().find(a=>a.id===id).color,'green');advance(s,4.2);assert.ok(!s.agents().some(a=>a.id===id));assert.equal(s.totals.exits,1);assert.equal(s.effects.length,0);assert.equal(s.agents().length,20);});
test('red game visual begins at a blue object, then removes exactly one blue',()=>{const s=new Scenario();s.setMode('game');s.auto=false;s.rng=()=>.5;const id=s.spawn();advance(s,5.2);assert.equal(s.effects.length,1);assert.ok(s.agents().some(a=>a.id===s.effects[0].sourceId&&a.color==='blue'));assert.ok(s.agents().some(a=>a.id===id));advance(s,1.1);assert.ok(!s.agents().some(a=>a.id===id));assert.equal(s.totals.hits,1);advance(s,2);assert.equal(s.effects.length,0);assert.equal(s.agents().length,19);});
test('pause freezes event lifetime and reset restores default scene',()=>{const s=new Scenario();s.setMode('game');s.spawn();advance(s,2);s.paused=true;const before=JSON.stringify(s.summary());advance(s,10);assert.equal(JSON.stringify(s.summary()),before);s.reset();assert.equal(s.intruders.length,0);assert.equal(s.effects.length,0);assert.equal(s.totals.hits,0);});
test('airfield platform is level with finite blended edges',()=>{for(const x of [-240,0,240])for(const z of [-390,0,390])assert.equal(height(x,z),14);for(let x=245;x<=300;x+=.5)assert.ok(Number.isFinite(height(x,0)));});
test('new blue travels toward map center then hovers independently of base drones',()=>{
 const s=new Scenario();s.setMode('game');s.setCount(19);s.auto=false;s.rng=()=>.1;const id=s.spawn();advance(s,3.2);
 const first=s.agents().find(a=>a.id===id);assert.equal(first.color,'blue');
 advance(s,.5);const midway=s.agents().find(a=>a.id===id);
 assert.ok(Math.hypot(midway.x,midway.z)<Math.hypot(first.x,first.z));
 assert.ok(midway.y>=height(midway.x,midway.z)+20);
 advance(s,1.6);const arrived=s.agents().find(a=>a.id===id);
 assert.ok(Math.abs(arrived.x)<1e-8);assert.ok(Math.abs(arrived.z)<1e-8);
 s.setCount(1);s.select('SIM-001');s.setPilot('manual');
 for(let i=0;i<40;i++)s.step(.05,{forward:1,side:1,up:1});
 const later=s.agents().find(a=>a.id===id);
 assert.equal(later.x,arrived.x);assert.equal(later.y,arrived.y);assert.equal(later.z,arrived.z);
 assert.ok(s.agents().some(a=>a.id==='SIM-001'&&Math.hypot(a.x,a.z)>1));
});
test('pause freezes blue center approach and resume completes arrival',()=>{
 const s=new Scenario();s.setMode('game');s.setCount(19);s.auto=false;s.rng=()=>.1;const id=s.spawn();advance(s,3.5);
 const before=s.agents().find(a=>a.id===id);s.paused=true;advance(s,3);
 assert.deepEqual(s.agents().find(a=>a.id===id),before);
 s.paused=false;advance(s,2);const after=s.agents().find(a=>a.id===id);
 assert.ok(Math.abs(after.x)<1e-8);assert.ok(Math.abs(after.z)<1e-8);
});
test('C visibly travels outside the map before disappearing; pause freezes departure',()=>{
 const s=new Scenario();s.setMode('game');s.auto=false;s.rng=()=>.9;const id=s.spawn();advance(s,3.2);
 const start=s.agents().find(a=>a.id===id);advance(s,3.6);const leaving=s.agents().find(a=>a.id===id);
 assert.ok(Math.abs(leaving.x)>600);assert.ok(Math.abs(leaving.x)>Math.abs(start.x));
 s.paused=true;advance(s,2);assert.deepEqual(s.agents().find(a=>a.id===id),leaving);
 s.paused=false;advance(s,.5);assert.ok(!s.agents().some(a=>a.id===id));
});
