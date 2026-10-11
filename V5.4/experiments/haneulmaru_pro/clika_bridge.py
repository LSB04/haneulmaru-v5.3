"""Text-only local scene assistant. No cloud inference, credentials in PC files only."""
import json, math, os, queue, secrets, subprocess, sys, threading, time
from pathlib import Path
from scene_prompt import SCENE_SYSTEM
ROOT = Path(__file__).resolve().parents[2]
CONFIG = json.loads((ROOT/'model-selection.json').read_text(encoding='utf-8'))
MODEL = CONFIG['model']
_busy = threading.Lock()
_lock = threading.RLock()
_process = None
_messages = None
_jobs = {}
_idle_timer = None
_state = {'ready':False, 'state':'idle', 'device':None, 'gpu':None}

def validate_scene(value):
    if not isinstance(value, dict) or set(value) - {'count','quality','speed','sun','top','paused'}:
        raise ValueError('허용되지 않은 장면 설정입니다.')
    for key, item in value.items():
        valid = False
        if key == 'count': valid = type(item) is int and 1 <= item <= 200
        elif key == 'quality': valid = isinstance(item,str) and item in ('low','balanced','high','ultra')
        elif key == 'speed': valid = type(item) in (int,float) and item in (.25,1,2)
        elif key == 'sun': valid = type(item) in (int,float) and math.isfinite(item) and 10 <= item <= 80
        elif key in ('top','paused'): valid = type(item) is bool
        if not valid: raise ValueError('장면 설정 범위를 벗어났습니다: '+key)
    return value

def metrics_only(value):
    if not isinstance(value,dict): raise ValueError('성능 지표 형식 오류')
    allowed = {'meanFps','p95FrameMs','width','height','frames','count','quality','gpu','software','fps','mbps','encodeMs','reason','encoder'}
    result = {}
    for key,item in value.items():
        if key not in allowed: continue
        if isinstance(item,str): result[key]=item[:240]
        elif type(item) is bool: result[key]=item
        elif type(item) in (int,float) and math.isfinite(item): result[key]=item
    return result


def status():
    license_path = os.environ.get('CLIKA_RT_LICENSE') or str(Path.home()/'Downloads/Default_Project_license.txt')
    with _lock:
        return {**_state, 'model':MODEL, 'engine':'ClikaRT 0.6.4', 'configured':Path(license_path).is_file(),
                'modelDownloaded':all((ROOT/CONFIG['local_path']/f['name']).is_file() for f in CONFIG['files']),
                'idleUnloadSeconds':60,'maxSeq':CONFIG.get('max_seq',2048),
                'local':True, 'busy':_busy.locked()}

def _reader(process, messages):
    try:
        for line in process.stdout:
            if line.startswith('CLIKA_RESULT:'):
                try: messages.put(json.loads(line[len('CLIKA_RESULT:'):]))
                except ValueError: pass
    finally: messages.put({'error':'WORKER_EXITED'})

def license_diagnostic(line):
    # Only a fixed diagnostic is exposed, never raw SDK output or credentials.
    if 'LICENSE_STATE_BLOCKED' in line and 'hardware seats' in line:
        return 'CLIKA 라이선스의 허용 기기 수가 모두 사용 중입니다. 조직 관리자에게 이 PC의 기기 할당을 확인해 달라고 요청하세요.'
    if 'license invalid' in line.lower():
        return 'CLIKA 라이선스 인증이 거부됐습니다. 유효한 라이선스와 오프라인 사용 권한을 확인하세요.'
    return None

def _diagnostic_reader(process):
    for line in process.stderr:
        issue=license_diagnostic(line)
        if issue:
            with _lock:
                if _process is process:_state['licenseIssue']=issue

def stop():
    global _process,_idle_timer
    with _lock:
        if _idle_timer:_idle_timer.cancel();_idle_timer=None
        p=_process; _process=None
        _state.update(ready=False,state='idle')
        if p and p.poll() is None:
            p.terminate()
            try:p.wait(timeout=5)
            except subprocess.TimeoutExpired:p.kill();p.wait()

def _schedule_idle_release():
    global _idle_timer
    with _lock:
        if _idle_timer:_idle_timer.cancel()
        process=_process
        if process is None:return
        def release():
            if not _busy.acquire(blocking=False):return
            try:
                with _lock:
                    if _process is process and _state['state']=='ready':stop()
            finally:_busy.release()
        _idle_timer=threading.Timer(60,release);_idle_timer.daemon=True;_idle_timer.start()

def _receive(timeout):
    try: result=_messages.get(timeout=timeout)
    except queue.Empty:
        stop(); raise ValueError('로컬 모델 응답 시간 초과. 다시 요청하세요.') from None
    if result.get('error'):
        code=result['error']
        with _lock:message=_state.get('licenseIssue') or ('CLIKA 실행 오류: '+code+' · SDK, 라이선스 파일, RTX 연결을 확인하세요.')
        stop()
        with _lock:_state.update(state='error',error=message)
        raise ValueError(message)
    return result

