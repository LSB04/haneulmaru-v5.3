"""PC rendered WebRTC mode, separate from 8790 and 8791. Signaling plus authenticated NU40 input."""
import server
import clika_bridge
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit,parse_qs
import secrets,json,threading,subprocess,sys,re,webbrowser,base64,time,argparse,os,ssl,html
from collections import deque
import shutil
from lan_tls import addresses, private_ipv4, issue_server
from nu40_imu import ImuHub
from multidevice_app.phone_imu import PhoneImu
PHONE_IMU=PhoneImu()
IMU=None
MODEL=server.ROOT.parents[1]/"+imu data"/"nu40-imu-direction-training(1).json"
HOST=secrets.token_urlsafe(24);PHONE=secrets.token_urlsafe(24);URL='';LOCK=threading.Lock();MESSAGES=deque(maxlen=256);SEQ=0
PORT=8810;LAN_PORT=8811;DOWNLOAD_PORT=8812;LAN_IPS=[];TELEMETRY={}
LIVE=None
BENCHMARK={}
PREVIEW={'frame':b'', 'at':0., 'wanted':0.}
ASSETS=dict(server.ASSETS)
ASSETS.update({'/'+n:server.ROOT/n for n in ['live-video.js','transport-benchmark.js']})
ASSETS['/lan-preview.js']=server.ROOT/'lan-preview.js'
ASSETS.update({'/'+n:server.ROOT/n for n in ['rtc.js','host-stream.js','receiver.js','receiver.html','clika-panel.js']})
ASSETS.update({'/'+n:server.ROOT/n for n in ['scenario.js','hud.js','game-info.json']})
ASSETS['/android-app.apk']=server.ROOT.parents[1]/'android-usb'/'dist'/'haneulmaru-v54-ar.apk'

