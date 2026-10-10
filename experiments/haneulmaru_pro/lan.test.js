import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionRoute} from './rtc.js';
test('ICE report uses the selected pair, not an unused relay',()=>{
 const reports=new Map([['transport',{type:'transport',selectedCandidatePairId:'chosen'}],['chosen',{type:'candidate-pair',state:'succeeded',localCandidateId:'a',remoteCandidateId:'b',currentRoundTripTime:.025}],['a',{candidateType:'host',protocol:'udp'}],['b',{candidateType:'host'}],['unused',{type:'candidate-pair',state:'failed',localCandidateId:'relay'}],['relay',{candidateType:'relay'}]]);
 assert.deepEqual(connectionRoute(reports),{route:'직접 연결 · udp',networkRttMs:25});
 assert.deepEqual(connectionRoute(new Map()),{route:'경로 확인 중',networkRttMs:null});
});
