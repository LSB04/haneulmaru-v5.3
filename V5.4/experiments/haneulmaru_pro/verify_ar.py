"""Local renderer integration check. Does not claim physical phone/camera testing."""
import io,json,math,ssl,time,urllib.request
from pathlib import Path
from PIL import Image
from websockets.sync.client import connect

root=Path(__file__).resolve().parents[2]
base='http://127.0.0.1:8810/stream/'
def get(path,key=None):
    return json.load(urllib.request.urlopen(urllib.request.Request(base+path,headers={'Authorization':'Bearer '+key} if key else {}),timeout=5))
host=get('host-session')['key'];link=get('info',host)['links'][0];key=link['url'].split('#')[1]
trust=ssl.create_default_context(cafile=str(root/'.local-tls/ca-cert.pem'))
origin='https://'+link['ip']+':8811'
result={'physicalPhoneTest':False,'cameraOnPhoneTest':False}
with connect('wss://'+link['ip']+':8813',ssl=trust,origin=origin,compression=None) as ws:
    ws.send(json.dumps({'role':'phone','lane':'control','key':key}));ws.recv(timeout=5);seq=int(time.time()*1000)
    def command(**kwargs):
        global seq
        seq+=1;ws.send(json.dumps({'type':'control','seq':seq,**kwargs}))
    def wait(pred):
        end=time.monotonic()+12
        while time.monotonic()<end:
            m=json.loads(ws.recv(timeout=10))
            if m.get('type')=='state' and pred(m):
                assert not m.get('renderError'),m.get('renderError')
                return m
        raise AssertionError('State timeout')
    def settled(pred):
        wait(pred)
        # State acknowledgement can precede the next rendered frame.
        return wait(pred)
    def capture(name,expected):
        deadline=time.monotonic()+12;ratio=None;data=b''
        while time.monotonic()<deadline:
            req=urllib.request.Request(origin+'/stream/preview-frame',headers={'Authorization':'Bearer '+key})
            with urllib.request.urlopen(req,context=trust,timeout=4) as response:data=response.read()
            if data:
                im=Image.open(io.BytesIO(data)).convert('RGB');im.thumbnail((160,100))
                pixels=list(im.getdata());ratio=sum(r>190 and b>190 and g<65 for r,g,b in pixels)/len(pixels)
                if (ratio>.9)==expected:
                    (root/'output'/name).write_bytes(data);return ratio
            time.sleep(.2)
        if data:(root/'output/ar-last-frame.jpg').write_bytes(data)
        raise AssertionError('No expected preview; magenta ratio='+str(ratio))
    try:
        command(mission='game',count=20,restart=True)
        wait(lambda m:m['scenario']['mode']=='game')
        command(ar=True,view='chase',selected='SIM-001',paused=True,auto=False)
        first=settled(lambda m:m.get('ar') is True and m['view']=='chase' and m['scenario']['paused'])
        command(selected='SIM-002',view='cockpit')
        second=settled(lambda m:m.get('ar') and m['view']=='cockpit' and m['scenario']['selected']=='SIM-002')
        result['selectedDroneChangesCamera']=first['cameraPosition']!=second['cameraPosition']
        agent=next(a for a in second['scenario']['agents'] if a['id']=='SIM-002')
        result['cockpitAtSelectedDrone']=all(abs(x-y)<1e-7 for x,y in zip(second['cameraPosition'],[agent['x'],agent['y']+2,agent['z']]))
        command(view='overview');settled(lambda m:m.get('ar') and m['view']=='overview')
        result['arMagentaFraction']=capture('ar-stream-check.jpg',True)
        command(ar=False);settled(lambda m:m.get('ar') is False)
        result['virtualMagentaFraction']=capture('ar-virtual-check.jpg',False)
        result['virtualReturn']=True
    finally:command(ar=False,paused=False,auto=True,view='overview')
(root/'output/ar-integration-check.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result))
assert result['selectedDroneChangesCamera'] and result['cockpitAtSelectedDrone']