ASSETS['/host']=server.ROOT/'index.html';ASSETS['/phone']=server.ROOT/'receiver.html';ASSETS['/']=server.ROOT/'receiver.html'
class Handler(server.Handler):
 def local_host(self):
  origin='http://127.0.0.1:'+str(PORT)
  return (self.client_address[0]=='127.0.0.1' and self.headers.get('Host')=='127.0.0.1:'+str(PORT)
   and self.headers.get('Origin',origin)==origin and self.headers.get('Sec-Fetch-Site','same-origin') in ('same-origin','none')
   and not any(self.headers.get(h) for h in ('CF-Ray','Forwarded','X-Forwarded-For','X-Forwarded-Host')))
 def role(self):
  value=self.headers.get('Authorization','')
  if secrets.compare_digest(value,'Bearer '+HOST):return 'host'
  if secrets.compare_digest(value,'Bearer '+PHONE):return 'phone'
 def send_json(self,status,value):return self.send(status,json.dumps(value).encode(),'application/json')
 def do_GET(self):
  path=urlsplit(self.path).path
  if not self.allowed_client():return self.send_json(403,{'error':'Local network only'})
  if path=='/stream/host-session':
   if not self.local_host():return self.send_json(403,{'error':'PC 로컬 주소에서만 접속할 수 있습니다.'})
   # Only this exact loopback origin may recover a host session; never return CLIKA credentials.
   return self.send_json(200,{'key':HOST})
  if path.startswith('/stream/'):
   role=self.role()
   if not role:return self.send_json(401,{'error':'unauthorized'})
   if path=='/stream/live-info':
    return self.send_json(200,{'url':('ws://127.0.0.1:8814' if role=='host' else 'wss://'+self.headers.get('Host','').split(':')[0]+':8813')})
   if path=='/stream/transport-benchmark':
    if role!='host' or not self.local_host():return self.send_json(403,{})
    return self.send_json(200,{'result':BENCHMARK,'relay':LIVE.stats if LIVE else {}})
   if path=='/stream/preview-demand':
    if role!='host' or not self.local_host():return self.send_json(403,{'error':'local host required'})
    with LOCK:active=time.monotonic()-PREVIEW['wanted']<3
    return self.send_json(200,{'active':active})
   if path=='/stream/preview-frame':
    if role!='phone':return self.send_json(403,{'error':'phone required'})
    with LOCK:
     PREVIEW['wanted']=time.monotonic();fresh=time.monotonic()-PREVIEW['at']<2;frame=PREVIEW['frame'] if fresh else b''
    return self.send(200 if frame else 204,frame,'image/jpeg')
   if path=='/stream/health':return self.send_json(200,{'version':'5.4','transport':'local-wifi','externalSignaling':False})
   if path=='/stream/ai/status':return self.send_json(200,clika_bridge.status())
   if path=='/stream/ai/job':return self.send_json(200,clika_bridge.job_status(parse_qs(urlsplit(self.path).query).get('id',[''])[0]))
   if path=='/stream/telemetry':
    if role!='host' or not self.local_host():return self.send_json(403,{'error':'PC 로컬 렌더러에서만 사용 가능합니다.'})
    with LOCK:value=dict(TELEMETRY)
    return self.send_json(200,value)
   if path in ('/stream/imu','/stream/imu-model'):
    if role!='host' or not self.local_host():return self.send_json(403,{'error':'PC 로컬 렌더러에서만 사용 가능합니다.'})
    if path=='/stream/imu':
     if IMU is None:return self.send_json(503,{'error':'IMU 입력이 비활성화되어 있습니다. (--no-imu)'})
     return self.send_json(200,PHONE_IMU.merge(IMU.snapshot()))
    try:
     model=json.loads(MODEL.read_text(encoding='utf-8-sig'))
     return self.send_json(200,{key:model[key] for key in ('format','schema_version','units','directions','rate_threshold_dps','similarity_threshold')})
    except (OSError,ValueError,KeyError,TypeError):return self.send_json(503,{'error':'IMU 방향 모델 파일을 확인하세요.'})
   if path=='/stream/info' and role=='host':
    url=(URL or 'http://127.0.0.1:'+str(PORT))+'/phone#'+PHONE
    from reportlab.graphics.barcode import qr
    from reportlab.graphics.shapes import Drawing
    from reportlab.graphics import renderSVG
    def qr_data(value):
     code=qr.QrCodeWidget(value);x,y,w,h=code.getBounds();drawing=Drawing(w,h);drawing.add(code)
     return base64.b64encode(renderSVG.drawToString(drawing).encode()).decode()
    links=[]
    for ip in LAN_IPS:
     link=f'https://{ip}:{LAN_PORT}/phone#'+PHONE;install=f'http://{ip}:{DOWNLOAD_PORT}/'
     from urllib.parse import quote
     app_link='haneulmaru53://connect?url='+quote(link,safe='')
     links.append({'ip':ip,'url':link,'install':install,'qr':qr_data(app_link),'installQr':qr_data(install)})
    return self.send_json(200,{'version':'5.4','url':url,'qr':qr_data(url),'links':links,'localOnly':True})
   if path=='/stream/signal':
    try:after=int(parse_qs(urlsplit(self.path).query).get('after',['0'])[0])
    except ValueError:return self.send_json(400,{'error':'cursor'})
    with LOCK:messages=[{'id':i,'message':m} for i,r,m,t in MESSAGES if r!=role and i>after and time.monotonic()-t<300]
    return self.send_json(200,messages)
   return self.send_json(404,{})
  f=ASSETS.get(path)
  if not f or not f.is_file():return self.send(404,b'Not found','text/plain')
  kind={'js':'text/javascript','webmanifest':'application/manifest+json','apk':'application/vnd.android.package-archive'}.get(f.suffix[1:],server.mimetypes.guess_type(f.name)[0] or 'application/octet-stream')
  return self.send(200,f.read_bytes(),kind)
 def do_POST(self):
  global SEQ
  if not self.allowed_client():return self.send_json(403,{'error':'Local network only'})
  role=self.role()
  if not role:return self.send_json(401,{})
  path=urlsplit(self.path).path
  if path=='/stream/transport-benchmark':
   if role!='host' or not self.local_host():return self.send_json(403,{})
   try:
    size=int(self.headers.get('Content-Length','0'))
    if not 0<size<65536:raise ValueError()
    value=json.loads(self.rfile.read(size))
    if not isinstance(value,dict):raise ValueError()
    BENCHMARK.clear();BENCHMARK.update(value)
    folder=server.ROOT.parents[1]/'output';folder.mkdir(exist_ok=True)
    (folder/'transport-benchmark.json').write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
    return self.send_json(200,{'ok':True})
   except (ValueError,TypeError):return self.send_json(400,{})
  if path=='/stream/preview-frame':
   if role!='host' or not self.local_host():return self.send_json(403,{'error':'local host required'})
   try:
    size=int(self.headers.get('Content-Length','0'))
    if not 4<=size<=1048576 or self.headers.get('Content-Type')!='image/jpeg':raise ValueError()
    self.connection.settimeout(5)
    frame=self.rfile.read(size)
    if len(frame)!=size or not frame.startswith(b'\xff\xd8') or not frame.endswith(b'\xff\xd9'):raise ValueError()
   except (ValueError,TimeoutError):return self.send_json(400,{'error':'invalid JPEG frame'})
   with LOCK:PREVIEW.update(frame=frame,at=time.monotonic())
   return self.send_json(200,{'ok':True})
  if path=='/stream/phone-imu':
   if role!='phone':return self.send_json(403,{'error':'phone role required'})
   if IMU is None:return self.send_json(503,{'error':'IMU disabled on PC'})
   try:
    size=int(self.headers.get('Content-Length','0'))
    if not 0<size<=2048:raise ValueError('request too large')
    data=json.loads(self.rfile.read(size))
    return self.send_json(200,PHONE_IMU.accept(data))
   except (ValueError,TypeError):return self.send_json(400,{'error':'invalid, stale or competing sensor sample'})
  if path in ('/stream/ai/request','/stream/telemetry'):
   if path=='/stream/telemetry' and (role!='host' or not self.local_host()):return self.send_json(403,{'error':'PC 로컬 렌더러에서만 사용 가능합니다.'})
   try:
    size=int(self.headers.get('Content-Length','0'))
    if not 0<size<=30000:raise ValueError('요청 크기 오류')
    data=json.loads(self.rfile.read(size))
    if not isinstance(data,dict):raise ValueError('요청 형식 오류')
    if path.endswith('request'):
     if data.get('kind')=='explain':
      with LOCK:data['metrics']=dict(TELEMETRY)
     result=clika_bridge.request(data)
    else:
     value=clika_bridge.metrics_only(data.get('metrics',{}));value['receivedAt']=time.time()
     with LOCK:TELEMETRY.clear();TELEMETRY.update(value)
     result={'ok':True}
    return self.send_json(200,result)
   except (ValueError,TypeError) as e:return self.send_json(400,{'error':str(e)})
  if path!='/stream/signal':return self.send_json(404,{})
  try:
   size=int(self.headers.get('Content-Length','0'))
   if not 0<size<=200000:raise ValueError()
   message=json.loads(self.rfile.read(size))
   if not isinstance(message,dict) or message.get('type') not in ({'offer','ice','preview-state'} if role=='host' else {'ready','answer','ice','preview-ready','preview-control'}):raise ValueError()
   if not isinstance(message.get('session'),str) or not 1<=len(message['session'])<=80:raise ValueError()
  except (ValueError,TypeError):return self.send_json(400,{'error':'invalid signal'})
  with LOCK:SEQ+=1;MESSAGES.append((SEQ,role,message,time.monotonic()))
  return self.send_json(200,{'ok':True})

 def allowed_client(self):
  return self.client_address[0]=='127.0.0.1' or private_ipv4(self.client_address[0])

