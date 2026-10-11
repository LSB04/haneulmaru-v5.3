import {test} from 'node:test';import assert from 'node:assert/strict';
import {FORMATION,MIN_SLOT_GAP,formationPoint,assignSlots,smoothJoin} from './formation.js';
import {Scenario} from './scenario.js';
test('20 grid slots cover the interior and preserve all pair distances while rotating',()=>{
 const s=new Scenario(42,20);s.setMode('game');s.auto=false;
 for(const time of [0,8,60,300,1000]){s.time=time;const a=s.agents();let gap=Infinity;for(let i=0;i<a.length;i++){assert.ok(Math.hypot(a[i].x,a[i].z)<=FORMATION.radius+1e-8);for(let j=i+1;j<a.length;j++)gap=Math.min(gap,Math.hypot(a[i].x-a[j].x,a[i].z-a[j].z));}assert.ok(Math.abs(gap-MIN_SLOT_GAP)<1e-8);}
 assert.ok(Math.abs(MIN_SLOT_GAP-160)<.00001);
});
test('vacancy reuse does not shuffle existing slots or duplicate them',()=>{
 const ids=Array.from({length:20},(_,i)=>'id'+i),old=assignSlots(new Map(),ids),next=assignSlots(old,[...ids.filter(id=>id!=='id7'),'new']);
 assert.equal(next.get('new'),old.get('id7'));for(const id of ids.filter(id=>id!=='id7'))assert.equal(next.get(id),old.get(id));assert.equal(new Set(next.values()).size,20);
});
test('smooth arrival reaches endpoints; outermost slot tangential speed is 2.4 display units/sec',()=>{
 assert.deepEqual(smoothJoin({x:1,y:2,z:3},{x:9,y:8,z:7},0),{x:1,y:2,z:3});assert.deepEqual(smoothJoin({x:1,y:2,z:3},{x:9,y:8,z:7},5),{x:9,y:8,z:7});
 const a=formationPoint(0,0),b=formationPoint(0,.001);assert.ok(Math.abs(Math.hypot(a.x-b.x,a.z-b.z)/.001-2.4)<1e-6);
});

test('grid occupies five columns and four rows, including the interior',()=>{
 const points=Array.from({length:20},(_,i)=>formationPoint(i,0));
 assert.equal(new Set(points.map(p=>p.x)).size,5);assert.equal(new Set(points.map(p=>p.z)).size,4);
 assert.equal(Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),640);
 assert.equal(Math.max(...points.map(p=>p.z))-Math.min(...points.map(p=>p.z)),480);
 assert.ok(points.some(p=>Math.hypot(p.x,p.z)<100));
 for(const t of [60,300,1000])for(let i=0;i<20;i++)for(let j=0;j<i;j++){
  const a=formationPoint(i,t),b=formationPoint(j,t);
  assert.ok(Math.abs(Math.hypot(a.x-b.x,a.z-b.z)-Math.hypot(points[i].x-points[j].x,points[i].z-points[j].z))<1e-8);
 }
});
test('join lasts exactly five simulation seconds',()=>{
 assert.equal(FORMATION.joinSeconds,5);
 const from={x:0,y:0,z:0},to={x:100,y:100,z:100};
 assert.ok(smoothJoin(from,to,4.9).x<100);assert.deepEqual(smoothJoin(from,to,5),to);
});
