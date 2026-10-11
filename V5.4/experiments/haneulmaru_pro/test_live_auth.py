import asyncio,json,ssl,tempfile,unittest
from pathlib import Path
from websockets.asyncio.server import serve
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed,InvalidStatus
from lan_tls import issue_server
from live_relay import Relay

class LiveAuthTests(unittest.IsolatedAsyncioTestCase):
 async def test_tls_auth_roles_and_binary_forwarding(self):
  root=Path(__file__).resolve().parents[2]/'output/test-temp';root.mkdir(parents=True,exist_ok=True)
  with tempfile.TemporaryDirectory(dir=root) as folder:
   cert,key=issue_server(folder,[]);tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);tls.load_cert_chain(cert,key)
   trust=ssl.create_default_context(cafile=str(Path(folder)/'.local-tls/ca-cert.pem'))
   origin='http://127.0.0.1:8810';relay=Relay('host-test','phone-test',origin)
   async with serve(relay.handle,'127.0.0.1',0,ssl=tls,origins=[origin],compression=None,max_size=2*1024*1024) as server:
    url='wss://127.0.0.1:'+str(server.sockets[0].getsockname()[1])
    async with connect(url,ssl=trust,origin=origin) as bad:
     await bad.send(json.dumps({'role':'phone','lane':'video','key':'wrong'}))
     with self.assertRaises(ConnectionClosed):await bad.recv()
    with self.assertRaises(InvalidStatus):
     async with connect(url,ssl=trust,origin='https://evil.invalid'):pass
    async with connect(url,ssl=trust,origin=origin) as host,connect(url,ssl=trust,origin=origin) as phone:
     await host.send(json.dumps({'role':'host','lane':'video','key':'host-test'}));await host.recv()
     await phone.send(json.dumps({'role':'phone','lane':'video','key':'phone-test'}));await phone.recv()
     frame=b'\1'+b'0'*20;await host.send(frame)
     self.assertEqual(await asyncio.wait_for(phone.recv(),2),frame)
     await phone.send(frame)
     with self.assertRaises(ConnectionClosed):await phone.recv()
    self.assertEqual(relay.stats['frames'],1)

if __name__=='__main__':unittest.main()
