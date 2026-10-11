import contextlib, json, ssl, tempfile, threading, unittest, urllib.request, urllib.error
from pathlib import Path
from http.server import ThreadingHTTPServer
from unittest.mock import patch
from cryptography import x509
from lan_tls import private_ipv4, ensure_ca, issue_server
import stream_server as app

class LanTests(unittest.TestCase):
 def test_address_policy(self):
  for ip in ('192.168.137.1','10.2.3.4','172.31.1.1'):self.assertTrue(private_ipv4(ip))
  for ip in ('8.8.8.8','127.0.0.1','172.32.0.1','192.168.1.2.evil.com','0.0.0.0','::1'):self.assertFalse(private_ipv4(ip))

 def test_tls_signaling_imu_and_privilege_boundaries(self):
  temp_root=Path(__file__).resolve().parents[2]/'output/test-temp';temp_root.mkdir(parents=True,exist_ok=True)
  with tempfile.TemporaryDirectory(dir=temp_root) as d:
   root=Path(d);cert,key=issue_server(root,['192.168.137.1'])
   ca=(root/'.local-tls/ca-cert.pem').read_bytes()
   issue_server(root,['192.168.0.129'])
   self.assertEqual(ca,(root/'.local-tls/ca-cert.pem').read_bytes())
   leaf=x509.load_pem_x509_certificate(cert.read_bytes())
   self.assertIn('192.168.0.129',[str(a) for a in leaf.extensions.get_extension_for_class(x509.SubjectAlternativeName).value.get_values_for_type(x509.IPAddress)])
   context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.load_cert_chain(cert,key)
   pc=ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
   lan=ThreadingHTTPServer(('127.0.0.1',0),app.Handler);lan.socket=context.wrap_socket(lan.socket,server_side=True)
   download=ThreadingHTTPServer(('127.0.0.1',0),app.DownloadHandler)
   app.PORT=pc.server_port;app.LAN_PORT=lan.server_port;app.LAN_IPS=['192.168.0.129']
   for listener in (pc,lan,download):threading.Thread(target=listener.serve_forever,daemon=True).start()
   trust=ssl.create_default_context(cafile=str(root/'.local-tls/ca-cert.pem'))
   def request(base,path,token=None,data=None,ctx=trust):
    headers={'Authorization':'Bearer '+token} if token else {}
    req=urllib.request.Request(base+path,headers=headers,data=json.dumps(data).encode() if data is not None else None)
    with urllib.request.urlopen(req,context=ctx,timeout=5) as r:return r.status,r.read()
   base=f'https://127.0.0.1:{lan.server_port}';local=f'http://127.0.0.1:{pc.server_port}'
   try:
    self.assertEqual(request(base,'/stream/health',app.PHONE)[0],200)
    # The fallback must use the same authenticated TLS path and enforce roles.
    app.PREVIEW.update(frame=b'',at=0.,wanted=0.)
    self.assertEqual(request(base,'/stream/preview-frame',app.PHONE)[0],204)
    self.assertTrue(json.loads(request(local,'/stream/preview-demand',app.HOST)[1])['active'])
    frame=b'\xff\xd8test-frame\xff\xd9'
    def upload(token,payload=frame,origin=local,size=None):
     req=urllib.request.Request(origin+'/stream/preview-frame',data=payload,headers={'Authorization':'Bearer '+token,'Content-Type':'image/jpeg','Content-Length':str(len(payload) if size is None else size)})
     with urllib.request.urlopen(req,context=trust,timeout=5) as r:return r.status
    self.assertEqual(upload(app.HOST),200)
    self.assertEqual(request(base,'/stream/preview-frame',app.PHONE),(200,frame))
    for token,origin,expected in ((app.PHONE,base,403),(app.HOST,base,403)):
     with self.assertRaises(urllib.error.HTTPError) as e:upload(token,origin=origin)
     self.assertEqual(e.exception.code,expected)
    with self.assertRaises(urllib.error.HTTPError) as e:upload(app.HOST,b'not-jpeg')
    self.assertEqual(e.exception.code,400)
    with self.assertRaises(urllib.error.HTTPError) as e:upload(app.HOST,size=1048577)
    self.assertEqual(e.exception.code,400)
    app.PREVIEW['at']=0.
    self.assertEqual(request(base,'/stream/preview-frame',app.PHONE)[0],204)
    for kind in ('preview-ready','preview-control'):
     self.assertEqual(request(base,'/stream/signal',app.PHONE,{'type':kind,'session':'fallback-test','control':{'seq':1,'view':'map'}})[0],200)
    with self.assertRaises(urllib.error.HTTPError) as e:request(base,'/stream/signal',app.PHONE,{'type':'preview-state','session':'spoof'})
    self.assertEqual(e.exception.code,400)
    with self.assertRaises(urllib.error.URLError):request(base,'/phone',ctx=ssl.create_default_context())
    for path in ('/stream/health','/stream/ai/status'):
     with self.assertRaises(urllib.error.HTTPError) as e:request(base,path)
     self.assertEqual(e.exception.code,401)
    self.assertEqual(request(local,'/stream/host-session')[0],200)
    with self.assertRaises(urllib.error.HTTPError) as e:request(base,'/stream/host-session')
    self.assertEqual(e.exception.code,403)
    with self.assertRaises(urllib.error.HTTPError) as e:request(base,'/stream/imu',app.PHONE)
    self.assertEqual(e.exception.code,403)
    self.assertEqual(request(base,'/stream/signal',app.PHONE,{'type':'ready','session':'lan-test'})[0],200)
    messages=json.loads(request(local,'/stream/signal',app.HOST)[1]);self.assertEqual(messages[-1]['message']['session'],'lan-test')
    with patch.object(app,'IMU',object()):
     packet={'sender':'lan-test','seq':1,'age_ms':0,'sample':{'v':1,'t_ms':100,'ax':0,'ay':0,'az':1,'gx':2,'gy':3,'gz':4}}
     self.assertEqual(request(base,'/stream/phone-imu',app.PHONE,packet)[0],200)
    with patch.object(app.clika_bridge,'request',return_value={'job':'test-job'}):
     self.assertEqual(json.loads(request(base,'/stream/ai/request',app.PHONE,{'kind':'scene','prompt':'드론 40개'})[1]),{'job':'test-job'})
    with self.assertRaises(urllib.error.HTTPError) as e:request(f'http://127.0.0.1:{download.server_port}','/stream/host-session')
    self.assertEqual(e.exception.code,404)
   finally:
    for listener in (pc,lan,download):listener.shutdown();listener.server_close()

if __name__=='__main__':unittest.main()
