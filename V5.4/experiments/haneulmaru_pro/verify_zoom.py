"""Check phone zoom commands against the running PC renderer, without a USB IMU.

This uses the phone control protocol, not physical Android touch input.
The active phone control connection is replaced; reconnect the phone afterwards.
"""
import json
import ssl
import time
import urllib.request
from pathlib import Path
from websockets.sync.client import connect

root = Path(__file__).resolve().parents[2]
base = 'http://127.0.0.1:8810/stream/'


def get(path, key=None):
    request = urllib.request.Request(base + path, headers={'Authorization': 'Bearer ' + key} if key else {})
    return json.load(urllib.request.urlopen(request, timeout=5))


host = get('host-session')['key']
link = get('info', host)['links'][0]
trust = ssl.create_default_context(cafile=str(root / '.local-tls/ca-cert.pem'))
result = {'physicalPhoneTest': False, 'transport': 'local WSS phone control', 'checks': []}
with connect('wss://' + link['ip'] + ':8813', ssl=trust,
             origin='https://' + link['ip'] + ':8811', compression=None) as ws:
    ws.send(json.dumps({'role': 'phone', 'lane': 'control', 'key': link['url'].split('#')[1]}))
    ws.recv(timeout=5)
    seq = int(time.time() * 1000)

    def receive(expected=None):
        end = time.monotonic() + 10
        while time.monotonic() < end:
            state = json.loads(ws.recv(timeout=5))
            if state.get('type') != 'state' or not state.get('zoomState'):
                continue
            if expected is not None and state.get('lastControlSeq', -1) < expected:
                continue
            assert not state.get('renderError'), state.get('renderError')
            assert not state['imuEnabled'], 'Run this check with the USB sensor disconnected.'
            return state
        raise AssertionError('No acknowledged zoom state')

    def command(**data):
        global seq
        seq += 1
        ws.send(json.dumps({'type': 'control', 'seq': seq, **data}))
        receive(seq)
        return receive(seq)  # Also wait for the following rendered frame.

    initial = receive()
    try:
        for ar in (False, True):
            for view in ('overview', 'map', 'chase', 'cockpit'):
                before = command(ar=ar, view=view, paused=True)['zoomState']
                for factor in (.8, 1.25):
                    after_state = command(zoom=factor)
                    after = after_state['zoomState']
                    assert (after['ratio'] > before['ratio']) if factor < 1 else (after['ratio'] < before['ratio']), (view, factor)
                    result['checks'].append({'ar': ar, 'view': view, 'factor': factor,
                                             'before': before['ratio'], 'after': after['ratio'],
                                             'imuEnabled': after_state['imuEnabled'],
                                             'hostHidden': after_state.get('hostHidden')})
                    before = after
    finally:
        command(ar=initial['ar'], view=initial['view'], paused=initial['paused'])
result['passed'] = len(result['checks']) == 16
(root / 'output/zoom-integration-check.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result))
