import asyncio,json,struct,unittest
from live_relay import Relay

class RelayQueueTests(unittest.IsolatedAsyncioTestCase):
 async def test_overload_discards_dependent_frames_and_requests_keyframe(self):
  relay=Relay('h','p','http://127.0.0.1:8800')
  video=asyncio.Queue(maxsize=2);control=asyncio.Queue(maxsize=16)
  relay.clients={('phone','video'):(None,video),('host','control'):(None,control)}
  delta=b'\0'+b'0'*13;key=b'\1'+b'0'*13
  relay.needs_key=False
  relay.put('phone','video',delta);relay.put('phone','video',delta);relay.put('phone','video',delta)
  self.assertTrue(video.empty());self.assertTrue(relay.needs_key)
  self.assertEqual(json.loads(control.get_nowait()[1])['type'],'keyframe')
  relay.put('phone','video',key)
  self.assertEqual(video.get_nowait()[1],key)
 async def test_old_frames_never_sent(self):
  class Connection:
   def __init__(self):self.sent=[]
   async def send(self,message):self.sent.append(message)
  relay=Relay('h','p','o');q=asyncio.Queue();c=Connection()
  q.put_nowait((0,b'\1'+b'0'*13))
  task=asyncio.create_task(relay.writer(c,q,'video'))
  await asyncio.sleep(.01);task.cancel()
  self.assertEqual(c.sent,[]);self.assertEqual(relay.stats['dropped'],1)

if __name__=='__main__':unittest.main()
