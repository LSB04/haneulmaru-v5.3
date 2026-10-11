export function installScenarioControls({spawn,zoom}){
 const colors=document.createElement('div');colors.className='modes';
 for(const [color,label,paint] of [['blue','＋ 파랑','#379aff'],['red','＋ 빨강','#ff526b'],['green','＋ 초록','#54e8a1']]){
  const b=document.createElement('button');b.dataset.spawnColor=color;b.textContent=label;b.style.color=paint;b.onclick=()=>spawn(color);colors.append(b);
 }
 document.getElementById('spawn').parentElement.after(colors);
 const dock=document.createElement('div');dock.className='zoom-dock';dock.setAttribute('aria-label','시점 확대 축소');
 dock.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:48px;z-index:6;display:grid;grid-template-columns:1fr 1fr;gap:4px;max-width:90vw';
 const zoomButtons=[];
 for(const [factor,label,id] of [[.8,'＋ 확대','zoomIn'],[1.25,'− 축소','zoomOut']]){const b=document.createElement('button');b.id=id;b.textContent=label;b.onclick=()=>zoom(factor);b.style.cssText='min-height:44px;min-width:88px;touch-action:manipulation;background:#07232dee';dock.append(b);zoomButtons.push(b);}
 const readout=document.createElement('output');readout.id='zoomReadout';readout.textContent='센서 없이 확대 · 축소';readout.setAttribute('aria-live','polite');readout.style.cssText='grid-column:1/-1;text-align:center;font-size:11px;padding:3px;background:#03151ce8;pointer-events:none;color:#bce9e4';dock.append(readout);
 document.body.append(dock);
 return {zoomMessage(text){readout.textContent=text;},updateZoom(z){if(!z||!Number.isFinite(z.ratio))return;readout.textContent=`${z.label} ${z.ratio.toFixed(2)}×${!z.canIn?' · 최대 확대':!z.canOut?' · 최대 축소':''}`;zoomButtons[0].disabled=!z.canIn;zoomButtons[1].disabled=!z.canOut;},update(state){const blue=state.agents.filter(a=>a.color==='blue'),game=state.mode==='game';
  for(const b of colors.children){b.disabled=!game||state.paused||(b.dataset.spawnColor==='blue'&&blue.length>=20);b.title=b.dataset.spawnColor==='blue'?'기본·추가 파랑 합계 최대 20개':'';}
  const input=document.getElementById('count');input.min=game?'0':'1';input.max=game?String(Math.max(0,20-blue.filter(a=>a.id.startsWith('NEW-')).length)):'200';
 }};
}
