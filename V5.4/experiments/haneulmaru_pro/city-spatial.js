import {CITY_BUILDINGS} from './city-fill.js';
export const GROUND=14;
export function inside(x,z,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
const grid=new Map(),CELL=50;
for(const b of CITY_BUILDINGS){const xs=b.points.map(p=>p[0]),zs=b.points.map(p=>p[1]);b.bounds=[Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)];for(let x=Math.floor(b.bounds[0]/CELL);x<=Math.floor(b.bounds[2]/CELL);x++)for(let z=Math.floor(b.bounds[1]/CELL);z<=Math.floor(b.bounds[3]/CELL);z++){const key=x+','+z;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(b);}}
export function citySurface(x,z){let h=GROUND;for(const b of grid.get(Math.floor(x/CELL)+','+Math.floor(z/CELL))||[])if(inside(x,z,b.points))h=Math.max(h,GROUND+b.height);return h;}
export const CRUISE_HEIGHT=GROUND+Math.max(...CITY_BUILDINGS.map(b=>b.height))+35;
// Clip line segments to the displayed 1.2 km square, including long OSM ways.
export function clipSegment(a,b,limit=600){let t0=0,t1=1;const dx=b[0]-a[0],dz=b[1]-a[1];const p=[-dx,dx,-dz,dz],q=[a[0]+limit,limit-a[0],a[1]+limit,limit-a[1]];for(let i=0;i<4;i++){if(p[i]===0){if(q[i]<0)return null;}else{const t=q[i]/p[i];if(p[i]<0)t0=Math.max(t0,t);else t1=Math.min(t1,t);if(t0>t1)return null;}}return [[a[0]+dx*t0,a[1]+dz*t0],[a[0]+dx*t1,a[1]+dz*t1]];}
