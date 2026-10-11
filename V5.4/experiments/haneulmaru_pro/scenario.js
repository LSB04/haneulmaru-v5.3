import {FORMATION,MIN_SLOT_GAP,formationPoint,assignSlots} from './formation.js';
import {position,height,seeded} from './terrain.js';
const sampleNow={},sampleNext={};

export const COLORS={blue:0x379aff,red:0xff526b,green:0x54e8a1,unknown:0xf5f8ff};
export const LABELS={blue:'A · 분산 대형',red:'B · 게임 제거',green:'C · 경고 후 퇴장',unknown:'흰색 · 미확인'};
export const EFFECT_RADIUS=24; // Arbitrary visual units, not a weapon damage model.
export const MAX_GAME_BLUE=20;
export class Scenario {
  constructor(seed=42,count=24){this.seed=seed>>>0;this.initialCount=count;this.count=count;this.mode='flight';this.paused=false;this.auto=true;this.reset();}
  reset(){this.count=Math.min(this.initialCount,this.mode==='game'?MAX_GAME_BLUE:200);this.baseIndices=Array.from({length:this.count},(_,i)=>i);this.nextBaseIndex=this.count;this.time=0;this.rng=seeded(this.seed);this.intruders=[];this.effects=[];this.events=[];this.serial=0;this.nextSpawn=8;this.formationSlots=new Map();this.selected='SIM-001';this.pilot='auto';this.manual=null;this.totals={blue:0,green:0,red:0,hits:0,exits:0,blueConsumed:0};this.log('시나리오 초기화 · 기본 드론은 모두 파랑');}
  log(text,color='blue',id=null){this.events.unshift({at:this.time,text,color,id});this.events.length=Math.min(40,this.events.length);}
  setMode(mode){if(!['flight','game'].includes(mode))return;this.mode=mode;if(mode==='game')this.setCount(this.count);this.log(mode==='game'?'합성 드론 게임 시작 · 파랑 최대 20개 · 빨강 1개당 파랑 1개 소모':'드론 시점 모드');}
  blueCount(){return this.agents().filter(a=>a.color==='blue').length;}
  setCount(n){if(!Number.isInteger(n)||n<0||n>200)return;const extra=this.intruders.filter(a=>a.color==='blue'&&!a.hitAt).length;this.count=Math.min(n,this.mode==='game'?Math.max(0,MAX_GAME_BLUE-extra):200);this.initialCount=Math.min(n,this.mode==='game'?MAX_GAME_BLUE:200);this.baseIndices.length=Math.min(this.baseIndices.length,this.count);while(this.baseIndices.length<this.count)this.baseIndices.push(this.nextBaseIndex++);this.ensureSelection();}
  ensureSelection(){if(!this.agents().some(a=>a.id===this.selected)){this.selected=this.agents()[0]?.id||'';this.pilot='auto';this.manual=null;}}
  removeBlue(id){const index=this.baseIndices.findIndex(i=>'SIM-'+String(i+1).padStart(3,'0')===id);if(index>=0){this.baseIndices.splice(index,1);this.count=this.baseIndices.length;}else{const a=this.intruders.find(a=>a.id===id&&a.color==='blue'&&!a.hitAt);if(!a)return false;a.hitAt=this.time;}this.totals.blueConsumed++;this.ensureSelection();return true;}
  select(id){if(this.agents().some(a=>a.id===id)){this.selected=id;this.pilot='auto';this.manual=null;return true;}return false;}
  spawn(color='unknown'){
    if(this.mode!=='game'||this.paused)return false;
    if(!Object.hasOwn(COLORS,color))return false;
    if(color==='blue'&&this.blueCount()>=MAX_GAME_BLUE){this.log('파랑 최대 20개 · 빈 자리가 생기면 생성할 수 있습니다.','blue');return false;}
    this.intruders=this.intruders.filter(a=>!a.hitAt||this.time-a.hitAt<3);
    if(this.intruders.length>=32){this.log('미확인 객체 한도 32개 · 초기화로 새 실험 시작','unknown');return false;}
    const serial=++this.serial,id='NEW-'+String(serial).padStart(3,'0');
    const a={id,index:serial+500,color:'unknown',born:this.time,resultAt:null,hitAt:null};this.intruders.push(a);
    if(color==='unknown')this.log(id+' 등장 · 가상 식별 대기','unknown',id);else this.classify(a,color,'직접 생성');return id;
  }
  classify(a,color,reason){if(color==='blue'&&this.blueCount()>=MAX_GAME_BLUE)return false;const p=this.agent(a.index,a.id,a.color);a.classifiedPoint={x:p.x,y:p.y,z:p.z};a.color=color;a.resultAt=this.time;a.exitPoint={x:p.x>=0?680:-680,y:p.y,z:p.z};this.totals[color]++;this.log(a.id+' → '+LABELS[color]+' ('+reason+')',color,a.id);return true;}
  step(dt,input={}){
    if(this.paused)return;
    dt=Math.max(0,Math.min(Number.isFinite(dt)?dt:0,.1));this.time+=dt;
    if(this.mode==='game'){
      if(this.auto&&this.time>=this.nextSpawn){this.spawn();this.nextSpawn=this.time+14;}
      for(const a of this.intruders){
        if(a.color==='unknown'&&this.time-a.born>=3){
          a.pendingColor??=['blue','red','green'][Math.floor(this.rng()*3)];
          this.classify(a,a.pendingColor,'게임 난수');
        }
        if(a.color==='green'&&!a.hitAt&&this.time-a.resultAt>=4){a.hitAt=this.time;this.totals.exits++;this.log(a.id+' 경고 종료 · 게임 영역에서 퇴장','green',a.id);}
        if(a.color==='red'&&!a.launchAt&&this.time-a.resultAt>=2){
          const reserved=new Set(this.intruders.filter(b=>b.launchAt&&!b.hitAt).map(b=>b.sourceId));
          const target=this.agent(a.index,a.id,a.color),blue=this.agents().filter(b=>b.color==='blue'&&!reserved.has(b.id));
          const source=blue.reduce((best,b)=>Math.hypot(b.x-target.x,b.y-target.y,b.z-target.z)<Math.hypot(best.x-target.x,best.y-target.y,best.z-target.z)?b:best,blue[0]);
          if(source){a.launchAt=this.time;a.sourceId=source.id;a.frozenPoint={x:target.x,y:target.y,z:target.z};this.effects.push({id:a.id,x:target.x,y:target.y,z:target.z,from:{x:source.x,y:source.y,z:source.z},sourceId:source.id,kind:'collision',at:this.time,radius:EFFECT_RADIUS});this.log(source.id+' → '+a.id+' A→B 합성 충돌 접근','red',a.id);}
        }
        if(a.launchAt&&!a.hitAt&&this.time-a.launchAt>=1){if(this.removeBlue(a.sourceId)){a.hitAt=this.time;this.totals.hits++;this.log(a.id+' 제거 · '+a.sourceId+' 파랑 1개 소모','red',a.id);}else{a.launchAt=null;a.frozenPoint=null;a.sourceId=null;}}
      }
    }
    this.effects=this.effects.filter(e=>this.time-e.at<2.2);
    this.ensureSelection();
    if(this.pilot==='manual'&&this.manual){
      const m=this.manual;const clamp=(x,l,h)=>Math.max(l,Math.min(h,x));const axis=k=>Number.isFinite(input[k])?clamp(input[k],-1,1):0;
      m.heading+=axis('turn')*dt;
      const forward=axis('forward')*55*dt,side=axis('side')*55*dt;
      m.x=clamp(m.x-Math.sin(m.heading)*forward+Math.cos(m.heading)*side,-550,550);
      m.z=clamp(m.z-Math.cos(m.heading)*forward-Math.sin(m.heading)*side,-550,550);
      m.y=clamp(m.y+axis('up')*40*dt,height(m.x,m.z)+12,450);
    }
  }
  agent(index,id,color,extra={}){
    const p=position(index,this.time,sampleNow),next=position(index,this.time+.12,sampleNext);
    return {id,index,color,...p,heading:Math.atan2(-(next.x-p.x),-(next.z-p.z)),...extra};
  }
  agents(){
    const ids=this.baseIndices.map(i=>'SIM-'+String(i+1).padStart(3,'0')).concat(this.intruders.filter(a=>a.color==='blue'&&!a.hitAt).map(a=>a.id));
    this.formationSlots=assignSlots(this.formationSlots,ids);
    const base=this.baseIndices.map(i=>this.agent(i,'SIM-'+String(i+1).padStart(3,'0'),'blue'));
    if(this.mode==='game')for(const a of base)Object.assign(a,formationPoint(this.formationSlots.get(a.id),this.time));
    if(this.manual&&this.pilot==='manual'){const a=base.find(a=>a.id===this.selected);if(a)Object.assign(a,this.manual);}
    const extra=this.intruders.filter(a=>!a.hitAt).map(a=>{
      const p=this.agent(a.index,a.id,a.color,{...a.frozenPoint,born:a.born,warningRemaining:a.color==='green'?Math.max(0,4-(this.time-a.resultAt)):null});
      if(a.classifiedPoint&&((a.color==='blue'&&this.formationSlots.has(a.id))||a.color==='green')){
        const dest=a.color==='blue'?formationPoint(this.formationSlots.get(a.id),this.time):a.exitPoint;
        const t=Math.min(1,Math.max(0,(this.time-a.resultAt)/(a.color==='blue'?FORMATION.joinSeconds:4))),blend=t*t*(3-2*t),from=a.classifiedPoint;
        p.x=from.x+(dest.x-from.x)*blend;p.z=from.z+(dest.z-from.z)*blend;
        p.y=Math.max(from.y+(dest.y-from.y)*blend,height(p.x,p.z)+20);
        p.heading=a.color==='blue'&&t===1?dest.heading:Math.atan2(-(dest.x-from.x),-(dest.z-from.z));
      }
      return p;
    });
    const all=base.concat(extra);
    // Scripted animation between virtual objects only; no sensor/detector input.
    for(const e of this.effects){const target=this.intruders.find(a=>a.id===e.id);if(e.kind!=='collision'||!target||target.hitAt)continue;const source=all.find(a=>a.id===e.sourceId);if(!source)continue;const t=Math.min(1,Math.max(0,this.time-e.at)),blend=t*t*(3-2*t);source.x=e.from.x+(e.x-e.from.x)*blend;source.y=e.from.y+(e.y-e.from.y)*blend;source.z=e.from.z+(e.z-e.from.z)*blend;source.heading=Math.atan2(-(e.x-e.from.x),-(e.z-e.from.z));}
    return all;
  }
  setPilot(mode){
    if(!['auto','manual'].includes(mode))return;
    if(mode==='manual'){
      const a=this.agents().find(a=>a.id===this.selected);
      if(!a||!a.id.startsWith('SIM-'))return;
      this.manual={x:a.x,y:a.y,z:a.z,heading:a.heading};
    }else this.manual=null;
    this.pilot=mode;
  }
  summary(){return {formation:{...FORMATION,minSlotGap:MIN_SLOT_GAP,angularSpeed:FORMATION.angularSpeed,joinSeconds:FORMATION.joinSeconds},mode:this.mode,paused:this.paused,auto:this.auto,time:this.time,seed:this.seed,selected:this.selected,pilot:this.pilot,totals:{...this.totals},events:this.events.slice(0,8),agents:this.agents().map(a=>({id:a.id,color:a.color,x:a.x,y:a.y,z:a.z,heading:a.heading,warningRemaining:a.warningRemaining})),effects:this.effects.map(e=>({...e}))};}
}
