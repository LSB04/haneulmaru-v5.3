import * as T from './vendor/three.module.min.js';

// Merge transformed primitives into one static draw; no new runtime dependency.
export function mergeGeometry(input) {
 const arrays={position:[],normal:[],uv:[]};
 for(const source of input){const g=source.index?source.toNonIndexed():source;for(const [name,size] of [['position',3],['normal',3],['uv',2]]){const a=g.getAttribute(name);if(a)arrays[name].push(a.array);else arrays[name].push(new Float32Array(g.attributes.position.count*size));}if(g!==source)g.dispose();}
 const out=new T.BufferGeometry();
 for(const [name,size] of [['position',3],['normal',3],['uv',2]]){const chunks=arrays[name],a=new Float32Array(chunks.reduce((n,x)=>n+x.length,0));let at=0;for(const x of chunks){a.set(x,at);at+=x.length;}out.setAttribute(name,new T.BufferAttribute(a,size));}
 input.forEach(g=>g.dispose());out.computeBoundingSphere();return out;
}
export function primitive(g,pos=[0,0,0],scale=[1,1,1],rotation=[0,0,0]){g.scale(...scale);g.rotateX(rotation[0]);g.rotateY(rotation[1]);g.rotateZ(rotation[2]);g.translate(...pos);return g;}
