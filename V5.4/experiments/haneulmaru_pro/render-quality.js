// Keep a close clipping plane only for the onboard view. A 0.1 near plane
// wastes depth precision across a kilometre-wide city (road/ground flicker).
export function configureCameraDepth(camera,view){
 const near=view==='cockpit'?.2:view==='chase'?.5:2;
 if(camera.near===near&&camera.far===4500)return;
 camera.near=near;camera.far=4500;camera.updateProjectionMatrix();
}

// Analytic filtering for procedural windows. MSAA alone only smooths polygon
// edges; it cannot filter step/fract patterns inside a facade fragment.
export const facadeFragment=`
 if(abs(vCityNormal.y)<0.45){
  float u=abs(vCityNormal.x)>abs(vCityNormal.z)?vCityPos.z:vCityPos.x;
  vec2 cell=vec2(u*.24,(vCityPos.y-14.)/3.4);
  vec2 footprint=max(fwidth(cell),vec2(.0001));
  vec2 tile=fract(cell);
  vec2 aa=min(footprint*.75,vec2(.45));
  vec2 mask=smoothstep(vec2(.17,.23)-aa,vec2(.17,.23)+aa,tile)
           *(1.-smoothstep(vec2(.78,.8)-aa,vec2(.78,.8)+aa,tile));
  float pane=mask.x*mask.y;
  float detail=1.-smoothstep(.18,.7,max(footprint.x,footprint.y));
  // Fade to the area-average window coverage rather than making distant
  // buildings brighter or letting subpixel light/dark cells sparkle.
  float coverage=mix(.3477,pane,detail);
  vec3 glass=vec3(.22,.32,.38);
  diffuseColor.rgb=mix(diffuseColor.rgb,glass,coverage*.72);
 }
`;

// Separate semantic layers before depth testing. Bridges retain a raised
// surface; regular walkways no longer compete with road tops at intersections.
export const CITY_LAYERS=Object.freeze({land:.08,water:.16,bank:.24,river:.32,walk:.44,road:.64,lane:.84,bridge:1.4});
