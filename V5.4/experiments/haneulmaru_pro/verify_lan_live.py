"""Check the running LAN server. No session credentials are printed or saved."""
import hashlib,json,ssl,time,urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
def read(url,key=None,data=None,context=None):
    headers={'Authorization':'Bearer '+key} if key else {}
    request=urllib.request.Request(url,headers=headers,data=json.dumps(data).encode() if data else None)
    with urllib.request.urlopen(request,context=context,timeout=10) as response:
        return response.read()
def main():
    local='http://127.0.0.1:8810'
    host=json.loads(read(local+'/stream/host-session'))['key']
    info=json.loads(read(local+'/stream/info',host));link=info['links'][0]
    url,key=link['url'].split('#');base=url.removesuffix('/phone')
    trust=ssl.create_default_context(cafile=str(ROOT/'.local-tls/ca-cert.pem'))
    health=json.loads(read(base+'/stream/health',key,context=trust))
    apk=read(link['install']+'android-app.apk')
    actual=ROOT/'android-usb/dist/haneulmaru-v53-lan.apk'
    result={'health':health,'ip':link['ip'],'apkMatchesBuild':hashlib.sha256(apk).hexdigest()==hashlib.sha256(actual.read_bytes()).hexdigest(),
            'tlsCertificateVerified':True,'actualPhoneTest':False,'externalInternetDisconnected':False}
    job=json.loads(read(base+'/stream/ai/request',key,{'kind':'scene','prompt':'드론 수를 30대로 설정해 줘.'},trust))['job']
    deadline=time.monotonic()+220
    while time.monotonic()<deadline:
        state=json.loads(read(base+'/stream/ai/job?id='+job,key,context=trust))
        if state['state']!='running':result['realLocalAI']=state;break
        time.sleep(2)
    else:result['realLocalAI']={'state':'timeout'}
    (ROOT/'output/lan-live-check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=True))
if __name__=='__main__':main()
