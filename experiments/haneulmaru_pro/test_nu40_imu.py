import json
import struct
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from http.server import ThreadingHTTPServer
from unittest.mock import patch
from nu40_imu import ImuHub, BleDecoder, normalize

PACKET=dict(v=1,t_ms=123,ax=.1,ay=-.2,az=1,gx=12.3,gy=-6.1,gz=0)

class InputTests(unittest.TestCase):
    def test_binary_and_fragmented_ble_match_usb(self):
        decoder=BleDecoder()
        raw=struct.pack('<BI6h',1,123,1000,-2000,10000,123,-61,0)
        self.assertEqual(decoder.feed(raw),[PACKET])
        data=json.dumps(PACKET).encode()+b'\n'
        self.assertEqual(decoder.feed(data[:13]),[])
        self.assertEqual(decoder.feed(data[13:]),[PACKET])
        self.assertEqual(decoder.feed(b'x'*9000),[])

    def test_invalid_values_are_not_sensor_samples(self):
        for bad in ({'ready':True},{**PACKET,'gx':float('nan')},{**PACKET,'t_ms':-1},{**PACKET,'gx':True}):
            with self.assertRaises(ValueError):normalize(bad)

    def test_usb_priority_ble_fallback_and_stale_stop(self):
        now=[0.0];hub=ImuHub(clock=lambda:now[0])
        hub.record('USB',PACKET);hub.record('BLE',PACKET)
        self.assertEqual(hub.snapshot()['source'],'USB')
        now[0]=.4;hub.record('BLE',{**PACKET,'t_ms':523})
        self.assertEqual(hub.snapshot()['source'],'BLE')
        now[0]=.5;hub.record('USB',{**PACKET,'t_ms':623})
        self.assertEqual(hub.snapshot()['source'],'USB')
        now[0]=1;self.assertIsNone(hub.snapshot()['sample'])
        self.assertEqual(hub.snapshot()['sources']['BLE']['count'],2)

    def test_disconnect_immediately_invalidates_usb(self):
        hub=ImuHub();hub.record('USB',PACKET);hub.record('BLE',PACKET)
        hub.update_status('USB',False,'unplugged')
        self.assertEqual(hub.snapshot()['source'],'BLE')

    def test_imu_routes_require_host_token(self):
        import stream_server as app
        old_imu,old_port=app.IMU,app.PORT
        app.IMU=ImuHub();app.IMU.record('USB',PACKET)
        server=ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
        app.PORT=server.server_port
        worker=threading.Thread(target=server.serve_forever,daemon=True);worker.start()
        try:
            root=f'http://127.0.0.1:{server.server_port}'
            for path in ('imu','imu-model'):
                for token,status in (('',401),(app.PHONE,403)):
                    with self.assertRaises(HTTPError) as error:urlopen(Request(root+'/stream/'+path,headers={'Authorization':'Bearer '+token}))
                    self.assertEqual(error.exception.code,status)
                with urlopen(Request(root+'/stream/'+path,headers={'Authorization':'Bearer '+app.HOST})) as response:
                    self.assertEqual(response.status,200)
                    value=json.load(response)
                    if path=='imu-model':
                        self.assertEqual(set(value),{'format','schema_version','units','directions','rate_threshold_dps','similarity_threshold'})
                for header in ({'CF-Ray':'tunnel'},{'Origin':'https://example.org'}):
                    with self.assertRaises(HTTPError) as error:
                        urlopen(Request(root+'/stream/'+path,headers={'Authorization':'Bearer '+app.HOST,**header}))
                    self.assertEqual(error.exception.code,403)
            for asset in ('imu-input.js','imu-direction.js'):
                with urlopen(root+'/'+asset) as response:self.assertEqual(response.status,200)
            app.IMU=None
            with self.assertRaises(HTTPError) as error:
                urlopen(Request(root+'/stream/imu',headers={'Authorization':'Bearer '+app.HOST}))
            self.assertEqual(error.exception.code,503)
        finally:
            server.shutdown();server.server_close();worker.join();app.IMU=old_imu;app.PORT=old_port

    def test_optional_sensor_failure_does_not_stop_server(self):
        import stream_server as app
        with patch.object(app,'IMU',None), patch.object(app.sys,'argv',['server','--local','--no-browser']), \
             patch.object(app,'ThreadingHTTPServer') as http, patch.object(app.threading,'Thread'), \
             patch.object(app.threading,'Event') as event, patch.object(app,'ImuHub') as hub, patch('live_relay.Relay') as relay, patch('builtins.print'):
            hub.return_value.start.side_effect=OSError('sensor unavailable')
            event.return_value.wait.side_effect=KeyboardInterrupt
            self.assertEqual(app.main(),0)
            self.assertIsNone(app.IMU)
            hub.return_value.stop.assert_called_once()
            relay.return_value.start.assert_called_once()
            relay.return_value.stop.assert_called_once()
            http.return_value.shutdown.assert_called_once()

    def test_server_lifecycle_local_lan_and_disabled_imu(self):
        import stream_server as app
        # Mock all device, server and process boundaries; never open USB/BLE or a tunnel.
        for flags in (['--local'],[],['--local','--no-imu']):
            with self.subTest(flags=flags), patch.object(app,'IMU',None), patch.object(app,'PORT',8792), patch.object(app,'URL',''), \
                 patch.object(app.sys,'argv',['stream_server.py','--no-browser',*flags]), \
                 patch.object(app,'ThreadingHTTPServer') as http, patch.object(app.threading,'Thread'), \
                 patch.object(app.threading,'Event') as event, patch.object(app,'ImuHub') as hub, \
                 patch.object(app.subprocess,'Popen') as popen, patch.object(app,'addresses',return_value=['192.168.0.129']), \
                 patch.object(app,'start_lan',return_value=[]) as lan, \
                 patch('live_relay.Relay') as relay, patch('builtins.print'):
                event.return_value.wait.side_effect=KeyboardInterrupt
                popen.return_value.stdout=iter([])
                self.assertEqual(app.main(),0)
                relay.return_value.start.assert_called_once()
                relay.return_value.stop.assert_called_once()
                if '--no-imu' in flags:hub.assert_not_called()
                else:
                    hub.return_value.start.assert_called_once()
                    hub.return_value.stop.assert_called_once()
                popen.assert_not_called()
                if '--local' in flags:lan.assert_not_called()
                else:lan.assert_called_once()
                http.return_value.shutdown.assert_called_once()
                http.return_value.server_close.assert_called_once()

if __name__=='__main__':unittest.main()