class DownloadHandler(server.Handler):
 """Plain HTTP serves only the APK/bootstrap, never session keys or APIs."""
 def do_GET(self):
  if not (self.client_address[0]=='127.0.0.1' or private_ipv4(self.client_address[0])):return self.send(403,b'Local only','text/plain')
  path=urlsplit(self.path).path
  if path=='/android-app.apk':
   f=ASSETS[path]
   return self.send(200,f.read_bytes(),'application/vnd.android.package-archive') if f.is_file() else self.send(404,b'Build APK first','text/plain')
  if path!='/':return self.send(404,b'Not found','text/plain')
  page='''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>하늘마루 V5.4 설치</title><style>body{font:18px sans-serif;background:#091721;color:#def;padding:24px;line-height:1.7}a{color:#70ebd2}</style><h1>하늘마루 V5.4</h1><p>인터넷 없이 같은 Wi-Fi에서 연결합니다.</p><p><a href="/android-app.apk" download>V5.4 AR Android 앱 다운로드</a></p><p>설치 후 PC의 연결 QR 주소를 앱에 붙여넣으세요. V5.3 LAN 앱을 업데이트합니다. AR 전환 시 카메라 권한을 허용하세요.</p><p>이 페이지는 설치 파일만 제공합니다. 접속 키와 센서값은 HTTPS로 전송합니다.</p>'''
  return self.send(200,page.encode('utf-8'),'text/html; charset=utf-8')

