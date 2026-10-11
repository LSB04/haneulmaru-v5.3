import {CITY} from './city-data.js';
// Illustrative gap fill only. These footprints are NOT surveyed buildings.
const bounds=p=>[Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))];
const overlap=(a,b,pad=0)=>a[0]<b[2]+pad&&a[2]>b[0]-pad&&a[1]<b[3]+pad&&a[3]>b[1]-pad;
const occupied=CITY.buildings.map(b=>bounds(b.points)),land=CITY.land.map(b=>bounds(b.points));
const widths={motorway:18,trunk:17,primary:16,secondary:12,tertiary:9,residential:6,river:22};
const segments=CITY.roads.filter(r=>!r.tunnel).flatMap(r=>r.points.slice(1).map((b,i)=>({a:r.points[i],b,width:r.width||(r.lanes?r.lanes*3.3:widths[r.kind]||4)})));
function distance(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);}
export const FILL_BUILDINGS=[];
for(let x=-570;x<=570;x+=30)for(let z=-570;z<=570;z+=30){
 const n=((x+600)*73856093^(z+600)*19349663)>>>0,w=14+n%8,d=14+(n>>>4)%8;
 const box=[x-w/2,z-d/2,x+w/2,z+d/2],radius=Math.hypot(w,d)/2;
 if(Math.hypot(x,z)<32||occupied.some(b=>overlap(box,b,5))||land.some(b=>overlap(box,b,4)))continue;
 if(segments.some(s=>distance(x,z,s.a,s.b)<radius+s.width/2+5))continue;
 const points=[[box[0],box[1]],[box[2],box[1]],[box[2],box[3]],[box[0],box[3]]];
 FILL_BUILDINGS.push({id:900000000+FILL_BUILDINGS.length,points,height:12+(n%10)*3,heightSource:'illustrative_fill',area:w*d,synthetic:true});occupied.push(box);
}
export const CITY_BUILDINGS=[...CITY.buildings,...FILL_BUILDINGS];
