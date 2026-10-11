import json, threading, time, unittest
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from unittest.mock import patch
import clika_bridge as ai
import stream_server as app

class LocalAITests(unittest.TestCase):
    def test_license_diagnostic_does_not_expose_raw_log(self):
        raw='credential=secret LICENSE_STATE_BLOCKED: hardware seats are all held by other units'
        self.assertIn('허용 기기 수',ai.license_diagnostic(raw))
        self.assertNotIn('secret',ai.license_diagnostic(raw))
        self.assertIsNone(ai.license_diagnostic('ordinary runtime message'))

    def test_idle_release_does_not_interrupt_active_request(self):
        previous=ai._process;old_state=dict(ai._state)
        with patch.object(ai.threading,'Timer') as timer,patch.object(ai,'stop') as stopped:
            ai._process=object();ai._state['state']='ready'
            try:
                ai._schedule_idle_release();callback=timer.call_args.args[1]
                ai._busy.acquire()
                try:callback();stopped.assert_not_called()
                finally:ai._busy.release()
                callback();stopped.assert_called_once()
            finally:ai._process=previous;ai._state.clear();ai._state.update(old_state);ai._idle_timer=None

    def test_strict_scene_boundaries(self):
        self.assertEqual(ai.parse_scene('```json\n{"count":30,"top":true}\n```'),{'count':30,'top':True})
        for bad in ({'count':True},{'count':201},{'sun':float('nan')},{'speed':3},{'command':'run'},{'target':'real'},{'quality':'other'},[]):
            with self.assertRaises(ValueError):ai.validate_scene(bad)
        for bad in ('no JSON','{"count":30} text'):
            with self.assertRaises(ValueError):ai.parse_scene(bad)

    def test_failed_model_does_not_create_settings(self):
        with patch.object(ai,'converse',return_value={'text':'not json','device':'vulkan:0','gpu':'test','elapsedMs':10}):
            job=ai.request({'kind':'scene','prompt':'30대'})['job']
            for _ in range(100):
                state=ai.job_status(job)
                if state['state']!='running':break
                time.sleep(.01)
            self.assertEqual(state['state'],'error')
            self.assertNotIn('settings',state)

    def test_phone_local_ai_and_removed_credential_endpoint(self):
        http=ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
        thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
        base=f'http://127.0.0.1:{http.server_port}'
        def call(path,body=None,key=app.PHONE):
            return urlopen(Request(base+path,data=None if body is None else json.dumps(body).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'}))
        try:
            for path in ('/manual-controls.js','/control-policy.js'):
                with call(path) as r:self.assertEqual(r.status,200);self.assertIn('javascript',r.headers['Content-Type'])
            for path in ('/stream/ai/status','/stream/ai/job?id=x'):
                with self.assertRaises(HTTPError) as err:call(path,key='invalid')
                self.assertEqual(err.exception.code,401)
            with call('/stream/ai/status') as r:
                result=json.load(r);self.assertTrue(result['local']);self.assertEqual(result['model'],ai.MODEL)
                self.assertNotIn('token',result)
            with self.assertRaises(HTTPError) as err:call('/stream/ai/credential',{'token':'dummy'})
            self.assertEqual(err.exception.code,404)
            with self.assertRaises(HTTPError) as err:call('/stream/telemetry',{'metrics':{}})
            self.assertEqual(err.exception.code,403)
            reply={'text':'{"count":17}','device':'vulkan:0','gpu':'test','elapsedMs':10}
            with patch.object(ai,'converse',return_value=reply):
                with call('/stream/ai/request',{'kind':'scene','prompt':'17대'}) as r:job=json.load(r)['job']
                for _ in range(100):
                    with call('/stream/ai/job?id='+job) as r:result=json.load(r)
                    if result['state']!='running':break
                    time.sleep(.01)
                self.assertEqual(result['result']['settings'],{'count':17})
            for path in ('/model-selection.json','/models/qwen2.5-0.5b-instruct/model.safetensors','/clika_worker.py','/Default_Project_license.txt'):
                with self.assertRaises(HTTPError) as err:call(path)
                self.assertEqual(err.exception.code,404)
        finally:http.shutdown();http.server_close();thread.join()

if __name__=='__main__':unittest.main()
