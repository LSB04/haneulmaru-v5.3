"""Authenticated phone relay state. Latest sample only; no hardware side effects."""
import math
import threading
import time
from .nu40_transport import normalize, FRESH_SECONDS


class PhoneImu:
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.lock = threading.Lock()
        self.sender = None
        self.seq = -1
        self.sample = None
        self.arrival = -math.inf
        self.count = 0

    def accept(self, data):
        if not isinstance(data, dict):
            raise ValueError('object required')
        sender, seq = data.get('sender'), data.get('seq')
        if not isinstance(sender, str) or not 1 <= len(sender) <= 80:
            raise ValueError('invalid sender')
        if type(seq) is not int or not 0 <= seq <= 9007199254740991:
            raise ValueError('invalid sequence')
        disconnected = data.get('connected') is False
        if not disconnected:
            age = data.get('age_ms')
            if type(age) not in (int, float) or not math.isfinite(age) or not 0 <= age <= 200:
                raise ValueError('stale phone sample')
            sample = normalize(data.get('sample'))
        with self.lock:
            now = self.clock()
            if self.sender != sender:
                if disconnected or now - self.arrival <= FRESH_SECONDS:
                    raise ValueError('another phone is active')
                self.sender, self.seq = sender, -1
            if seq <= self.seq:
                raise ValueError('duplicate or reordered sample')
            self.seq = seq
            if disconnected:
                self.sample = None
            else:
                self.sample, self.arrival = sample, now - age / 1000
                self.count += 1
            return {'ok': True, 'accepted': self.count}

    def merge(self, state):
        with self.lock:
            age = (self.clock() - self.arrival) * 1000
            fresh = self.sample is not None and age <= FRESH_SECONDS * 1000
            state['sources']['PHONE_USB'] = {'fresh': fresh, 'connected': fresh,
                'count': self.count, 'message': '휴대폰 USB 수신' if fresh else '휴대폰 USB 대기'}
            # Direct PC USB has priority. Phone USB overrides PC BLE to avoid double integration.
            if fresh and state.get('source') != 'USB':
                state.update(source='PHONE_USB', sample=dict(self.sample), age_ms=round(age),
                             session=state['session'] + ':' + self.sender)
            return state
