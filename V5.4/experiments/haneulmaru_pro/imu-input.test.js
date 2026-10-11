import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('IMU panel preserves mouse control until enabled, releases stale input, and recovers server sessions',async t=>{
  const names=['document','location','sessionStorage','localStorage','history','fetch','setTimeout','addEventListener','__imuTestBridge'];
  const previous=Object.fromEntries(names.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  t.after(()=>{for(const k of names){if(previous[k])Object.defineProperty(globalThis,k,previous[k]);else delete globalThis[k];}});
  const elements=new Map(),scheduled=[],toggles=[],rotations=[],listeners={};
  const get=id=>{if(!elements.has(id))elements.set(id,{textContent:'',value:'1',disabled:true,prepend(){}});return elements.get(id);};
  const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
  const model={format:'nu40-imu-direction-model',schema_version:1,units:'degrees_per_second',rate_threshold_dps:20,similarity_threshold:.62,directions:{up:[1,0,0],down:[-1,0,0],left:[0,1,0],right:[0,-1,0]}};
  const fresh=time=>({source:'USB',session:'a',age_ms:0,sample:{t_ms:time,gx:90,gy:0,gz:0},sources:{USB:{message:'ok'},BLE:{message:'waiting'}}});
  let state={...fresh(0),sample:null,source:null},key=0,expired=false,unavailable=false,modelCalls=0;
  Object.assign(globalThis,{
    document:{hidden:false,createElement:()=>({}),getElementById:get,addEventListener(){}},
    location:{hash:'#OLD',hostname:'127.0.0.1',pathname:'/host',search:''},
    sessionStorage:storage,localStorage:storage,history:{replaceState(){}},
    setTimeout:fn=>{scheduled.push(fn);return scheduled.length;},
    addEventListener:(name,fn)=>{listeners[name]=fn;},
    __imuTestBridge:{setImuEnabled:value=>{toggles.push(value);return true;},resetView(){},imuRotate:(...args)=>rotations.push(args)},
    fetch:async(url,options)=>{
      if(url==='/stream/host-session')return {ok:true,json:async()=>({key:'NEW-'+(++key)})};
      if(expired){expired=false;return {ok:false,status:401,json:async()=>({})};}
      if(unavailable)return {ok:false,status:503,json:async()=>({error:'sensor unavailable'})};
      if(url==='/stream/imu-model')modelCalls++;
      assert.equal(options.headers.Authorization,'Bearer NEW-'+key);
      return {ok:true,status:200,json:async()=>url==='/stream/imu-model'?model:state};
    }
  });
  let source=await readFile(new URL('./imu-input.js',import.meta.url),'utf8');
  source=source.replace("import {streamBridge as bridge} from './app.js';",'const bridge=globalThis.__imuTestBridge;');
  for(const name of ['imu-direction.js','rtc.js'])source=source.replace(`'./${name}'`,JSON.stringify(new URL(name,import.meta.url).href));
  await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  await settle();
  assert.equal(key,1);assert.deepEqual(toggles,[]);assert.equal(get('imuToggle').disabled,true);
  assert.equal(modelCalls,0);assert.match(get('imuStatus').textContent,/터치\/마우스로 계속 실행/);
  const poll=async()=>{const next=scheduled.shift();assert.ok(next);await next();await settle();};
  state=fresh(0);await poll();
  assert.equal(get('imuToggle').disabled,false);assert.deepEqual(toggles,[]);
  get('imuToggle').onclick();assert.deepEqual(toggles,[true]);
  state=fresh(50);await poll();state=fresh(100);await poll();
  assert.equal(rotations.length,1);assert.ok(rotations[0][1]>0);
  state={...fresh(150),age_ms:400};await poll();
  assert.deepEqual(toggles,[true,false]);assert.equal(get('imuToggle').disabled,true);
  state=fresh(200);expired=true;await poll();
  assert.equal(key,2);assert.deepEqual(toggles,[true,false]);assert.equal(get('imuToggle').disabled,false);
  get('imuToggle').onclick();unavailable=true;await poll();
  assert.deepEqual(toggles,[true,false,true,false]);assert.equal(get('imuToggle').disabled,true);
  assert.match(get('imuStatus').textContent,/터치\/마우스로 계속 실행/);
  unavailable=false;state=fresh(300);await poll();
  assert.equal(get('imuToggle').disabled,false);assert.deepEqual(toggles,[true,false,true,false]);
  listeners.beforeunload();await poll();assert.equal(scheduled.length,0);
});
