import {CRUISE_HEIGHT} from './city-spatial.js';
// Visual formation slots, not a flight controller or collision avoidance planner.
export const FORMATION={slots:20,layout:"grid",columns:5,rows:4,spacing:160,radius:400,angularSpeed:.006,joinSeconds:5};
export const MIN_SLOT_GAP=FORMATION.spacing;
export function formationPoint(slot,time){
 const x0=(slot%FORMATION.columns-(FORMATION.columns-1)/2)*FORMATION.spacing;
 const z0=(Math.floor(slot/FORMATION.columns)-(FORMATION.rows-1)/2)*FORMATION.spacing;
 const angle=time*FORMATION.angularSpeed,c=Math.cos(angle),s=Math.sin(angle);
 const x=x0*c-z0*s,z=x0*s+z0*c;
 return {x,y:CRUISE_HEIGHT+12,z,heading:Math.atan2(z,-x)};
}
export function smoothJoin(from,to,elapsed){const u=Math.max(0,Math.min(1,elapsed/FORMATION.joinSeconds)),s=u*u*(3-2*u);return {x:from.x+(to.x-from.x)*s,y:from.y+(to.y-from.y)*s,z:from.z+(to.z-from.z)*s};}
export function assignSlots(previous,ids){const active=new Set(ids),slots=new Map([...previous].filter(([id])=>active.has(id))),used=new Set(slots.values());for(const id of ids){if(slots.has(id))continue;for(let i=0;i<FORMATION.slots;i++){const slot=i*7%FORMATION.slots;if(!used.has(slot)){slots.set(id,slot);used.add(slot);break;}}}return slots;}