def _start():
    global _process,_messages
    with _lock:
        if _process is not None and _process.poll() is None and _state['ready']:return
        stop()
        if not status()['configured']:raise ValueError('PC의 CLIKA 라이선스 파일이 필요합니다. 먼저읽기.txt를 확인하세요.')
        if not status()['modelDownloaded']:raise ValueError('PC에서 download_model.py를 먼저 실행하세요.')
        _state.update(ready=False,state='loading',error=None,licenseIssue=None)
        _messages=queue.Queue()
        _process=subprocess.Popen([sys.executable,'-u',str(Path(__file__).with_name('clika_worker.py'))],
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
            text=True,encoding='utf-8',errors='replace',
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform=='win32' else 0)
        threading.Thread(target=_reader,args=(_process,_messages),daemon=True).start()
        threading.Thread(target=_diagnostic_reader,args=(_process,),daemon=True).start()
    ready=_receive(180)
    if not ready.get('ready'):stop();raise ValueError('모델 준비 응답 오류')
    with _lock:_state.update(ready=True,state='ready',device=ready['device'],gpu=ready['gpu'],loadMs=ready['loadMs'])

def converse(system,prompt,max_tokens):
    _start()
    payload={'messages':[{'role':'system','content':system},{'role':'user','content':prompt}],'max_new_tokens':max_tokens}
    try:_process.stdin.write(json.dumps(payload,ensure_ascii=True)+'\n');_process.stdin.flush()
    except (BrokenPipeError,OSError):stop();raise ValueError('CLIKA 작업이 종료되었습니다. 다시 요청하세요.') from None
    with _lock:_state['state']='generating'
    reply=_receive(180)
    with _lock:_state['state']='ready'
    return reply

def parse_scene(raw):
    raw=raw.strip()
    if raw.startswith('```'):
        raw=raw.split('\n',1)[-1].rsplit('```',1)[0].strip()
    try:settings=json.loads(raw)
    except ValueError:raise ValueError('모델이 올바른 JSON을 만들지 못했습니다. 짧고 구체적으로 다시 요청하세요.') from None
    # Accept the explicit settings wrapper as well as the requested flat object.
    if isinstance(settings,dict) and set(settings)=={'settings'}:settings=settings['settings']
    return validate_scene(settings)

def request(data):
    if not isinstance(data,dict) or data.get('kind') not in ('scene','explain'):raise ValueError('지원하지 않는 요청')
    if data['kind']=='scene':
        prompt=data.get('prompt')
        if not isinstance(prompt,str) or not 1<=len(prompt.strip())<=500:raise ValueError('장면 설정을 1~500자로 입력하세요.')
    else:
        data={**data,'metrics':metrics_only(data.get('metrics',{}))}
        if not data['metrics']:raise ValueError('PC에서 성능을 측정하거나 영상 연결 후 다시 요청하세요.')
    if not _busy.acquire(blocking=False):raise ValueError('앞선 로컬 AI 요청을 처리 중입니다.')
    job=secrets.token_urlsafe(16)
    with _lock:
        if len(_jobs)>=8:_jobs.pop(next(iter(_jobs)))
        _jobs[job]={'state':'running'}
    def run():
        try:
            if data['kind']=='scene':
                system=SCENE_SYSTEM
                reply=converse(system,data['prompt'],96)
                settings=parse_scene(reply['text'])
                result={'settings':settings,'explanation':'설정 제안입니다. 아래 값을 확인한 뒤 적용하세요.' if settings else '지원되는 장면 설정이 없습니다.'}
            else:
                system='아래 합성 그래픽 성능 지표를 한국어로 짧게 설명하세요. 제공된 숫자만 사용하세요. 3문장 이내로 답하세요. meanFps는 렌더링 FPS이며 CUDA 속도나 카메라 지연이 아닙니다. 없는 측정값은 모른다고 하세요. 비교 데이터 없이 성능이 향상됐다고 말하지 마세요.'
                reply=converse(system,json.dumps(data['metrics'],ensure_ascii=False),128)
                result={'explanation':reply['text'][:3000]}
            result.update(model=MODEL,engine='ClikaRT',device=reply['device'],gpu=reply['gpu'],elapsedMs=reply['elapsedMs'])
            with _lock:_jobs[job]={'state':'done','result':result}
        except ValueError as exc:
            with _lock:_jobs[job]={'state':'error','error':str(exc)}
        except Exception:
            stop()
            with _lock:_jobs[job]={'state':'error','error':'로컬 모델 실행 실패. SDK와 모델 설치를 확인하세요.'}
        finally:_busy.release();_schedule_idle_release()
    threading.Thread(target=run,daemon=True).start()
    return {'job':job}

def job_status(job):
    with _lock:return dict(_jobs.get(job,{'state':'error','error':'요청이 만료되었습니다.'}))
