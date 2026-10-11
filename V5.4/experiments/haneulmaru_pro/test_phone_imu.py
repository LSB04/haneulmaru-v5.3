import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from unittest.mock import patch
import nu40_imu
from multidevice_app.phone_imu import PhoneImu

PACKET=dict(v=1,t_ms=123,ax=0,ay=0,az=1,gx=20,gy=0,gz=0)
def message(seq=1, **kw):return dict(sender='test-phone',seq=seq,age_ms=0,sample=PACKET,**kw)

class PhoneTests(unittest.TestCase):
    def test_priority_expiry_and_disconnect(self):
        now=[1.0];hub=nu40_imu.ImuHub(clock=lambda:now[0]);phone=PhoneImu(clock=lambda:now[0])
        hub.record('BLE',PACKET);phone.accept(message())
        self.assertEqual(phone.merge(hub.snapshot())['source'],'PHONE_USB')
        hub.record('USB',PACKET)
        self.assertEqual(phone.merge(hub.snapshot())['source'],'USB')
        now[0]+=.4
        self.assertIsNone(phone.merge(hub.snapshot())['sample'])
        phone.accept(message(2));phone.accept(dict(sender='test-phone',seq=3,connected=False))
        self.assertIsNone(phone.merge(hub.snapshot())['sample'])

    def test_replay_and_competing_phone_rejected(self):
        phone=PhoneImu();phone.accept(message())
        for m in (message(),message(0),dict(message(2),sender='other'),dict(message(2),age_ms=999),dict(message(2),sample={**PACKET,'gx':True})):
            with self.assertRaises(ValueError):phone.accept(m)

    def test_phone_write_endpoint_preserves_host_only_reads(self):
        import stream_server as app
        with patch.object(app,'IMU',nu40_imu.ImuHub()),patch.object(app,'PHONE_IMU',PhoneImu()):
            http=ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
            thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
            try:
                base=f'http://127.0.0.1:{http.server_port}'
                with urlopen(base+'/android-app.apk') as r:
                    self.assertEqual(r.headers['Content-Type'],'application/vnd.android.package-archive')
                    self.assertEqual(r.read(2),b'PK')
                def post(key,data):return urlopen(Request(base+'/stream/phone-imu',data=json.dumps(data).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'}))
                for key,status in (('',401),(app.HOST,403)):
                    with self.assertRaises(HTTPError) as err:post(key,message())
                    self.assertEqual(err.exception.code,status)
                with post(app.PHONE,message()) as r:self.assertTrue(json.load(r)['ok'])
                self.assertEqual(app.PHONE_IMU.merge(app.IMU.snapshot())['source'],'PHONE_USB')
                with self.assertRaises(HTTPError) as err:urlopen(Request(base+'/stream/imu',headers={'Authorization':'Bearer '+app.PHONE}))
                self.assertEqual(err.exception.code,403)
                with self.assertRaises(HTTPError) as err:post(app.PHONE,message())
                self.assertEqual(err.exception.code,400)
                with patch.object(app,'IMU',None):
                    with self.assertRaises(HTTPError) as err:post(app.PHONE,message(2))
                    self.assertEqual(err.exception.code,503)
            finally:http.shutdown();http.server_close();thread.join()

if __name__=='__main__':unittest.main()
