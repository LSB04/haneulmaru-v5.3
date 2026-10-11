import test from 'node:test';
import assert from 'node:assert/strict';
import {signaling} from './rtc.js';

test('local PC refreshes stale sessions before QR and key submission; phone cannot recover host key',async t=>{
 const names=['location','sessionStorage','localStorage','history','fetch'];
 const previous=Object.fromEntries(names.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 t.after(()=>{for(const k of names){if(previous[k])Object.defineProperty(globalThis,k,previous[k]);else delete globalThis[k];}});
 const values=new Map();const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 Object.assign(globalThis,{location:{hash:'#STALE',hostname:'127.0.0.1',pathname:'/host',search:''},sessionStorage:storage,localStorage:storage,history:{replaceState(){}}});
 let bootstraps=0,calls=0,expired=false;const seen=[];
 globalThis.fetch=async(url,opts)=>{
  if(url==='/stream/host-session'){bootstraps++;return {ok:true,json:async()=>({key:'KEY-'+bootstraps})};}
  calls++;seen.push(opts.headers.Authorization);
  if(expired){expired=false;return {ok:false,status:401,json:async()=>({})};}
  return {ok:true,status:200,json:async()=>({ok:true})};
 };
 const host=signaling('host',()=>{});
 await host.api('info');assert.equal(bootstraps,1);assert.equal(seen[0],'Bearer KEY-1');
 expired=true;await host.api('ai/credential',{token:'MOCK-ONLY'});
 assert.equal(bootstraps,2);assert.equal(calls,3);assert.equal(seen.at(-1),'Bearer KEY-2');
 globalThis.location={hash:'#PHONE-OLD',hostname:'public.trycloudflare.com',pathname:'/phone',search:''};
 const phone=signaling('phone',()=>{});expired=true;
 await assert.rejects(phone.api('signal'),/만료/);assert.equal(bootstraps,2);
});
