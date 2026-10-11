// Zoom is independent of IMU look direction, including the full 3D overview.
export function zoomCamera({view,camera,ortho,controls,chaseDistance},factor){
 if(!Number.isFinite(factor)||factor<=.2||factor>=5)return chaseDistance;
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 if(view==='overview'){
  const offset=camera.position.clone().sub(controls.target);
  if(offset.lengthSq()<1e-8)offset.set(0,1,1);
  offset.clampLength(12,1900).multiplyScalar(factor).clampLength(12,1900);
  camera.position.copy(controls.target).add(offset);
  // With IMU enabled, keep the sensor-supplied orientation intact.
  if(controls.enabled)controls.update();
 }else if(view==='map'){ortho.zoom=clamp(ortho.zoom/factor,.35,12);ortho.updateProjectionMatrix();}
 else if(view==='chase')return clamp(chaseDistance*factor,8,600);
 else if(view==='cockpit'){camera.fov=clamp(camera.fov*factor,30,90);camera.updateProjectionMatrix();}
 return chaseDistance;
}
