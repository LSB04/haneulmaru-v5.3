"""Authenticated private-LAN encoded-video relay. No cloud, codec, or model here.

Two sockets separate control from video. Bounded queues discard stale GOPs;
the encoder must respond with a keyframe before delta forwarding resumes.
"""
import asyncio, json, secrets, ssl, threading, time
from websockets.asyncio.server import serve
from lan_tls import private_ipv4, issue_server

class Relay:
    def __init__(self, host_key, phone_key, origin):
        self.keys={'host':host_key,'phone':phone_key}; self.origin=origin
        self.clients={}; self.config=None; self.needs_key=True
        self.stats={'frames':0,'bytes':0,'dropped':0,'connections':0}
    def put(self, role, lane, message):
        peer=self.clients.get((role,lane))
        if not peer:return
        q=peer[1]
        if q.full():
            while not q.empty():q.get_nowait()
            if lane=='video':
                self.needs_key=True; self.stats['dropped']+=1
                self.put('host','control',json.dumps({'type':'keyframe'}))
                # No dependent frame survives queue truncation.
                if not isinstance(message,bytes) or message[0]!=1:return
                self.needs_key=False
        q.put_nowait((time.monotonic(),message))
    async def writer(self, conn, q, lane):
        while True:
            at,message=await q.get()
            if lane=='video' and time.monotonic()-at>.2:
                self.needs_key=True;self.stats['dropped']+=1
                self.put('host','control',json.dumps({'type':'keyframe'}));continue
            if lane=='video' and self.needs_key:
                if not isinstance(message,bytes) or message[0]!=1:continue
                self.needs_key=False
            await asyncio.wait_for(conn.send(message),timeout=1)
    async def handle(self, conn):
        identity=None; writer=None
        try:
            ip=conn.remote_address[0]
            if ip!='127.0.0.1' and not private_ipv4(ip):return await conn.close(1008,'Local only')
            raw=await asyncio.wait_for(conn.recv(),5)
            if not isinstance(raw,str) or len(raw)>1024:raise ValueError('auth')
            auth=json.loads(raw);role=auth.get('role');lane=auth.get('lane')
            if role not in self.keys or lane not in ('video','control'):raise ValueError('auth')
            if not isinstance(auth.get('key'),str) or not secrets.compare_digest(auth['key'],self.keys[role]):raise ValueError('auth')
            if role=='host' and (ip!='127.0.0.1' or conn.request.headers.get('Origin')!=self.origin):raise ValueError('host origin')
            identity=(role,lane);old=self.clients.get(identity)
            if old:await old[0].close(1000,'replaced')
            q=asyncio.Queue(maxsize=3 if lane=='video' else 16)
            self.clients[identity]=(conn,q);self.stats['connections']+=1
            await conn.send(json.dumps({'type':'authenticated','lane':lane}))
            writer=asyncio.create_task(self.writer(conn,q,lane))
            if role=='phone':
                self.needs_key=True
                if lane=='control' and self.config:self.put('phone','control',self.config)
                self.put('host','control',json.dumps({'type':'video-ready'}))
            elif lane=='control' and ('phone','control') in self.clients:
                self.put('host','control',json.dumps({'type':'video-ready'}))
            async for message in conn:
                if writer.done():await writer
                if isinstance(message,bytes):
                    if role!='host' or lane!='video' or len(message)<10 or message[0] not in (0,1):raise ValueError('video packet')
                    if self.needs_key and message[0]!=1:continue
                    if message[0]==1:self.needs_key=False
                    self.stats['frames']+=1;self.stats['bytes']+=len(message)
                    self.put('phone','video',message);continue
                if lane!='control' or len(message)>32768:raise ValueError('control packet')
                data=json.loads(message)
                allowed={'config','state','encoderStats'} if role=='host' else {'control','keyframe','receiverStats','ready'}
                if data.get('type')=='ping':
                    self.put(role,'control',json.dumps({'type':'pong','at':data.get('at')}));continue
                if data.get('type') not in allowed:raise ValueError('message type')
                if data['type']=='config':self.config=message;self.needs_key=True
                self.put('phone' if role=='host' else 'host','control',message)
        except (ValueError,TypeError,KeyError,TimeoutError):
            await conn.close(1008,'Invalid or stale request')
        except Exception:
            pass # Connection closed; never log tokens or payloads.
        finally:
            if writer:writer.cancel()
            if identity and self.clients.get(identity,(None,))[0] is conn:
                self.clients.pop(identity,None)
                if identity[0]=='phone':self.put('host','control',json.dumps({'type':'video-stop'}))
    def start(self, root, ips, tls_port=8813, loopback_port=8814):
        cert,key=issue_server(root,ips)
        context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.minimum_version=ssl.TLSVersion.TLSv1_2
        context.load_cert_chain(cert,key)
        origins=[self.origin]+[f'https://{ip}:8811' for ip in ips]
        ready=threading.Event(); self.failure=None
        def run():
            async def main():
                self.stop_event=asyncio.Event();self.loop=asyncio.get_running_loop()
                try:
                    options=dict(origins=origins,compression=None,max_size=2*1024*1024,max_queue=2,write_limit=65536,ping_interval=10,ping_timeout=10,close_timeout=1)
                    async with serve(self.handle,'127.0.0.1',loopback_port,**options),serve(self.handle,'0.0.0.0',tls_port,ssl=context,**options):
                        ready.set();await self.stop_event.wait()
                except Exception as e:self.failure=type(e).__name__;ready.set()
            asyncio.run(main())
        self.thread=threading.Thread(target=run,daemon=True);self.thread.start()
        if not ready.wait(10) or self.failure:raise RuntimeError('Live relay startup failed: '+str(self.failure))
    def stop(self):
        if getattr(self,'loop',None) and self.loop.is_running():self.loop.call_soon_threadsafe(self.stop_event.set)
