import {citySurface,CRUISE_HEIGHT} from './city-spatial.js';
export {hash,noise,seeded} from './synthetic-terrain.js';
export const SIZE=1200;
// Collision clearance uses mapped roof heights. Ground elevation is a flat display datum.
export const height=citySurface;
export function position(i,time,target={}){const phase=i*2.399963+time*(.014+(i%5)*.001),r=105+(i%9)*34;target.x=Math.sin(phase)*r;target.z=Math.cos(phase*.87+i)*r;target.y=CRUISE_HEIGHT+(i%4)*4+Math.sin(time*.2+i)*3;return target;}
