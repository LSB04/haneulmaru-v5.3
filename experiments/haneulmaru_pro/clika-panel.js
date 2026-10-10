// Same local AI workflow in the PC renderer, phone browser, and Android WebView.
export function installAI(bridge, signal, transport, parent=document.getElementById('panel')) {
 const box=document.createElement('section');box.id='clikaPanel';box.style.cssText='padding:12px;border:1px solid #6fdac5;margin:12px 0';
 box.innerHTML=`<h2>LOCAL + CLIKA</h2><p data-status>로컬 모델 확인 중…</p><p class="muted" data-model>PC에서 추론 · 결과 확인 후 적용</p>
 <textarea data-prompt rows="2" maxlength="500" placeholder="예: 드론 30대, 2D로 변경" style="width:100%;box-sizing:border-box;background:#0b2530;color:#dcfff4;padding:10px"></textarea>
 <div class="modes"><button data-scene>설정 제안</button><button data-explain>성능 설명</button></div>
 <pre data-result style="white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 sans-serif" aria-live="polite"></pre>
 <button data-apply disabled>확인한 설정 적용</button><p class="muted">객체 수·품질·속도·조명·2D/3D·일시정지 설정을 지원합니다.</p>`;
 parent.append(box);
 const find=name=>box.querySelector('[data-'+name+']');let proposal=null,busy=false;
 async function refresh(){try{const s=await signal.api('ai/status');find('model').textContent=`${s.model} · PC 추론 · ${s.idleUnloadSeconds||60}초 미사용 시 GPU 메모리 반환`;find('status').textContent=!s.configured?'PC 라이선스 파일 필요':!s.modelDownloaded?'PC 모델 다운로드 필요':s.ready?`${s.gpu} · ${s.state==='generating'?'응답 생성 중':'준비됨'}`:s.state==='loading'?'PC에서 모델을 불러오는 중…':s.state==='error'?(s.error||'CLIKA 실행 오류'):'첫 요청 시 PC에서 모델 로딩';}catch(e){find('status').textContent=e.message;}}
 function lock(value){busy=value;find('scene').disabled=value;find('explain').disabled=value;find('apply').disabled=value||!proposal||!Object.keys(proposal).length;}
 async function request(kind){
  if(busy)return;proposal=null;lock(true);find('result').textContent='로컬 모델 요청 중…';
  try{
   const {job}=await signal.api('ai/request',{kind,prompt:find('prompt').value});
   const deadline=Date.now()+380000;
   while(Date.now()<deadline){
    await new Promise(r=>setTimeout(r,1000));
    const data=await signal.api('ai/job?id='+encodeURIComponent(job));
    if(data.state==='error')throw Error(data.error);
    if(data.state==='done'){
     const r=data.result;proposal=r.settings||null;
     find('result').textContent=(proposal?JSON.stringify(proposal,null,2)+'\n':'')+r.explanation+`\nCLIKA ${r.device} · 모델 응답 ${r.elapsedMs} ms`;
     return;
    }
    await refresh();
   }
   throw Error('응답 대기 시간 초과. 모델 상태를 확인하세요.');
  }catch(e){find('result').textContent=e.message;}finally{lock(false);refresh();}
 }
 find('scene').onclick=()=>request('scene');find('explain').onclick=()=>request('explain');
 find('apply').onclick=()=>{if(!proposal)return;try{bridge.applyScene(proposal);proposal=null;lock(false);find('result').textContent+='\n설정 적용 요청 완료';}catch(e){find('result').textContent+='\n'+e.message;}};
 refresh();
}
