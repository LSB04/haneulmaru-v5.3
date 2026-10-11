export function validateScene(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('설정 형식 오류');
 for(const [key,v] of Object.entries(value)){
  const valid=key==='count'?Number.isInteger(v)&&v>=1&&v<=200:
   key==='quality'?['low','balanced','high','ultra'].includes(v):
   key==='speed'?[.25,1,2].includes(v):
   key==='sun'?Number.isFinite(v)&&v>=10&&v<=80:
   ['top','paused'].includes(key)?typeof v==='boolean':false;
  if(!valid)throw Error('허용되지 않은 설정: '+key);
 }
 return value;
}
