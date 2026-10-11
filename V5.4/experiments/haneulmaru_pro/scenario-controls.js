export function installScenarioControls({spawn,zoom}){
 const colors=document.createElement('div');colors.className='modes';
 for(const [color,label,paint] of [['blue','＋ 파랑','#379aff'],['red','＋ 빨강','#ff526b'],['green','＋ 초록','#54e8a1']]){
  const b=document.createElement('button');b.dataset.spawnColor=color;b.textContent=label;b.style.color=paint;b.onclick=()=>spawn(color);colors.append(b);
 }
 document.getElementById('spawn').parentElement.after(colors);
 const dock=document.createElement('div');dock.className='zoom-dock';dock.setAttribute('aria-label','시점 확대 축소');
 dock.style.cssText=`position:fixed;left:50%;transform:translateX(-50%);bottom:${location.pathname.includes('phone')?8:48}px;z-index:6;display:flex;gap:6px`;
 for(const [factor,label] of [[.8,'＋ 확대'],[1.25,'− 축소']]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>zoom(factor);b.style.cssText='min-height:40px;touch-action:manipulation;background:#07232dee';dock.append(b);}
 document.body.append(dock);
 return {update(state){const blue=state.agents.filter(a=>a.color==='blue'),game=state.mode==='game';
  for(const b of colors.children){b.disabled=!game||state.paused||(b.dataset.spawnColor==='blue'&&blue.length>=20);b.title=b.dataset.spawnColor==='blue'?'기본·추가 파랑 합계 최대 20개':'';}
  const input=document.getElementById('count');input.min=game?'0':'1';input.max=game?String(Math.max(0,20-blue.filter(a=>a.id.startsWith('NEW-')).length)):'200';
 }};
}
