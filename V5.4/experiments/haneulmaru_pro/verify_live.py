"""Same-PC LAN-TLS integration probe. Never a physical-phone performance claim."""
import json,ssl,time,urllib.request,subprocess,threading
from pathlib import Path
from websockets.sync.client import connect
root=Path(__file__).resolve().parents[2];base='http://127.0.0.1:8810'
def api(path,key=None):
 req=urllib.request.Request(base+'/stream/'+path,headers={'Authorization':'Bearer '+key} if key else {})
 return json.load(urllib.request.urlopen(req,timeout=5))
host=api('host-session')['key'];info=api('info',host);link=info['links'][0];key=link['url'].split('#')[1]
url='wss://'+link['ip']+':8813';origin='https://'+link['ip']+':8811'
trust=ssl.create_default_context(cafile=str(root/'.local-tls/ca-cert.pem'))
result={'physicalPhoneTest':False,'tlsVerified':True,'viewControlAcknowledged':False,'frames':0,'keyframes':0,'gpuSamples':[]}
done=threading.Event()
def sample():
 while not done.is_set():
  p=subprocess.run(['nvidia-smi','--query-gpu=utilization.gpu,utilization.encoder,utilization.decoder,memory.used','--format=csv,noheader,nounits'],capture_output=True,text=True,creationflags=subprocess.CREATE_NO_WINDOW)
  result['gpuSamples'].append(p.stdout.strip());done.wait(1)
t=threading.Thread(target=sample,daemon=True);t.start()
try:
 with connect(url,ssl=trust,origin=origin,compression=None,max_size=2*1024*1024) as control,connect(url,ssl=trust,origin=origin,compression=None,max_size=2*1024*1024) as video:
  for ws,lane in ((control,'control'),(video,'video')):
   ws.send(json.dumps({'role':'phone','lane':lane,'key':key}));ws.recv(timeout=5)
  control.send(json.dumps({'type':'ready'}));time.sleep(.5)
  control.send(json.dumps({'type':'control','seq':100,'view':'map','aspect':16/9,'streamKey':'fast'}))
  until=time.monotonic()+4
  while time.monotonic()<until:
   m=json.loads(control.recv(timeout=4))
   if m.get('type')=='state' and m.get('view')=='map':result['viewControlAcknowledged']=True;break
  control.send(json.dumps({'type':'control','seq':101,'view':'chase'}))
  warmup=time.monotonic()
  while time.monotonic()-warmup<2:video.recv(timeout=5)
  started=time.monotonic()
  while time.monotonic()-started<10:
   packet=video.recv(timeout=5)
   if isinstance(packet,bytes):result['frames']+=1;result['keyframes']+=packet[0]==1
  result['receivedPacketFps']=result['frames']/(time.monotonic()-started)
finally:done.set();t.join(timeout=3)
(root/'output/live-tls-check.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result))
