// The phone displays the host's zoom, never a locally guessed success value.
export function createZoomFeedback({show,render,schedule=setTimeout,cancel=clearTimeout}){
 let pending=null,firstPending=0,lastAck=-1,timer=null,error='',latest=null;
 function clearTimer(){if(timer!==null){cancel(timer);timer=null;}}
 function paint(){if(latest)render(latest);if(error)show(error);else if(pending!==null)show(latest?`PC ${latest.label} ${latest.ratio.toFixed(2)}× · 적용 확인 중`:'확대·축소 · PC 적용 확인 중');}
 function arm(){clearTimer();timer=schedule(()=>{timer=null;error='PC 응답 없음 · 다시 연결하세요';paint();},2000);}
 function sent(seq){
  if(!Number.isSafeInteger(seq)){clearTimer();pending=null;error='조작 연결 없음 · PC 연결 시작';paint();return;}
  error='';if(pending===null)firstPending=seq;pending=seq;
  if(timer===null)arm();
  paint();
 }
 return {sent,state(d){
  if(d.zoomState)latest=d.zoomState;
  const ack=d.lastControlSeq;
  if(pending!==null&&Number.isSafeInteger(ack)&&ack>=firstPending&&ack>lastAck){
   lastAck=ack;error='';
   if(ack>=pending){pending=null;clearTimer();}else arm();
  }
  paint();
 },reset(){pending=null;lastAck=-1;error='';clearTimer();paint();},destroy(){clearTimer();}};
}
