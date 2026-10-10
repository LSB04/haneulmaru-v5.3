import {test} from 'node:test';import assert from 'node:assert/strict';
import {Scenario} from './scenario.js';
const advance=(s,seconds)=>{for(let i=0;i<Math.ceil(seconds/.05);i++)s.step(.05);};
const game=(n=20)=>{const s=new Scenario(42,n);s.setMode('game');s.auto=false;return s;};
test('game cap includes base and additional blue; full-cap random blue waits without reroll',()=>{
 const s=game(200);assert.equal(s.blueCount(),20);assert.equal(s.spawn('blue'),false);
 s.setCount(19);const extra=s.spawn('blue');assert.ok(extra);assert.equal(s.blueCount(),20);
 s.setCount(200);assert.equal(s.blueCount(),20);s.rng=()=>.1;const waiting=s.spawn();advance(s,3.2);
 assert.equal(s.agents().find(a=>a.id===waiting).color,'unknown');s.setCount(18);advance(s,.1);
 assert.equal(s.agents().find(a=>a.id===waiting).color,'blue');assert.equal(s.blueCount(),20);
});
test('simultaneous reds reserve different blue and each consume exactly one; none respawn',()=>{
 const s=game(2);const r1=s.spawn('red'),r2=s.spawn('red'),r3=s.spawn('red');advance(s,2.2);
 assert.equal(new Set(s.effects.map(e=>e.sourceId)).size,2);advance(s,1.1);
 assert.equal(s.blueCount(),0);assert.equal(s.totals.hits,2);assert.equal(s.totals.blueConsumed,2);
 assert.equal(s.agents().filter(a=>a.color==='red').length,1);advance(s,8);assert.equal(s.blueCount(),0);assert.equal(s.totals.hits,2);
 const blue=s.spawn('blue');advance(s,1.3);assert.ok(!s.agents().some(a=>a.id===blue));assert.equal(s.totals.hits,3);assert.equal(s.totals.blueConsumed,3);
 s.reset();assert.equal(s.blueCount(),2);assert.equal(s.totals.blueConsumed,0);
});
test('chosen colors are immediate, pause prevents creation, invalid colors rejected',()=>{
 const s=game(18);for(const color of ['blue','red','green']){const id=s.spawn(color);assert.equal(s.agents().find(a=>a.id===id).color,color);}
 assert.equal(s.spawn('invalid'),false);s.paused=true;assert.equal(s.spawn('red'),false);
});
test('selected consumed blue switches to a live object and stops manual input',()=>{
 const s=game(1);s.setPilot('manual');const red=s.spawn('red');advance(s,3.2);
 assert.equal(s.blueCount(),0);assert.equal(s.selected,'');assert.equal(s.pilot,'auto');assert.equal(s.manual,null);
 const blue=s.spawn('blue');advance(s,.1);assert.equal(s.selected,blue);
});
