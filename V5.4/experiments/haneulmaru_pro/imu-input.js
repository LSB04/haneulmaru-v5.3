import {streamBridge as bridge} from './app.js';
import {DirectionInput, labels} from './imu-direction.js';
import {signaling} from './rtc.js';

const panel=document.createElement('section');
panel.className='imu-panel';
panel.innerHTML='<b>NUCODE · IMU</b><p id="imuStatus" role="status">연결 확인 중</p><p id="imuDirection" class="imu-direction">대기</p><div class="modes"><button id="imuToggle" disabled>연결 준비 중</button><button id="imuCenter">시점 초기화</button></div><label>회전 감도 <output id="imuGainText">1.0×</output><input id="imuGain" type="range" min="0.2" max="2" step="0.1" value="1"></label><p class="muted">USB 우선 · BLE 연결 유지<br>학습한 상하좌우 움직임으로 시점을 회전합니다.</p>';
document.getElementById('panel').prepend(panel);
const $=id=>document.getElementById(id);
const signal=signaling('host');
const api=path=>signal.api(path,undefined,2000);
let classifier, enabled=false, hasFreshSample=false, lastDirectionAt=0, stopped=false;
function setEnabled(value) {
  if(value&&!hasFreshSample)return;
  if(value===enabled)return;
  if(bridge.setImuEnabled(value)===false){$('imuStatus').textContent='공간 AR을 종료한 뒤 IMU를 시작하세요.';return;}
  enabled=value; classifier?.reset();
  $('imuToggle').textContent=value?'IMU 중지':'IMU 시작';
  $('imuDirection').textContent=value?'대기':'중지';
}
$('imuToggle').onclick=()=>setEnabled(!enabled);
$('imuCenter').onclick=()=>{bridge.resetView();classifier?.reset();$('imuDirection').textContent=enabled?'대기':'중지';};
$('imuGain').oninput=()=>$('imuGainText').textContent=Number($('imuGain').value).toFixed(1)+'×';
async function poll() {
  if(stopped)return;
  let delay=40;
  try {
    const state=await api('imu');
    const usb=state.sources.USB,ble=state.sources.BLE;
    $('imuStatus').title='USB: '+usb.message+' / BLE: '+ble.message+' / 휴대폰: '+(state.sources.PHONE_USB?.message||'대기');
    hasFreshSample=!!state.sample&&!!state.source&&Number.isFinite(state.age_ms)&&state.age_ms>=0&&state.age_ms<=350;
    if(!hasFreshSample){
      setEnabled(false);classifier?.reset();delay=500;
      $('imuToggle').disabled=true;$('imuToggle').textContent='센서 미인식';
      $('imuStatus').textContent='센서 미인식 · 터치/마우스로 계속 실행 중';
      $('imuDirection').textContent='센서 조작 꺼짐';
      return;
    }
    $('imuStatus').textContent=state.source+' 수신 중 · '+(enabled?'센서 시점 조작 중':'IMU 시작을 누르면 시점 조작')+' · BLE '+(ble.fresh?'수신 유지':ble.connected?'연결됨':'연결 대기');
    if(!classifier) {
      classifier=new DirectionInput(await api('imu-model'));
      $('imuToggle').textContent='IMU 시작';
    }
    $('imuToggle').disabled=!hasFreshSample;
    $('imuToggle').textContent=enabled?'IMU 중지':'IMU 시작';
    const motion=classifier.consume(state,Number($('imuGain').value));
    if(enabled&&motion&&!document.hidden) {
      bridge.imuRotate(motion.yaw,motion.pitch);
      $('imuDirection').textContent=labels[motion.key];lastDirectionAt=performance.now();
    } else if(enabled&&(!state.sample||performance.now()-lastDirectionAt>180)) $('imuDirection').textContent='대기';
  } catch(error) {
    hasFreshSample=false;setEnabled(false);$('imuToggle').disabled=true;delay=1000;
    classifier?.reset();$('imuStatus').textContent='센서 사용 불가 · 터치/마우스로 계속 실행 중';
    $('imuStatus').title=error.message;$('imuToggle').textContent='센서 조작 꺼짐';$('imuDirection').textContent='자동 복귀 완료';
  } finally {if(!stopped)setTimeout(poll,delay);}
}
document.addEventListener('visibilitychange',()=>classifier?.reset());
addEventListener('beforeunload',()=>{stopped=true;signal.stop();});
poll();
