precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform float uBreath;
uniform vec3  uPtr;        // x, y, strength
uniform vec3  uWake[8];    // x, y, life
uniform vec3  uC0; uniform vec3 uC1; uniform vec3 uC2;
uniform vec3  uC3; uniform vec3 uC4; uniform vec3 uC5;
uniform vec3  uAccent;
uniform float uExp;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),
             mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
}
float fbm(vec2 p){
  float v=0.0, a=0.5;
  mat2 r=mat2(0.80,0.60,-0.60,0.80);
  for(int i=0;i<6;i++){ v+=a*noise(p); p=r*p*2.02; a*=0.5; }
  return v;
}

// domain-warped cloud, the thing that makes it look painted
float clouds(vec2 p, float t, out vec2 q, out vec2 r){
  q = vec2(fbm(p + vec2(0.0,0.0) + t*0.035), fbm(p + vec2(5.2,1.3) - t*0.028));
  r = vec2(fbm(p + 3.4*q + vec2(1.7,9.2) + t*0.045),
           fbm(p + 3.4*q + vec2(8.3,2.8) - t*0.038));
  return fbm(p + 3.6*r);
}

vec3 ramp(float f){
  vec3 c = mix(uC0, uC1, smoothstep(0.16,0.50,f));
  c = mix(c, uC2, smoothstep(0.44,0.66,f));
  c = mix(c, uC3, smoothstep(0.62,0.80,f));
  c = mix(c, uC4, smoothstep(0.76,0.90,f));
  c = mix(c, uC5, smoothstep(0.88,0.99,f));
  return c;
}

float stars(vec2 uv, float t){
  vec2 g = uv*vec2(uRes.x/uRes.y,1.0)*46.0;
  vec2 id = floor(g);
  float h = hash(id);
  if(h < 0.965) return 0.0;
  vec2 c = fract(g)-0.5 - (vec2(hash(id+1.3),hash(id+7.7))-0.5)*0.55;
  float d = length(c);
  float tw = 0.55+0.45*sin(t*1.5 + h*44.0);
  float m = smoothstep(0.30,0.0,d)*tw;
  float spike = smoothstep(0.34,0.0,abs(c.x)*7.0)*smoothstep(0.34,0.0,abs(c.y))
              + smoothstep(0.34,0.0,abs(c.y)*7.0)*smoothstep(0.34,0.0,abs(c.x));
  return m*(0.75 + spike*0.9);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes)/uRes.y;
  float t = uTime;
  float br = uBreath;                       // 0..1

  float horizon = -0.30;
  bool onFloor = uv.y < horizon;

  vec2 sp = uv;
  float floorFade = 0.0;
  float depth = 0.0;
  if(onFloor){
    float d = horizon - uv.y;
    depth = d;
    // mirror, compress, and let it wobble like polished stone
    sp = vec2(uv.x*(1.0 + d*0.55), horizon + d*0.72);
    sp.x += sin(d*22.0 - t*0.5)*0.012*(0.3+d);
    sp.y += sin(uv.x*9.0 + t*0.35)*0.006;
    floorFade = smoothstep(0.0,0.55,d);
  }

  // slow spiral so the eye is always drawn inward
  vec2 c = sp - vec2(0.0, 0.06);
  float ang = atan(c.y,c.x);
  float rad = length(c);
  vec2 sw = vec2(cos(ang + rad*0.85 - t*0.012), sin(ang + rad*0.85 - t*0.012))*rad;

  vec2 p = sw*2.25;

  // her hand pushes the cloud aside
  vec2 ptr = (uPtr.xy - 0.5*uRes)/uRes.y;
  if(uPtr.z > 0.001){
    vec2 dv = p - ptr*2.25;
    float dd = length(dv);
    float infl = exp(-dd*dd*2.2)*uPtr.z;
    p += normalize(dv+1e-5)*infl*0.55;
    p += vec2(-dv.y,dv.x)*infl*0.30;       // a little swirl in the wake
  }
  for(int i=0;i<8;i++){
    if(uWake[i].z <= 0.001) continue;
    vec2 wp = (uWake[i].xy - 0.5*uRes)/uRes.y * 2.25;
    vec2 dv = p - wp;
    float dd = length(dv);
    float infl = exp(-dd*dd*4.5)*uWake[i].z;
    p += normalize(dv+1e-5)*infl*0.40;
  }

  vec2 q,r;
  float f = clouds(p, t, q, r);

  // structure: the warp fields give the painted filament look
  float fil = pow(clamp(length(r),0.0,1.5), 1.6);
  f = f*0.66 + fil*0.34;
  f += (0.02 + br*0.03);

  // brighten toward the centre so there is a light source to fall into
  float centre = exp(-dot(sp-vec2(0.0,0.02), sp-vec2(0.0,0.02))*1.55);
  f += centre*(0.15 + br*0.07);

  vec3 col = ramp(clamp(f,0.0,1.0));

  // gold rim light where the cloud density changes fastest
  float edge = clamp(abs(q.x-q.y)*1.9, 0.0, 1.0);
  col += uAccent*edge*0.13*(0.6+br*0.5);

  if(!onFloor){
    col += mix(vec3(1.0),uAccent,0.35)*stars(uv, t)*(0.42+br*0.26);
  } else {
    // polished amethyst floor
    col *= mix(vec3(1.0), vec3(0.42,0.30,0.52), floorFade*0.85);
    col *= (1.0 - floorFade*0.34);
    // vertical smear of the reflected light
    float smear = 0.5+0.5*sin(uv.x*3.0 + t*0.12);
    col += uAccent*exp(-depth*7.0)*0.17*smear;
    // the gold rings inlaid in the stone
    float rr = length(vec2(uv.x*(1.0+depth*1.3), depth*1.15));
    float rings = 0.0;
    for(int k=1;k<=4;k++){
      float target = float(k)*0.19;
      rings += smoothstep(0.010,0.0,abs(rr-target));
    }
    float spokes = smoothstep(0.985,1.0,abs(sin(atan(depth*1.15, uv.x*(1.0+depth*1.3))*6.0)));
    col += uAccent*(rings*0.46 + spokes*0.09)
           *exp(-depth*3.4)*(0.5+br*0.45);
    // mist sitting on the floor
    col = mix(col, uAccent*0.34, smoothstep(0.0,0.10,depth)*0.24*exp(-depth*5.0));
  }

  // the horizon itself, a band of light
  float hb = exp(-abs(uv.y-horizon)*46.0);
  col += uAccent*hb*(0.24+br*0.13);

  // her hand leaves warmth in the cloud
  if(uPtr.z>0.001){
    float dd = length(uv-ptr);
    col += mix(uAccent,vec3(1.0),0.35)*exp(-dd*dd*46.0)*0.26*uPtr.z;
  }
  for(int i=0;i<8;i++){
    if(uWake[i].z<=0.001) continue;
    vec2 wp=(uWake[i].xy-0.5*uRes)/uRes.y;
    float dd=length(uv-wp);
    col += mix(uAccent,vec3(1.0),0.3)*exp(-dd*dd*150.0)*0.19*uWake[i].z;
  }

  // vignette and a touch of grade
  float vig = smoothstep(1.30,0.20,length(uv*vec2(0.82,1.0)));
  col *= 0.20+0.80*vig;
  col *= uExp;
  col = pow(col, vec3(0.95));

  gl_FragColor = vec4(col,1.0);
}
