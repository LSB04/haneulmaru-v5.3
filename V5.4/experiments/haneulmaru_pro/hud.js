export const paint={blue:'#379aff',red:'#ff526b',green:'#54e8a1',unknown:'#f5f8ff'};
export const colorNames={blue:'A · 분산 대형',red:'B · 게임 제거',green:'C · 경고 후 퇴장',unknown:'흰색 · 미확인'};
const hudSignatures=new WeakMap();
function changed(element,signature){if(hudSignatures.get(element)===signature)return false;hudSignatures.set(element,signature);return true;}
export function drawRadar(canvas,state){
 const ctx=canvas.getContext('2d'),w=canvas.width,c=w/2,r=c-18;ctx.clearRect(0,0,w,w);ctx.fillStyle='#03171c';ctx.fillRect(0,0,w,w);
 ctx.strokeStyle='#1e626b';ctx.lineWidth=.7;
 for(let i=1;i<=4;i++){ctx.beginPath();ctx.arc(c,c,r*i/4,0,Math.PI*2);ctx.stroke();}
 for(let i=0;i<12;i++){const a=i*Math.PI/6;ctx.beginPath();ctx.moveTo(c,c);ctx.lineTo(c+Math.sin(a)*r,c+Math.cos(a)*r);ctx.stroke();}
 const sweep=state.time*.5;ctx.strokeStyle='#54e8d055';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(c,c);ctx.lineTo(c+Math.sin(sweep)*r,c-Math.cos(sweep)*r);ctx.stroke();
 const scale=r/620;
 for(const e of state.effects||[]){const age=state.time-e.at;ctx.strokeStyle='#ffc76b';if(age<1&&e.from){ctx.beginPath();ctx.moveTo(c+e.from.x*scale,c+e.from.z*scale);ctx.lineTo(c+e.x*scale,c+e.z*scale);ctx.stroke();}else{ctx.fillStyle='#ff526b33';ctx.beginPath();ctx.arc(c+e.x*scale,c+e.z*scale,Math.max(2,e.radius*scale*age),0,Math.PI*2);ctx.fill();ctx.stroke();}}
 for(const a of state.agents||[]){const x=c+a.x*scale,y=c+a.z*scale;ctx.fillStyle=paint[a.color];ctx.beginPath();ctx.arc(x,y,a.id===state.selected?4:2.5,0,Math.PI*2);ctx.fill();if(a.id===state.selected){ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.strokeRect(x-7,y-7,14,14);ctx.font='9px monospace';ctx.fillText(a.id,x+10,y);}}
 ctx.fillStyle='#97e8df';ctx.font='10px monospace';ctx.fillText('N',c-3,11);
}
export function updateHUD(state,catalog){
 const $=id=>document.getElementById(id),a=state.agents.find(a=>a.id===state.selected)||state.agents[0];
 if($('radar'))drawRadar($('radar'),state);
 const counts={blue:0,red:0,green:0,unknown:0};for(const x of state.agents)counts[x.color]++;
 if($('counters')&&changed($('counters'),Object.values(counts).join(',')))$('counters').replaceChildren(...Object.entries(counts).map(([key,n])=>{const el=document.createElement('div');el.className='counter';el.style.color=paint[key];const b=document.createElement('b'),s=document.createElement('span');b.textContent=n;s.textContent={blue:'A / 파랑',red:'B / 빨강',green:'C / 초록',unknown:'미확인'}[key];el.append(b,s);return el;}));
 if($('events')&&changed($('events'),JSON.stringify(state.events.slice(0,6))))$('events').replaceChildren(...state.events.slice(0,6).map(e=>{const li=document.createElement('li');li.style.borderLeftColor=paint[e.color];li.textContent=`${e.at.toFixed(1)}s  ${e.text}`;return li;}));
 if($('simTime'))$('simTime').textContent=String(Math.floor(state.time/60)).padStart(2,'0')+':'+String(Math.floor(state.time%60)).padStart(2,'0');
 if($('missionLabel'))$('missionLabel').textContent=state.mode==='game'?'합성 드론 게임':'드론 시점';
 if($('runLabel'))$('runLabel').textContent=state.paused?'PAUSED':'LIVE SIMULATION';
 if(a){
  if($('objectName'))$('objectName').textContent=a.id;
  if($('focusLabel'))$('focusLabel').textContent=a.id+' / '+colorNames[a.color];
  if($('objectColor')){$('objectColor').textContent=colorNames[a.color]+(a.warningRemaining!=null?' · 퇴장 '+a.warningRemaining.toFixed(1)+'초':'');$('objectColor').style.color=paint[a.color];}
  if($('objectPosition'))$('objectPosition').textContent=`X ${a.x.toFixed(0)} / Y ${a.y.toFixed(0)} / Z ${a.z.toFixed(0)} [SIM]`;
 }else{
  for(const id of ['objectName','focusLabel','objectColor','objectPosition'])if($(id))$(id).textContent=id==='objectName'?'현재 객체 없음':'';
 }
 const select=$('selected');if(select){const signature=state.agents.map(a=>a.id).join(',');if(select.dataset.signature!==signature){select.replaceChildren(...state.agents.map(a=>{const o=document.createElement('option');o.value=o.textContent=a.id;return o;}));select.dataset.signature=signature;}select.value=state.selected;}
}
