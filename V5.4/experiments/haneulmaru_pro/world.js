import * as T from './vendor/three.module.min.js';
import {addCity} from './city-world.js';
import {createDroneFleet} from './drone-model.js';
export {SIZE} from './terrain.js';
export const profiles={low:{shadow:0,dpr:1},balanced:{shadow:1024,dpr:1.25},high:{shadow:2048,dpr:1.5},ultra:{shadow:4096,dpr:2}};
export function buildWorld(quality='balanced'){
 const profile=profiles[quality]||profiles.balanced,root=new T.Group(),cityRoot=new T.Group(),city=addCity(cityRoot,quality),fleet=createDroneFleet(root),positions=[];root.add(cityRoot);
 function update(t,agents=[],hiddenId=null){positions.length=0;positions.push(...agents);fleet.update(t,agents,hiddenId);}
 function dispose(){const geos=new Set(),materials=new Set(),textures=new Set();root.traverse(o=>{if(o.geometry)geos.add(o.geometry);for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m){materials.add(m);if(m.map)textures.add(m.map);}});geos.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());}
 return {root,cityRoot,update,positions,dispose,profile,ground:city.ground,cityStats:city.stats};
}