def start_lan(root,ips,port,download_port):
 cert,key=issue_server(root,ips)
 context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.minimum_version=ssl.TLSVersion.TLSv1_2
 context.load_cert_chain(cert,key)
 secure=ThreadingHTTPServer(('0.0.0.0',port),Handler)
 try:
  secure.socket=context.wrap_socket(secure.socket,server_side=True)
  download=ThreadingHTTPServer(('0.0.0.0',download_port),DownloadHandler)
 except Exception:
  secure.server_close();raise
 for listener in (secure,download):threading.Thread(target=listener.serve_forever,daemon=True).start()
 return [secure,download]
def main():
 global URL,PORT,LAN_PORT,DOWNLOAD_PORT,LAN_IPS,IMU,LIVE
 parser=argparse.ArgumentParser()
 parser.add_argument('--port',type=int,default=8810)
 parser.add_argument('--lan-port',type=int,default=8811)
 parser.add_argument('--download-port',type=int,default=8812)
 parser.add_argument('--lan-ip',help='Preferred private IPv4 address (no external route needed)')
 parser.add_argument('--no-browser',action='store_true')
 parser.add_argument('--local',action='store_true')
 parser.add_argument('--gpu-browser',action='store_true')
 parser.add_argument('--benchmark',action='store_true')
 parser.add_argument('--imu-port')
 parser.add_argument('--ble-address')
 parser.add_argument('--no-imu',action='store_true')
 parser.add_argument('--no-ble',action='store_true')
 args=parser.parse_args();PORT=args.port;LAN_PORT=args.lan_port;DOWNLOAD_PORT=args.download_port
 LAN_IPS=addresses() if not args.local else []
 if args.lan_ip:
  if not private_ipv4(args.lan_ip):parser.error('--lan-ip must be a private IPv4 address')
  LAN_IPS=[args.lan_ip]+[ip for ip in LAN_IPS if ip!=args.lan_ip]
 if not args.local and not LAN_IPS:
  print('No private IPv4 found. Connect PC and phone to the same Wi-Fi/hotspot, then restart. Use --local for PC only.',flush=True);return 1
 try:http=ThreadingHTTPServer(('127.0.0.1',PORT),Handler)
 except OSError:print('Port '+str(PORT)+' occupied. Existing stream server may be running.',flush=True);return 1
 threading.Thread(target=http.serve_forever,daemon=True).start()
 listeners=[]
 try:
  from live_relay import Relay
  LIVE=Relay(HOST,PHONE,f'http://127.0.0.1:{PORT}')
  LIVE.start(server.ROOT.parents[1],LAN_IPS)
  if not args.local:
   listeners=start_lan(server.ROOT.parents[1],LAN_IPS,LAN_PORT,DOWNLOAD_PORT)
   URL=f'https://{LAN_IPS[0]}:{LAN_PORT}'
   print('V5.4 private LAN only; Cloudflare/STUN/TURN are not started.',flush=True)
   for ip in LAN_IPS:print(f'LAN: https://{ip}:{LAN_PORT} | APK: http://{ip}:{DOWNLOAD_PORT}/',flush=True)
  if not args.no_imu:
   try:
    IMU=ImuHub(port=args.imu_port,ble_address=args.ble_address,ble=not args.no_ble)
    IMU.start()
   except Exception:
    if IMU:
     try:IMU.stop()
     except Exception:pass
    IMU=None
    print('Optional IMU unavailable; the game server continues without sensor input.',flush=True)
  host='http://127.0.0.1:'+str(PORT)+'/host'+('?benchmark=compare' if args.benchmark else '')+'#'+HOST
  print('PC: '+host,flush=True)
  if not args.no_browser:
   chrome=next((p for p in [os.path.join(os.environ.get('PROGRAMFILES',''),'Google/Chrome/Application/chrome.exe'),os.path.join(os.environ.get('LOCALAPPDATA',''),'Google/Chrome/Application/chrome.exe')] if os.path.isfile(p)),None)
   if args.gpu_browser and chrome:
    from gpu_browser import launch
    launch(host,server.ROOT.parents[1])
   else:webbrowser.open(host)
  print('Keep the renderer visible. Stop with Ctrl+C. No public tunnel is used.',flush=True)
  threading.Event().wait()
 except KeyboardInterrupt:pass
 finally:
  if LIVE:LIVE.stop()
  for listener in listeners:listener.shutdown();listener.server_close()
  clika_bridge.stop()
  if IMU:IMU.stop()
  http.shutdown();http.server_close()
 return 0
if __name__=='__main__':sys.exit(main())
