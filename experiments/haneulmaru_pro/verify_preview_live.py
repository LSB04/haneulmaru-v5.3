"""Real Chrome frame -> local server -> verified LAN TLS; no tokens logged."""
import json,ssl,time,hashlib,io
from verify_lan_live import read,ROOT
from PIL import Image,ImageStat

host=json.loads(read('http://127.0.0.1:8800/stream/host-session'))['key']
info=json.loads(read('http://127.0.0.1:8800/stream/info',host))
url,key=info['links'][0]['url'].split('#');base=url.removesuffix('/phone')
trust=ssl.create_default_context(cafile=str(ROOT/'.local-tls/ca-cert.pem'))
session='preview-live-check'
read(base+'/stream/signal',key,{'type':'preview-ready','session':session},trust)
frames=[];deadline=time.monotonic()+15
while time.monotonic()<deadline and len(frames)<6:
 data=read(base+'/stream/preview-frame',key,context=trust)
 if data:
  picture=Image.open(io.BytesIO(data));picture.load()
  frames.append({'sha':hashlib.sha256(data).hexdigest(),'size':picture.size,'variation':max(ImageStat.Stat(picture).stddev),'bytes':len(data)})
 time.sleep(.25)
read(base+'/stream/signal',key,{'type':'preview-control','session':session,'control':{'seq':1,'view':'map'}},trust)
time.sleep(1)
messages=json.loads(read(base+'/stream/signal?after=0',key,context=trust))
states=[x['message']['state'] for x in messages if x['message'].get('type')=='preview-state' and x['message'].get('session')==session]
result={'tlsVerified':True,'framesReceived':len(frames),'distinctFrames':len({f['sha'] for f in frames}),'nonBlank':bool(frames) and all(f['variation']>5 for f in frames),'sizes':[list(f['size']) for f in frames],'controlMapAcknowledged':any(s.get('view')=='map' for s in states),'actualPhoneTest':False}
read(base+'/stream/signal',key,{'type':'preview-control','session':session,'control':{'seq':2,'view':'chase'}},trust)
(ROOT/'output/https-preview-check.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result));raise SystemExit(0 if result['nonBlank'] and result['controlMapAcknowledged'] else 1)
