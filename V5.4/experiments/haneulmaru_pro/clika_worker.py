"""Isolated local model. Native runtime logs never reach HTTP or the terminal."""
import json, os, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def emit(value):
    print('CLIKA_RESULT:' + json.dumps(value, ensure_ascii=True), flush=True)

def main():
    license_path = os.environ.get('CLIKA_RT_LICENSE') or str(Path.home()/'Downloads/Default_Project_license.txt')
    if not Path(license_path).is_file():
        emit({'error':'LICENSE_FILE_MISSING'}); return 1
    os.environ['CLIKA_RT_LICENSE'] = license_path
    try:
        import clika_runtime as crt
        from clika_runtime.modelverse import AutoModelForCausalLM
        choices = [(i, crt.vulkan.get_device_properties(i).name) for i in range(crt.vulkan.device_count())]
        chosen = next(((i,n) for i,n in choices if '2080' in n), None)
        if chosen is None:
            emit({'error':'RTX_2080_NOT_AVAILABLE'}); return 1
        device = 'vulkan:' + str(chosen[0])
        start = time.perf_counter()
        # ClikaRT's Windows native loader needs an ASCII relative model path.
        os.chdir(ROOT)
        config=json.loads((ROOT/'model-selection.json').read_text(encoding='utf-8'))
        model = AutoModelForCausalLM.from_pretrained(config['local_path'], device=device, dtype='float16', max_seq=config.get('max_seq',2048), offline=True)
        emit({'ready':True, 'device':device, 'gpu':chosen[1], 'loadMs':round((time.perf_counter()-start)*1000)})
        for line in sys.stdin:
            try:
                request = json.loads(line)
                start = time.perf_counter()
                reply = model.generate(messages=request['messages'], max_new_tokens=request.get('max_new_tokens',128), temperature=0)
                emit({'text':reply,'elapsedMs':round((time.perf_counter()-start)*1000),'device':device,'gpu':chosen[1]})
            except Exception as exc:
                emit({'error':type(exc).__name__})
    except Exception as exc:
        emit({'error':type(exc).__name__}); return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
