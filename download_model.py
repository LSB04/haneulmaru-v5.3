"""Download the pinned public checkpoint in model-selection.json; verify every file."""
from pathlib import Path
import hashlib,json,urllib.request
ROOT=Path(__file__).resolve().parent
def main():
    cfg=json.loads((ROOT/'model-selection.json').read_text(encoding='utf-8'))
    dest=(ROOT/cfg['local_path']).resolve()
    if not dest.is_relative_to(ROOT/'models'):raise ValueError('Invalid model directory')
    dest.mkdir(parents=True,exist_ok=True)
    for spec in cfg['files']:
        name=spec['name']
        if Path(name).name!=name:raise ValueError('Invalid model file')
        path=dest/name
        if path.is_file():
            with path.open('rb') as f:valid=hashlib.file_digest(f,'sha256').hexdigest()==spec['sha256']
            if valid:print(name+': verified',flush=True);continue
        url=f'https://huggingface.co/{cfg["model"]}/resolve/{cfg["revision"]}/{name}'
        temp=path.with_suffix(path.suffix+'.download');h=hashlib.sha256();total=0;next_log=250_000_000
        with urllib.request.urlopen(url,timeout=90) as response,temp.open('wb') as target:
            while chunk:=response.read(8*1024*1024):
                target.write(chunk);h.update(chunk);total+=len(chunk)
                if total>=next_log:print(f'{name}: {total//1_000_000} MB',flush=True);next_log+=250_000_000
        if h.hexdigest()!=spec['sha256']:raise RuntimeError('SHA-256 mismatch: '+name)
        temp.replace(path);print(name+': verified/downloaded',flush=True)
    print(cfg['model']+' READY',flush=True)
if __name__=='__main__':main()
