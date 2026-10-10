import * as T from 'three';
export const FIELD={x:0,z:0,halfX:245,halfZ:395,height:14};
export function inAirfield(x,z,margin=0){return Math.abs(x)<FIELD.halfX+margin&&Math.abs(z)<FIELD.halfZ+margin;}
export function addAirfield(root){
 const base=new T.Group();base.name='fictional-airfield';root.add(base);
 const mats=new Map();
 function box(x,y,z,w,h,d,color){let m=mats.get(color);if(!m){m=new T.MeshStandardMaterial({color,roughness:.88});mats.set(color,m);}const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);mesh.castShadow=h>2;mesh.receiveShadow=true;base.add(mesh);return mesh;}
 const Y=FIELD.height;
 box(0,Y+.1,0,485,.2,785,0x63825a);
 box(-70,Y+.28,0,56,.3,700,0x323d47);
 box(22,Y+.3,0,22,.3,680,0x48545e);
 box(119,Y+.3,30,168,.35,555,0x757d80);
 for(const z of [-265,-120,120,265])box(-20,Y+.31,z,108,.4,20,0x48545e);
 for(let z=-310;z<=310;z+=32)box(-70,Y+.5,z,2,.12,16,0xe1e9df);
 for(const x of [-95,-45])box(x,Y+.48,0,1,.1,684,0xcfdccf);
 for(const z of [-324,324])for(let i=0;i<6;i++)box(-89+i*7.6,Y+.55,z,3.2,.12,24,0xffffff);
 box(22,Y+.55,0,1,.12,648,0xf4cb65);
 for(let i=0;i<5;i++){
  const z=-195+i*100;
  box(157,Y+11,z,76,22,64,0xa7bcc5);
  box(157,Y+23,z,82,3,70,0x425c70);
  box(118,Y+9,z,1,17,53,0x223e50);
  box(86,Y+.6,z,38,.12,1.1,0xf4cb65);
 }
 box(148,Y+9,-325,116,18,50,0xc7bba4);
 box(148,Y+19,-325,120,2,54,0x486877);
 box(71,Y+27,-315,14,54,14,0xb7c5c8);
 box(71,Y+57,-315,28,11,24,0x3c697e);
 box(71,Y+64,-315,31,3,27,0x263d4b);
 // Decorative perimeter markers; no real airfield or operational layout.
 for(let z=-340;z<=340;z+=34)for(const x of [-102,-38])box(x,Y+.9,z,1.5,1.5,1.5,0x87ccef);
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#12323d';ctx.fillRect(0,0,512,128);ctx.fillStyle='#a1f8e0';ctx.font='bold 48px sans-serif';ctx.textAlign='center';ctx.fillText('HANEULMARU',256,63);ctx.font='22px sans-serif';ctx.fillText('FICTIONAL GAME AIRFIELD',256,102);
 const texture=new T.CanvasTexture(canvas),sign=new T.Mesh(new T.PlaneGeometry(90,22.5),new T.MeshBasicMaterial({map:texture,side:T.DoubleSide}));sign.position.set(148,Y+39,-294);base.add(sign);
 return base;
}
