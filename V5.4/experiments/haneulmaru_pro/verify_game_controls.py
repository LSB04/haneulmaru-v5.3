"""Exercise the actual local renderer through the phone control channel."""
import json,ssl,time,urllib.request
from pathlib import Path
from websockets.sync.client import connect
root=Path(__file__).resolve().parents[2];base='http://127.0.0.1:8810'
def get(path,key=None):return json.load(urllib.request.urlopen(urllib.request.Request(base+'/stream/'+path,headers={'Authorization':'Bearer '+key} if key else {}),timeout=5))
host=get('host-session')['key'];link=get('info',host)['links'][0];key=link['url'].split('#')[1]
trust=ssl.create_default_context(cafile=str(root/'.local-tls/ca-cert.pem'))
result={'physicalPhoneTest':False};seq=0
with connect('wss://'+link['ip']+':8813',ssl=trust,origin='https://'+link['ip']+':8811',compression=None) as ws:
 ws.send(json.dumps({'role':'phone','lane':'control','key':key}));ws.recv(timeout=5)
 def wait_for(predicate,timeout=6):
  deadline=time.monotonic()+timeout; last={}
  while time.monotonic()<deadline:
   message=json.loads(ws.recv(timeout=timeout))
   if message.get('type')=='state':
    last=message
    if predicate(message):return message
  raise AssertionError('Expected renderer state missing: '+json.dumps({'hostHidden':last.get('hostHidden'),'renderError':last.get('renderError'),'scenario':{k:last.get('scenario',{}).get(k) for k in ['time','paused','totals','events']}}))
 def command(**kwargs):
  global seq
  seq+=1;ws.send(json.dumps({'type':'control','seq':seq,**kwargs}))
 ws.send(json.dumps({'type':'ready'}));wait_for(lambda s:True);time.sleep(.3)
 command(mission='game',auto=False,count=200,paused=False)
 s=wait_for(lambda s:s['scenario']['mode']=='game' and s['count']==20)
 result['blueCap20']=sum(a['color']=='blue' for a in s['scenario']['agents'])==20
 before=s['cameraDistance'];command(zoom=.5)
 s=wait_for(lambda s:s['cameraDistance']<before*.7);result['overviewZoom']=s['cameraDistance']<before
 command(count=3,restart=True);wait_for(lambda s:s['count']==3 and s['scenario']['totals']['hits']==0)
 command(spawn=True,spawnColor='red');wait_for(lambda s:any(a['color']=='red' for a in s['scenario']['agents']))
 s=wait_for(lambda s:s['scenario']['totals']['hits']==1)
 result['redConsumesOneBlue']=s['count']==2 and s['scenario']['totals']['blueConsumed']==1 and sum(a['color']=='blue' for a in s['scenario']['agents'])==2
 command(spawn=True,spawnColor='green');wait_for(lambda s:any(a['color']=='green' for a in s['scenario']['agents']));result['greenSpawn']=True
 command(spawn=True,spawnColor='blue');wait_for(lambda s:sum(a['color']=='blue' for a in s['scenario']['agents'])==3);result['blueSpawn']=True
 # Leave a fresh game with the requested maximum and no leftover test events.
 command(count=20,restart=True,auto=True)
 s=wait_for(lambda s:s['scenario']['totals']['hits']==0)
 result['resetBlue20']=sum(a['color']=='blue' for a in s['scenario']['agents'])==20
(root/'output/game-controls-check.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result))
assert all(value for name,value in result.items() if name!='physicalPhoneTest')
