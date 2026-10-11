export function motionOnly(d){const keys=Object.keys(d).filter(k=>!['type','seq'].includes(k));return keys.length>0&&keys.every(k=>['move','dx','dy','zoom'].includes(k));}
