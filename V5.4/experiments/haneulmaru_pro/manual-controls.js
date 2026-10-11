// Independent pointer ownership lets either thumb release without stopping the other.
export class MovementInput {
  constructor(){this.pointers=new Map();}
  press(id,axis,sign){if(['forward','side','up'].includes(axis)&&[-1,1].includes(sign))this.pointers.set(id,{axis,sign});return this.value();}
  release(id){this.pointers.delete(id);return this.value();}
  clear(){this.pointers.clear();return this.value();}
  value(){const out={forward:0,side:0,up:0};for(const {axis,sign} of this.pointers.values())out[axis]+=sign;for(const key of Object.keys(out))out[key]=Math.max(-1,Math.min(1,out[key]));return out;}
}
export function installMovementPad(root,send){
  const input=new MovementInput(),buttons=[...root.querySelectorAll('[data-move]')];let enabled=false;
  const paint=()=>{for(const b of buttons)b.classList.toggle('pressed',[...input.pointers.values()].some(p=>p.axis===b.dataset.move&&p.sign===+b.dataset.sign));};
  const emit=()=>{paint();send({move:input.value()});};
  const stop=()=>{const active=input.pointers.size;input.clear();paint();if(active)send({move:input.value()});};
  for(const b of buttons){
    b.addEventListener('pointerdown',e=>{if(!enabled)return;e.preventDefault();e.stopPropagation();b.setPointerCapture(e.pointerId);input.press(e.pointerId,b.dataset.move,+b.dataset.sign);emit();});
    const release=e=>{if(!input.pointers.has(e.pointerId))return;e.preventDefault();e.stopPropagation();input.release(e.pointerId);emit();};
    for(const name of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(name,release);
    b.addEventListener('contextmenu',e=>e.preventDefault());
  }
  const timer=setInterval(()=>{if(enabled&&input.pointers.size)send({move:input.value()});},60);
  addEventListener('blur',stop);const hidden=()=>{if(document.hidden)stop();};document.addEventListener('visibilitychange',hidden);
  return {stop,setEnabled(value){enabled=!!value;if(!enabled)stop();buttons.forEach(b=>b.disabled=!enabled);},destroy(){stop();clearInterval(timer);removeEventListener('blur',stop);document.removeEventListener('visibilitychange',hidden);}};
}
