const TAU = Math.PI * 2;
const SALT = 158253;
const NT = 5;
const SCALE_STEPS = [1024, 896, 768, 640, 512] as const;
const STEPS_FOR = SCALE_STEPS.map((side) => side * side);
const FLAME_FILL = 0.8;
const RECT_K = 0.94 / FLAME_FILL;
const WAVE_N = 1024;
const WAVE_LAG = -0.02;

const PALETTES = [
  ["#06103a", "#123a8a", "#2ea8e6", "#7ef0f0", "#e6f7ff"],
  ["#12002e", "#4a0e8f", "#a02ee6", "#ff5ad0", "#ffd9f2"],
  ["#001a26", "#004d5c", "#00b39b", "#7fe66b", "#f2ffd9"],
  ["#2b0a00", "#7a2d05", "#e08b12", "#ffd447", "#fff7cc"],
  ["#26000f", "#7a0033", "#e0246b", "#ff8fb0", "#ffe0e8"],
  ["#001d1a", "#00544a", "#12a37a", "#9ada3c", "#ffe873"],
  ["#040018", "#1b1060", "#4d3ce0", "#00d8ff", "#d9fbff"],
  ["#1a0026", "#5c0a5c", "#c2189e", "#ff6a3d", "#ffc46b"],
  ["#00121f", "#0a3d62", "#1e9bd1", "#a6e3a1", "#fdf6c3"],
  ["#200018", "#6b0f4a", "#d62828", "#f77f00", "#fcbf49"],
  ["#031a1a", "#0d5c54", "#3fbf9e", "#8fd9e6", "#ede7ff"],
  ["#0b0033", "#3a0ca3", "#7209b7", "#f72585", "#ffd6e8"],
] as const;

type Rgb = readonly [number, number, number];
type Palette = readonly Rgb[];

const PAL_RGB: Palette[] = PALETTES.map((palette) =>
  palette.map((hex) => [
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  ] as const),
);

const QUAD_VERTEX = `#version 300 es
const vec2 q[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
void main(){ gl_Position = vec4(q[gl_VertexID], 0.0, 1.0); }`;

const FLAME_LIBRARY = `
uint pcg(inout uint s){ s = s*747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float rnd(inout uint s){ return float(pcg(s)) * (1.0/4294967296.0); }
vec2 vLinear(vec2 p){ return p; }
vec2 vSpherical(vec2 p){ return p/(dot(p,p)+1e-6); }
vec2 vSwirl(vec2 p){ float r=dot(p,p); float s=sin(r), c=cos(r); return vec2(p.x*s-p.y*c, p.x*c+p.y*s); }
vec2 vPolar(vec2 p){ return vec2(atan(p.x,p.y)*0.31830989, length(p)-1.0); }
vec2 vDisc(vec2 p){ float a=atan(p.x,p.y)*0.31830989; float r=length(p)*3.14159265; return a*vec2(sin(r),cos(r)); }
vec2 vSpiral(vec2 p){ float r=length(p)+1e-6; float a=atan(p.y,p.x); return vec2(cos(a)+sin(r), sin(a)-cos(r))/r; }
vec2 vHyperbolic(vec2 p){ float r=length(p)+1e-6; float a=atan(p.x,p.y); return vec2(sin(a)/r, r*cos(a)); }
vec2 vHandkerchief(vec2 p){ float r=length(p); float a=atan(p.x,p.y); return r*vec2(sin(a+r), cos(a-r)); }
vec2 vEyefish(vec2 p){ return p*(2.0/(length(p)+1.0)); }
vec2 vBubble(vec2 p){ return p*(4.0/(dot(p,p)+4.0)); }
vec2 vCurl(vec2 p, float c1, float c2){
  float t1 = 1.0 + c1*p.x + c2*(p.x*p.x - p.y*p.y);
  float t2 = c1*p.y + 2.0*c2*p.x*p.y;
  float d = 1.0/(t1*t1 + t2*t2 + 1e-6);
  return d*vec2(p.x*t1 + p.y*t2, p.y*t1 - p.x*t2);
}
vec2 vJulia(vec2 p, inout uint s){
  float r = sqrt(length(p) + 1e-9);
  float a = atan(p.y,p.x)*0.5 + (rnd(s) < 0.5 ? 0.0 : 3.14159265);
  return r*vec2(cos(a), sin(a));
}
vec2 vRectangles(vec2 p, vec2 k){
  return vec2((2.0*floor(p.x/k.x) + 1.0)*k.x - p.x, (2.0*floor(p.y/k.y) + 1.0)*k.y - p.y);
}`;

const UPDATE_FRAGMENT = `#version 300 es
precision highp float; precision highp int;
${FLAME_LIBRARY}
uniform sampler2D uState;
uniform int uSize;
uniform mat3 uAff[NT];
uniform vec4 uV1[NT];
uniform vec4 uV2[NT];
uniform vec4 uV3[NT];
uniform vec4 uMeta[NT];
uniform vec2 uGridK;
uniform float uSym;
uniform float uSymP;
uniform uint uSeed;
out vec4 outState;
void main(){
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec4 st = texelFetch(uState, ip, 0);
  vec2 p = st.xy; float ci = st.z; uint rs = floatBitsToUint(st.w);
  if (rs == 0u) rs = (uint(ip.x) + uint(ip.y)*uint(uSize))*2654435761u + uSeed + 1u;
  bool bad = !(dot(p,p) < 1e8);
  if (bad || rnd(rs) < 0.0035) { p = vec2(rnd(rs), rnd(rs))*2.0 - 1.0; ci = rnd(rs); }
  float pick = rnd(rs);
  if (pick < uSymP) {
    float k2 = floor(rnd(rs)*uSym);
    float ang = 6.28318530718*k2/uSym;
    float cs = cos(ang), sn = sin(ang);
    p = vec2(p.x*cs - p.y*sn, p.x*sn + p.y*cs);
  } else {
    float pk = (pick - uSymP)/max(1.0 - uSymP, 1e-4);
    int j = 0;
    for (int k = 0; k < NT; k++){ if (pk <= uMeta[k].y) { j = k; break; } }
    vec2 q = (uAff[j]*vec3(p, 1.0)).xy;
    vec4 a = uV1[j], b = uV2[j], c = uV3[j];
    vec2 v = a.x*vLinear(q) + a.y*vSpherical(q) + a.z*vSwirl(q) + a.w*vPolar(q)
           + b.x*vDisc(q) + b.y*vSpiral(q) + b.z*vHyperbolic(q) + b.w*vCurl(q, uMeta[j].z, uMeta[j].w)
           + c.x*vJulia(q, rs) + c.y*vRectangles(q, uGridK) + c.z*vEyefish(q) + c.w*vHandkerchief(q);
    p = v;
    ci = mix(ci, uMeta[j].x, 0.62);
  }
  outState = vec4(p, ci, uintBitsToFloat(rs));
}`.replace(/\bNT\b/g, String(NT));

const SCATTER_VERTEX = `#version 300 es
precision highp float; precision highp int;
${FLAME_LIBRARY}
uniform sampler2D uState;
uniform sampler2D uPal;
uniform float uCiShift;
uniform vec4 uFlare[4];
uniform vec4 uTrail[10];
uniform vec3 uTrailK;
uniform int uTrailN, uFlareN;
uniform int uSize;
uniform mat3 uFin;
uniform vec2 uFinW;
uniform vec2 uAsp;
uniform float uZoom;
out vec3 vCol;
void main(){
  int i = gl_VertexID;
  ivec2 uv = ivec2(i % uSize, i / uSize);
  vec4 st = texelFetch(uState, uv, 0);
  vec2 h = (uFin*vec3(st.xy, 1.0)).xy;
  vec2 p = uFinW.x*vLinear(h) + uFinW.y*vBubble(h);
  float trailLum = 0.0;
  for (int i = 0; i < 10; i++) {
    if (i >= uTrailN) break;
    if (uTrail[i].z <= 0.001) continue;
    vec2 dv = p - uTrail[i].xy;
    float r2 = dot(dv, dv);
    float rad = uTrail[i].w;
    float g = exp(-r2/(rad*rad));
    vec2 dir = dv*inversesqrt(r2 + 1e-5);
    p += (dir*uTrailK.x + vec2(-dir.y, dir.x)*uTrailK.y)*g*uTrail[i].z;
    trailLum += g*uTrail[i].z;
  }
  float rr = length(p);
  float boost = 0.0, hot = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i >= uFlareN) break;
    if (uFlare[i].y <= 0.0) continue;
    float d = (rr - uFlare[i].x)/uFlare[i].z;
    float g = exp(-d*d);
    boost += uFlare[i].y*g;
    hot += uFlare[i].y*g;
  }
  vCol = texture(uPal, vec2(clamp(st.z + uCiShift + hot*0.05, 0.0, 0.92), 0.5)).rgb;
  vCol *= 1.0 + min(boost, 1.25) + trailLum*uTrailK.z;
  gl_Position = vec4(p*uZoom*uAsp, 0.0, 1.0);
  gl_PointSize = 1.0;
}`.replace(/\bNT\b/g, String(NT));

const SCATTER_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vCol; out vec4 o;
void main(){ o = vec4(vCol, 1.0); }`;

const DECAY_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uT; uniform float uD; out vec4 o;
void main(){ o = texelFetch(uT, ivec2(gl_FragCoord.xy), 0)*uD; }`;

const TONE_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uT;
uniform float uExp, uGamma, uSat, uVig;
out vec4 o;
void main(){
  vec4 a = texelFetch(uT, ivec2(gl_FragCoord.xy), 0);
  float d = a.a;
  if (d <= 1e-9) { o = vec4(0.0,0.0,0.0,1.0); return; }
  float l = log(1.0 + d*uExp)/d;
  vec3 c = max(a.rgb*l, 0.0);
  float lum = dot(c, vec3(0.2126,0.7152,0.0722));
  float rolled = lum/(1.0 + lum);
  c *= lum > 1e-5 ? rolled/lum : 1.0;
  lum = dot(c, vec3(0.2126,0.7152,0.0722));
  c = mix(vec3(lum), c, uSat);
  c = pow(clamp(c, 0.0, 1.0), vec3(1.0/uGamma));
  o = vec4(c, 1.0);
}`;

const BRIGHT_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uRes; uniform float uThreshold;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  vec2 px = 0.25/uRes;
  vec3 c = texture(uTex, uv + vec2(-px.x,-px.y)).rgb + texture(uTex, uv + vec2(px.x,-px.y)).rgb
         + texture(uTex, uv + vec2(-px.x, px.y)).rgb + texture(uTex, uv + vec2(px.x, px.y)).rgb;
  c *= 0.25;
  float l = dot(c, vec3(0.2126,0.7152,0.0722));
  o = vec4(c*smoothstep(uThreshold, uThreshold + 0.5, l), 1.0);
}`;

const BLUR_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uRes; uniform vec2 uDir;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy/uRes; vec2 d = uDir/uRes;
  vec3 c = texture(uTex, uv).rgb*0.2270;
  c += (texture(uTex, uv + d*1.3846).rgb + texture(uTex, uv - d*1.3846).rgb)*0.3162;
  c += (texture(uTex, uv + d*3.2308).rgb + texture(uTex, uv - d*3.2308).rgb)*0.0703;
  o = vec4(c, 1.0);
}`;

const SPILL_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uTex, uBloom;
uniform vec2 uRes, uOff, uScale;
out vec4 o;
void main(){
  vec2 uv = (gl_FragCoord.xy*uScale.y - uOff)/uScale.x;
  float rd = length(uv - 0.5);
  float m = 1.0 - smoothstep(0.38, 0.498, rd);
  if (m <= 0.0) { o = vec4(0.0,0.0,0.0,1.0); return; }
  o = vec4((texture(uTex, uv).rgb*0.16 + texture(uBloom, uv).rgb*0.85)*m, 1.0);
}`;

const COMPOSITE_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uTex, uBloom, uWide, uWave, uPalC;
uniform vec4 uWaveK;
uniform vec2 uRes, uSrcRes, uOff, uScale, uCentre;
uniform float uGlow, uSpill, uAmbient;
uniform vec3 uBgCol;
out vec4 o;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
void main(){
  vec2 sv = gl_FragCoord.xy/uRes;
  vec2 rel = (gl_FragCoord.xy - uCentre)/max(uScale.x, 1.0);
  float fall = exp(-dot(rel, rel)*0.40);
  vec3 c = uBgCol*(0.125 + 0.105*fall)*uAmbient;
  c += texture(uWide, sv).rgb*uSpill;
  {
    float wx = gl_FragCoord.x/uRes.x;
    vec3 wv = texture(uWave, vec2(wx, 0.5)).rgb;
    float e = uWaveK.x*(0.07 + 0.93*wv.r);
    float eM = uWaveK.x*(0.12 + 0.88*wv.g);
    float eB = uWaveK.x*(0.16 + 0.84*wv.b);
    float Rk = max(uWaveK.y, 1.0);
    float dxp = gl_FragCoord.x - uCentre.x;
    float bulge = Rk*0.40*exp(-pow(dxp/(Rk*0.80), 2.0));
    float dy = gl_FragCoord.y - uCentre.y;
    float d = min(abs(dy - bulge), abs(dy + bulge));
    float dxo = dxp/Rk;
    float prox = 0.30 + 0.70*exp(-dxo*dxo*0.24);
    float edge = smoothstep(0.0, 0.20, wx)*smoothstep(1.0, 0.80, wx);
    float q0 = d/max(e*0.17, 1.6);
    float q1 = d/max(eM*0.55, 5.0);
    float q2 = d/max(eM*1.15, 12.0);
    float q3 = d/max(eB*1.90, 26.0);
    float q4 = d/max(eB*3.10 + uWaveK.x*0.10, 52.0);
    float band = exp(-q0*q0)*0.42 + exp(-q1*q1)*0.46 + exp(-q2*q2)*0.40
               + exp(-q3*q3)*0.28 + exp(-q4*q4)*0.17;
    band *= prox*edge;
    float rr = length(gl_FragCoord.xy - uCentre)/Rk;
    band *= mix(0.22, 1.0, smoothstep(0.86, 1.05, rr));
    band *= 1.0 + 0.30*exp(-pow((rr - 1.0)/0.30, 2.0));
    float wci = clamp(0.74 - 0.40*clamp(d/max(eM, 1.0), 0.0, 1.8), 0.0, 0.86);
    c += texture(uPalC, vec2(wci, 0.5)).rgb*band*uWaveK.z;
  }
  vec2 uv = (gl_FragCoord.xy - uOff)/uScale;
  float rd = length(uv - 0.5);
  float m = 1.0 - smoothstep(0.40, 0.499, rd);
  if (m > 0.0) c += (texture(uTex, uv).rgb + texture(uBloom, uv).rgb*uGlow)*m;
  c += (hash12(gl_FragCoord.xy) - 0.5)/255.0;
  o = vec4(c, 1.0);
}`;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function cyrb53(value: string, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let index = 0; index < value.length; index += 1) {
    const char = value.charCodeAt(index);
    h1 = Math.imul(h1 ^ char, 2654435761);
    h2 = Math.imul(h2 ^ char, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

type Track = {
  sym: number;
  worlds: number[];
  flowSeed: number;
};

function deriveTrack(name: string): Track {
  const random = mulberry32(cyrb53(name, SALT) >>> 0);
  const sym = 5 + Math.floor(random() * 2);
  const bag = PAL_RGB.map((_, index) => index);
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    const value = bag[index];
    bag[index] = bag[other] ?? 0;
    bag[other] = value ?? 0;
  }
  random();
  return {
    sym,
    worlds: bag.slice(0, 5),
    flowSeed: random() * 1000,
  };
}

type AudioLevels = {
  bass: number;
  mid: number;
  high: number;
  level: number;
  loud: number;
};

type SharedMediaTap = {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  activeAnalyser: AnalyserNode | null;
};

type AudioAnalysis = {
  analyse: (dt: number) => void;
  detectBeat: (dt: number) => number;
  outputLag: () => number;
  envelopeSlices: (count: number) => Float32Array;
  detach: () => void;
};

const mediaTaps = new WeakMap<HTMLAudioElement, SharedMediaTap>();
const AUDIO_LEVEL_KEYS = ["bass", "mid", "high", "level"] as const;

function getMediaTap(audioElement: HTMLAudioElement) {
  const existing = mediaTaps.get(audioElement);
  if (existing) return existing;
  const context = new AudioContext();
  const source = context.createMediaElementSource(audioElement);
  source.connect(context.destination);
  const tap = { context, source, activeAnalyser: null } satisfies SharedMediaTap;
  mediaTaps.set(audioElement, tap);
  return tap;
}

function attachAudioAnalysis(
  audioElement: HTMLAudioElement,
  levels: AudioLevels,
  getClock: () => number,
): AudioAnalysis {
  const tap = getMediaTap(audioElement);
  const { context, source } = tap;
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.35;

  source.disconnect();
  tap.activeAnalyser?.disconnect();
  source.connect(analyser);
  analyser.connect(context.destination);
  tap.activeAnalyser = analyser;
  if (context.state !== "running") void context.resume().catch(() => undefined);

  const frequency = new Uint8Array(analyser.frequencyBinCount);
  const waveform = new Uint8Array(analyser.fftSize);
  const fluxHistory = new Float32Array(48);
  const gain: Partial<Record<(typeof AUDIO_LEVEL_KEYS)[number], number>> = {};
  const slow: Partial<Record<(typeof AUDIO_LEVEL_KEYS)[number], number>> = {};
  const onsetPeak: Partial<Record<(typeof AUDIO_LEVEL_KEYS)[number], number>> = {};
  let previousSpectrum: Float32Array | null = null;
  let fluxAt = 0;
  let sinceBeat = 9;
  let loudPeak = 0.05;
  let detached = false;

  return {
    analyse(dt) {
      const release = Math.exp(-dt / 0.16);
      const attack = Math.exp(-dt / 0.03);
      if (context.state !== "running") {
        for (const key of AUDIO_LEVEL_KEYS) levels[key] *= release;
        levels.loud += (1 - levels.loud) * (1 - release);
        return;
      }
      analyser.getByteFrequencyData(frequency);
      analyser.getByteTimeDomainData(waveform);
      const binHz = context.sampleRate / analyser.fftSize;
      const last = frequency.length - 1;
      const band = (low: number, high: number, power: number) => {
        let sum = 0;
        let count = 0;
        const end = Math.min(Math.ceil(high / binHz), last);
        for (let index = Math.min(Math.floor(low / binHz), last); index <= end; index += 1) {
          const value = (frequency[index] ?? 0) / 255;
          sum += value * value;
          count += 1;
        }
        return Math.pow(sum / Math.max(1, count), 0.5 * power);
      };
      let rms = 0;
      for (let index = 0; index < waveform.length; index += 4) {
        const value = ((waveform[index] ?? 128) - 128) / 128;
        rms += value * value;
      }
      rms = Math.sqrt(rms / (waveform.length / 4));
      const raw = {
        bass: band(28, 150, 1),
        mid: band(200, 1600, 1.1),
        high: band(2600, 9000, 1.3),
        level: rms * 2.2,
      };
      loudPeak = Math.max(rms, loudPeak * Math.exp(-dt / 25) + 0.0002, 0.02);
      const loudness = clamp(rms / loudPeak, 0, 1);
      levels.loud += (loudness - levels.loud) * (1 - Math.exp(-dt / 0.4));
      if (!Number.isFinite(levels.loud)) levels.loud = 1;
      for (const key of AUDIO_LEVEL_KEYS) {
        let value = raw[key];
        if (!Number.isFinite(value)) value = 0;
        const ceiling = gain[key] = Math.max(value, (gain[key] ?? 0.2) * Math.exp(-dt / 6) + 0.0005, 0.03);
        const previousSlow = slow[key] ?? value;
        const slowValue = slow[key] = previousSlow + (value - previousSlow) * (1 - Math.exp(-dt / 1.2));
        const onset = Math.max(0, value - slowValue);
        const peak = onsetPeak[key] = Math.max(onset, (onsetPeak[key] ?? 0.02) * Math.exp(-dt / 5) + 0.0002, 0.015);
        let normalised = clamp(0.32 * (value / ceiling) + 0.95 * (onset / peak), 0, 1);
        if (!Number.isFinite(normalised)) normalised = 0;
        const coefficient = normalised > levels[key] ? attack : release;
        levels[key] = normalised + (levels[key] - normalised) * coefficient;
        if (!Number.isFinite(levels[key])) levels[key] = 0;
      }
    },
    detectBeat(dt) {
      sinceBeat += dt;
      if (context.state !== "running" || audioElement.paused || audioElement.ended) return 0;
      if (!previousSpectrum || previousSpectrum.length !== frequency.length) {
        previousSpectrum = new Float32Array(frequency.length);
        previousSpectrum.set(frequency);
        return 0;
      }
      const binHz = context.sampleRate / analyser.fftSize;
      const kickLow = Math.max(1, Math.floor(30 / binHz));
      const kickHigh = Math.min(frequency.length - 1, Math.ceil(220 / binHz));
      const highLow = Math.min(frequency.length - 1, Math.floor(1500 / binHz));
      const highHigh = Math.min(frequency.length - 1, Math.ceil(7000 / binHz));
      let flux = 0;
      for (let index = kickLow; index <= kickHigh; index += 1) {
        const change = (frequency[index] ?? 0) - (previousSpectrum[index] ?? 0);
        if (change > 0) flux += change * 1.6;
      }
      for (let index = highLow; index <= highHigh; index += 1) {
        const change = (frequency[index] ?? 0) - (previousSpectrum[index] ?? 0);
        if (change > 0) flux += change * 0.5;
      }
      previousSpectrum.set(frequency);
      flux /= 255 * (kickHigh - kickLow + 1 + (highHigh - highLow + 1) * 0.4);
      let mean = 0;
      for (const value of fluxHistory) mean += value;
      mean /= fluxHistory.length;
      let variance = 0;
      for (const value of fluxHistory) {
        const difference = value - mean;
        variance += difference * difference;
      }
      const deviation = Math.sqrt(variance / fluxHistory.length);
      fluxHistory[fluxAt] = flux;
      fluxAt = (fluxAt + 1) % fluxHistory.length;
      const threshold = mean + Math.max(deviation * 1.5, mean * 0.3) + 0.00001;
      if (flux < 0.0002) return 0;
      if (flux > threshold && sinceBeat > 0.14) {
        sinceBeat = 0;
        return clamp((flux - threshold) / Math.max(threshold, 0.0001), 0.15, 3);
      }
      return 0;
    },
    outputLag() {
      const output = context.outputLatency;
      const base = context.baseLatency;
      return clamp((typeof output === "number" && output > 0 ? output : 0) + (typeof base === "number" ? base : 0), 0, 0.35);
    },
    envelopeSlices(count) {
      const output = new Float32Array(count);
      if (context.state !== "running") {
        const time = getClock();
        for (let index = 0; index < count; index += 1) {
          output[index] =
            0.11 +
            0.06 * Math.abs(Math.sin(time * 1.7 + index * 0.9)) +
            0.04 * Math.abs(Math.sin(time * 0.6 + index * 2.3));
        }
        return output;
      }
      analyser.getByteTimeDomainData(waveform);
      const sliceSize = Math.max(1, Math.floor(waveform.length / count));
      for (let index = 0; index < count; index += 1) {
        let peak = 0;
        const start = Math.min(waveform.length - 1, index * sliceSize);
        const end = Math.min(waveform.length, start + sliceSize);
        for (let sample = start; sample < end; sample += 1) {
          const value = Math.abs((waveform[sample] ?? 128) - 128) / 128;
          if (value > peak) peak = value;
        }
        output[index] = peak;
      }
      return output;
    },
    detach() {
      if (detached) return;
      detached = true;
      if (tap.activeAnalyser === analyser) {
        source.disconnect();
        analyser.disconnect();
        source.connect(context.destination);
        tap.activeAnalyser = null;
      } else {
        analyser.disconnect();
      }
    },
  };
}

type Flare = { t: number; amp: number; dur: number; reach: number };
type TrailPoint = { x: number; y: number; s: number; r: number };
type Layout = { x: number; y: number; d: number };
type Uniforms = Record<string, WebGLUniformLocation | null>;
type ProgramInfo = { program: WebGLProgram; uniforms: Uniforms };
type Target = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
};

export type OrbController = {
  stop: () => void;
};

export type OrbScale = (viewportWidth: number, viewportHeight: number) => number;

export function startOrb(container: HTMLElement, audioElement: HTMLAudioElement, orbScale?: OrbScale): OrbController {
  const cleanups: Array<() => void> = [];
  let stopped = false;
  let rafId = 0;

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none";
  container.append(canvas);
  cleanups.push(() => canvas.remove());

  const fallbackCanvas = document.createElement("canvas");
  fallbackCanvas.setAttribute("aria-hidden", "true");
  fallbackCanvas.hidden = true;
  fallbackCanvas.style.cssText = canvas.style.cssText;
  container.append(fallbackCanvas);
  cleanups.push(() => fallbackCanvas.remove());

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const state = {
    clock: 0,
    flowTime: 0,
    frameNo: 0,
    motion: reducedMotion.matches ? 0.45 : 1,
    audio: { bass: 0, mid: 0, high: 0, level: 0, loud: 1 } satisfies AudioLevels,
    tune: {
      exposure: 1,
      gamma: 2.35,
      swirl: 0.85,
      speed: 1,
      glow: 0.55,
      sat: 1.4,
      trail: 0.955,
      grid: 0.35,
      react: 1.5,
      ambient: 1,
      wave: 1,
    },
    palA: 0,
    palB: 1,
    palMix: 0,
    palStep: 0,
    flares: [] as Flare[],
    nextIdle: 5,
  };
  const track = deriveTrack(audioElement.dataset.orbTrackName || audioElement.currentSrc || audioElement.src || "Sanctuary");
  state.palA = track.worlds[0] ?? 0;
  state.palB = track.worlds[1] ?? 1;

  const onMotionChange = () => {
    state.motion = reducedMotion.matches ? 0.45 : 1;
  };
  reducedMotion.addEventListener("change", onMotionChange);
  cleanups.push(() => reducedMotion.removeEventListener("change", onMotionChange));

  const analyser = attachAudioAnalysis(audioElement, state.audio, () => state.clock);
  cleanups.push(analyser.detach);

  let gl: WebGL2RenderingContext | null = null;
  let fallbackContext: CanvasRenderingContext2D | null = null;
  const denseDisplay = window.matchMedia("(hover: none) and (pointer: coarse)").matches && (window.devicePixelRatio || 1) >= 2;
  let scaleIndex = denseDisplay ? 2 : 1;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let accumulatorSide = 0;
  let stateTarget: Target | null = null;
  let nextStateTarget: Target | null = null;
  let accumulator: Target | null = null;
  let nextAccumulator: Target | null = null;
  let toneTarget: Target | null = null;
  let bloomA: Target | null = null;
  let bloomB: Target | null = null;
  let wideA: Target | null = null;
  let wideB: Target | null = null;
  let paletteTarget: Target | null = null;
  let waveTarget: Target | null = null;
  let vertexArray: WebGLVertexArrayObject | null = null;
  const programs: ProgramInfo[] = [];

  const affine = new Float32Array(NT * 9);
  const variation1 = new Float32Array(NT * 4);
  const variation2 = new Float32Array(NT * 4);
  const variation3 = new Float32Array(NT * 4);
  const metadata = new Float32Array(NT * 4);
  const finalTransform = new Float32Array(9);
  const flareBuffer = new Float32Array(16);
  const trailBuffer = new Float32Array(40);
  const trail: TrailPoint[] = [];
  const activePointers = new Map<number, { x: number; y: number }>();
  let flareCount = 0;
  let trailCount = 0;
  let lastFlareAt = -9;

  const paletteBytes = new Uint8Array(256 * 4);
  const background = [0.45, 0.5, 0.7];
  let palettePhaseLength = 20;
  let palettePhaseTime = 0;

  const waveBytes = new Uint8Array(WAVE_N * 4);
  const waveShape = new Float32Array(WAVE_N);
  const waveMedium = new Float32Array(WAVE_N);
  const waveWide = new Float32Array(WAVE_N);
  const beatQueue: Array<{ at: number; strength: number }> = [];
  let wavePulse = 0;
  let waveVelocity = 0;

  const cpu = {
    histogram: null as Float32Array | null,
    side: 0,
    image: null as ImageData | null,
    pixels: null as Uint8ClampedArray | null,
    x: 0.1,
    y: 0.2,
    colour: 0.5,
  };
  const cpuAffine = new Float32Array(NT * 9);

  let updateProgram: ProgramInfo;
  let scatterProgram: ProgramInfo;
  let decayProgram: ProgramInfo;
  let toneProgram: ProgramInfo;
  let brightProgram: ProgramInfo;
  let blurProgram: ProgramInfo;
  let spillProgram: ProgramInfo;
  let compositeProgram: ProgramInfo;
  let float32Accumulator = false;
  let accumulatorFormat = 0;

  function layout(): Layout {
    const currentDpr = gl ? dpr : 1;
    const layoutWidth = Math.max(1, container.clientWidth * currentDpr);
    const layoutHeight = Math.max(1, container.clientHeight * currentDpr);
    const diameter = orbScale
      ? Math.max(1, orbScale(layoutWidth / currentDpr, layoutHeight / currentDpr) * currentDpr)
      : Math.min(Math.min(layoutWidth, layoutHeight) * 0.94, layoutWidth * 0.88);
    return { x: layoutWidth * 0.5, y: layoutHeight * 0.5, d: diameter };
  }

  function compileShader(type: number, source: string) {
    if (!gl) throw new Error("WebGL is unavailable");
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Could not create flame shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) ?? "Unknown flame shader error";
      gl.deleteShader(shader);
      throw new Error(log);
    }
    return shader;
  }

  function createProgram(vertexSource: string, fragmentSource: string): ProgramInfo {
    if (!gl) throw new Error("WebGL is unavailable");
    const program = gl.createProgram();
    if (!program) throw new Error("Could not create flame program");
    const vertex = compileShader(gl.VERTEX_SHADER, vertexSource);
    const fragment = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? "Unknown flame link error";
      gl.deleteProgram(program);
      throw new Error(log);
    }
    const uniforms: Uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
    for (let index = 0; index < count; index += 1) {
      const active = gl.getActiveUniform(program, index);
      if (active) uniforms[active.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(program, active.name);
    }
    const info = { program, uniforms };
    programs.push(info);
    return info;
  }

  function makeTarget(format: number, targetWidth: number, targetHeight: number, filter?: number): Target {
    if (!gl) throw new Error("WebGL is unavailable");
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) throw new Error("Could not create flame render target");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, format, targetWidth, targetHeight);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter ?? gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter ?? gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      throw new Error("Incomplete flame render target");
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { texture, framebuffer, width: targetWidth, height: targetHeight };
  }

  function deleteTarget(target: Target | null) {
    if (!gl || !target) return;
    gl.deleteFramebuffer(target.framebuffer);
    gl.deleteTexture(target.texture);
  }

  function seedState(side: number) {
    if (!gl || !stateTarget) return;
    const data = new Float32Array(side * side * 4);
    const unsigned = new Uint32Array(1);
    const floating = new Float32Array(unsigned.buffer);
    for (let index = 0; index < side * side; index += 1) {
      data[index * 4] = Math.random() * 2 - 1;
      data[index * 4 + 1] = Math.random() * 2 - 1;
      data[index * 4 + 2] = Math.random();
      unsigned[0] = ((index * 2654435761) >>> 0) || 1;
      data[index * 4 + 3] = floating[0] ?? 0;
    }
    gl.bindTexture(gl.TEXTURE_2D, stateTarget.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, side, side, gl.RGBA, gl.FLOAT, data);
  }

  function rebuildStateTargets() {
    if (!gl) return;
    const side = SCALE_STEPS[scaleIndex] ?? SCALE_STEPS[2];
    if (stateTarget?.width === side) return;
    deleteTarget(stateTarget);
    deleteTarget(nextStateTarget);
    stateTarget = makeTarget(gl.RGBA32F, side, side);
    nextStateTarget = makeTarget(gl.RGBA32F, side, side);
    seedState(side);
  }

  function clearAccumulators() {
    if (!gl || !accumulator || !nextAccumulator) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, accumulator.framebuffer);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, nextAccumulator.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  function resizeGl() {
    if (!gl) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const nextWidth = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const nextHeight = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }
    width = nextWidth;
    height = nextHeight;
    const side = clamp(Math.round(Math.min(width, height) * 0.98 * RECT_K), 384, 1600);
    if (side !== accumulatorSide) {
      accumulatorSide = side;
      for (const target of [accumulator, nextAccumulator, toneTarget, bloomA, bloomB]) deleteTarget(target);
      accumulator = makeTarget(accumulatorFormat, side, side);
      nextAccumulator = makeTarget(accumulatorFormat, side, side);
      toneTarget = makeTarget(gl.RGBA8, side, side, gl.LINEAR);
      const bloomSide = Math.max(64, side >> 2);
      bloomA = makeTarget(gl.RGBA8, bloomSide, bloomSide, gl.LINEAR);
      bloomB = makeTarget(gl.RGBA8, bloomSide, bloomSide, gl.LINEAR);
      clearAccumulators();
    }
    const wideWidth = Math.max(32, width >> 3);
    const wideHeight = Math.max(32, height >> 3);
    if (!wideA || wideA.width !== wideWidth || wideA.height !== wideHeight) {
      deleteTarget(wideA);
      deleteTarget(wideB);
      wideA = makeTarget(gl.RGBA8, wideWidth, wideHeight, gl.LINEAR);
      wideB = makeTarget(gl.RGBA8, wideWidth, wideHeight, gl.LINEAR);
    }
    rebuildStateTargets();
  }

  function initialiseGl() {
    gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!gl) return false;
    try {
      if (!gl.getExtension("EXT_color_buffer_float")) throw new Error("No float render targets");
      float32Accumulator = Boolean(gl.getExtension("EXT_float_blend"));
      accumulatorFormat = float32Accumulator ? gl.RGBA32F : gl.RGBA16F;
      updateProgram = createProgram(QUAD_VERTEX, UPDATE_FRAGMENT);
      scatterProgram = createProgram(SCATTER_VERTEX, SCATTER_FRAGMENT);
      decayProgram = createProgram(QUAD_VERTEX, DECAY_FRAGMENT);
      toneProgram = createProgram(QUAD_VERTEX, TONE_FRAGMENT);
      brightProgram = createProgram(QUAD_VERTEX, BRIGHT_FRAGMENT);
      blurProgram = createProgram(QUAD_VERTEX, BLUR_FRAGMENT);
      spillProgram = createProgram(QUAD_VERTEX, SPILL_FRAGMENT);
      compositeProgram = createProgram(QUAD_VERTEX, COMPOSITE_FRAGMENT);
      vertexArray = gl.createVertexArray();
      gl.bindVertexArray(vertexArray);
      gl.disable(gl.DEPTH_TEST);
      resizeGl();
      return true;
    } catch (error) {
      console.error("flame init:", error);
      destroyGlResources();
      gl = null;
      return false;
    }
  }

  function palAt(palette: Palette, value: number): Rgb {
    const last = palette.length - 1;
    const position = clamp(value, 0, 1) * last;
    const index = Math.min(last - 1, Math.floor(position));
    const fraction = position - index;
    const smooth = fraction * fraction * (3 - 2 * fraction);
    const a = palette[index] ?? palette[0] ?? [0, 0, 0];
    const b = palette[index + 1] ?? a;
    return [
      a[0] + (b[0] - a[0]) * smooth,
      a[1] + (b[1] - a[1]) * smooth,
      a[2] + (b[2] - a[2]) * smooth,
    ];
  }

  function updatePalette(dt: number) {
    if (!gl) return;
    palettePhaseTime += dt;
    if (palettePhaseTime >= palettePhaseLength) {
      palettePhaseTime = 0;
      palettePhaseLength = 12 + 8 * (0.5 + 0.5 * Math.sin(state.clock * 0.037 + track.flowSeed));
      state.palStep = (state.palStep + 1) % track.worlds.length;
      state.palA = state.palB;
      state.palB = track.worlds[(state.palStep + 1) % track.worlds.length] ?? state.palA;
    }
    const fraction = clamp(palettePhaseTime / palettePhaseLength, 0, 1);
    state.palMix = fraction * fraction * (3 - 2 * fraction);
    const paletteA = PAL_RGB[state.palA] ?? PAL_RGB[0];
    const paletteB = PAL_RGB[state.palB] ?? PAL_RGB[1];
    if (!paletteA || !paletteB) return;
    const wipeWidth = 0.3;
    const edge = (1 + 2 * wipeWidth) * (1 - state.palMix) - wipeWidth;
    for (let index = 0; index < 256; index += 1) {
      const position = index / 255;
      let mix = clamp((edge - position) / (2 * wipeWidth) + 0.5, 0, 1);
      mix = mix * mix * (3 - 2 * mix);
      const a = palAt(paletteA, position);
      const b = palAt(paletteB, position);
      paletteBytes[index * 4] = 255 * clamp(a[0] + (b[0] - a[0]) * mix, 0, 1);
      paletteBytes[index * 4 + 1] = 255 * clamp(a[1] + (b[1] - a[1]) * mix, 0, 1);
      paletteBytes[index * 4 + 2] = 255 * clamp(a[2] + (b[2] - a[2]) * mix, 0, 1);
      paletteBytes[index * 4 + 3] = 255;
    }
    let red = 0;
    let green = 0;
    let blue = 0;
    for (let index = 90; index < 200; index += 8) {
      red += paletteBytes[index * 4] ?? 0;
      green += paletteBytes[index * 4 + 1] ?? 0;
      blue += paletteBytes[index * 4 + 2] ?? 0;
    }
    const count = Math.ceil((200 - 90) / 8);
    const inverse = 1 / (count * 255);
    const target = [red * inverse, green * inverse, blue * inverse];
    const maximum = Math.max(target[0] ?? 0, target[1] ?? 0, target[2] ?? 0, 0.001);
    for (let index = 0; index < 3; index += 1) {
      const value = ((target[index] ?? 0) / maximum) * 0.74 + 0.26;
      background[index] = (background[index] ?? 0) + (value - (background[index] ?? 0)) * (1 - Math.exp(-dt / 1.6));
    }
    if (!paletteTarget) paletteTarget = makeTarget(gl.RGBA8, 256, 1, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, paletteTarget.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, paletteBytes);
  }

  function boxSmooth(source: Float32Array, destination: Float32Array, radius: number) {
    const length = source.length;
    const windowSize = radius * 2 + 1;
    let sum = 0;
    for (let index = -radius; index <= radius; index += 1) sum += source[Math.min(length - 1, Math.max(0, index))] ?? 0;
    for (let index = 0; index < length; index += 1) {
      destination[index] = sum / windowSize;
      sum -= source[Math.min(length - 1, Math.max(0, index - radius))] ?? 0;
      sum += source[Math.min(length - 1, Math.max(0, index + radius + 1))] ?? 0;
    }
  }

  function queueBeat(strength: number) {
    beatQueue.push({
      at: state.clock + Math.max(0, analyser.outputLag() + WAVE_LAG),
      strength: clamp(strength, 0.2, 3),
    });
    if (beatQueue.length > 8) beatQueue.shift();
  }

  function updateWave(dt: number) {
    if (!gl) return;
    while (beatQueue.length && (beatQueue[0]?.at ?? Number.POSITIVE_INFINITY) <= state.clock) {
      const beat = beatQueue.shift();
      if (!beat) break;
      const hit = 0.55 + (0.45 * Math.min(beat.strength, 2)) / 2;
      wavePulse = Math.max(wavePulse, hit);
      waveVelocity = Math.max(waveVelocity, hit * 3.2);
    }
    waveVelocity -= waveVelocity * Math.min(1, dt * 11);
    wavePulse += waveVelocity * dt;
    wavePulse -= wavePulse * Math.min(1, dt * 3.1);
    wavePulse = clamp(wavePulse, 0, 1.35);
    const live = analyser.envelopeSlices(WAVE_N);
    const smoothing = 1 - Math.exp(-dt / 0.22);
    for (let index = 0; index < WAVE_N; index += 1) {
      waveShape[index] = (waveShape[index] ?? 0) + ((live[index] ?? 0) - (waveShape[index] ?? 0)) * smoothing;
    }
    boxSmooth(waveShape, waveMedium, 14);
    boxSmooth(waveMedium, waveWide, 46);
    const amplitude = 0.1 + wavePulse * 0.9 * state.motion;
    for (let index = 0; index < WAVE_N; index += 1) {
      waveBytes[index * 4] = Math.round(clamp((waveShape[index] ?? 0) * amplitude, 0, 1) * 255);
      waveBytes[index * 4 + 1] = Math.round(clamp((waveMedium[index] ?? 0) * amplitude, 0, 1) * 255);
      waveBytes[index * 4 + 2] = Math.round(clamp((waveWide[index] ?? 0) * amplitude, 0, 1) * 255);
      waveBytes[index * 4 + 3] = 255;
    }
    if (!waveTarget) waveTarget = makeTarget(gl.RGBA8, WAVE_N, 1, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, waveTarget.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, WAVE_N, 1, gl.RGBA, gl.UNSIGNED_BYTE, waveBytes);
  }

  function addFlare(strength: number) {
    if (state.clock - lastFlareAt < 0.34) return;
    lastFlareAt = state.clock;
    const amplitude = clamp(strength, 0.15, 3);
    state.flares.push({
      t: 0,
      amp: 0.22 + amplitude * 0.32,
      dur: 1.9 + Math.min(amplitude, 2) * 0.6,
      reach: 0.85 + Math.min(amplitude, 2) * 0.22,
    });
    if (state.flares.length > 4) state.flares.shift();
  }

  function updateFlares(dt: number) {
    state.flares = state.flares.filter((flare) => {
      flare.t += dt;
      return flare.t < flare.dur;
    });
    flareCount = Math.min(state.flares.length, 4);
    for (let index = 0; index < 4; index += 1) {
      const flare = state.flares[index];
      if (!flare) {
        flareBuffer[index * 4] = 0;
        flareBuffer[index * 4 + 1] = 0;
        flareBuffer[index * 4 + 2] = 1;
        flareBuffer[index * 4 + 3] = 0;
        continue;
      }
      const progress = flare.t / flare.dur;
      flareBuffer[index * 4] = Math.pow(progress, 0.62) * flare.reach;
      flareBuffer[index * 4 + 1] = flare.amp * Math.pow(1 - progress, 1.6) * state.motion;
      flareBuffer[index * 4 + 2] = 0.13 + 0.22 * progress;
      flareBuffer[index * 4 + 3] = 0;
    }
  }

  function discCoordinates(clientX: number, clientY: number) {
    const rect = (gl ? canvas : fallbackCanvas).getBoundingClientRect();
    const currentDpr = gl ? dpr : 1;
    const currentLayout = layout();
    const pixelX = (clientX - rect.left) * currentDpr;
    const pixelY = (clientY - rect.top) * currentDpr;
    const half = currentLayout.d * 0.5;
    return [
      (pixelX - currentLayout.x) / half / 0.94,
      (currentLayout.y - pixelY) / half / 0.94,
    ] as const;
  }

  function addTrail(clientX: number, clientY: number, strength: number) {
    const [x, y] = discCoordinates(clientX, clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x * x + y * y > 2.6) return;
    const previous = trail[trail.length - 1];
    if (previous) {
      const dx = x - previous.x;
      const dy = y - previous.y;
      const distance = Math.hypot(dx, dy);
      const steps = Math.min(4, Math.floor(distance / 0.09));
      for (let index = 1; index <= steps; index += 1) {
        trail.push({
          x: previous.x + (dx * index) / (steps + 1),
          y: previous.y + (dy * index) / (steps + 1),
          s: strength * 0.75,
          r: 0.2,
        });
      }
    }
    trail.push({ x, y, s: strength, r: 0.22 });
    while (trail.length > 10) trail.shift();
  }

  function updateTrail(dt: number) {
    for (let index = trail.length - 1; index >= 0; index -= 1) {
      const point = trail[index];
      if (!point) continue;
      point.s *= Math.exp(-dt / 1.15);
      point.r += dt * 0.1;
      if (point.s < 0.02) trail.splice(index, 1);
    }
    trailCount = Math.min(trail.length, 10);
    for (let index = 0; index < 10; index += 1) {
      const point = trail[index];
      trailBuffer[index * 4] = point?.x ?? 0;
      trailBuffer[index * 4 + 1] = point?.y ?? 0;
      trailBuffer[index * 4 + 2] = point ? point.s * state.motion : 0;
      trailBuffer[index * 4 + 3] = point?.r ?? 1;
    }
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    addTrail(event.clientX, event.clientY, 0.85);
    try {
      event.currentTarget instanceof Element && event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is optional on older touch browsers.
    }
    event.preventDefault();
  };
  const onPointerMove = (event: PointerEvent) => {
    const previous = activePointers.get(event.pointerId);
    const held = previous !== undefined;
    if (!held && event.pointerType !== "mouse") return;
    const speed = previous
      ? Math.min(1, Math.hypot(event.clientX - previous.x, event.clientY - previous.y) / 26)
      : 0.35;
    addTrail(event.clientX, event.clientY, (held ? 0.7 : 0.3) * (0.45 + 0.75 * speed));
    if (held) {
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      event.preventDefault();
    }
  };
  const onPointerUp = (event: PointerEvent) => {
    activePointers.delete(event.pointerId);
  };

  for (const target of [canvas, fallbackCanvas]) {
    target.addEventListener("pointerdown", onPointerDown);
    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", onPointerUp);
    target.addEventListener("pointercancel", onPointerUp);
    target.addEventListener("lostpointercapture", onPointerUp);
    cleanups.push(() => {
      target.removeEventListener("pointerdown", onPointerDown);
      target.removeEventListener("pointermove", onPointerMove);
      target.removeEventListener("pointerup", onPointerUp);
      target.removeEventListener("pointercancel", onPointerUp);
      target.removeEventListener("lostpointercapture", onPointerUp);
    });
  }

  function updateFlameParameters(time: number) {
    const seed = track.flowSeed;
    const mix = state.tune.swirl;
    const grid = state.tune.grid;
    const audio = state.audio;
    const reactivity = state.tune.react;
    const bass = 1 + (audio.bass - 0.45) * 0.5 * reactivity;
    const mid = 1 + (audio.mid - 0.42) * 0.6 * reactivity;
    const high = 1 + (audio.high - 0.4) * 0.65 * reactivity;
    let cumulative = 0;
    const transformWeights: number[] = [];
    for (let index = 0; index < NT; index += 1) {
      transformWeights.push((index === 0 ? 2.6 : 0.55) + 0.85 * (0.5 + 0.5 * Math.sin(time * 0.0298 + index * 1.7 + seed)));
    }
    const total = transformWeights.reduce((sum, weight) => sum + weight, 0);
    for (let index = 0; index < NT; index += 1) {
      const core = index === 0;
      const phase = index * 2.3999632 + seed;
      const rotation = phase + time * 0.0345 * (index % 2 ? 1 : -1) + 0.85 * Math.sin(time * 0.0178 + phase);
      const scale = core
        ? 0.19 + 0.07 * Math.sin(time * 0.0178 + phase)
        : 0.52 + 0.3 * Math.sin(time * 0.0252 + phase * 1.3);
      const cosine = Math.cos(rotation) * scale;
      const sine = Math.sin(rotation) * scale;
      const offset = core ? 0.055 : 0.62;
      const x = offset * Math.sin(time * 0.0312 + phase * 2.1);
      const y = offset * Math.cos(time * 0.0377 + phase * 1.3);
      affine[index * 9] = cosine;
      affine[index * 9 + 1] = sine;
      affine[index * 9 + 2] = 0;
      affine[index * 9 + 3] = -sine;
      affine[index * 9 + 4] = cosine;
      affine[index * 9 + 5] = 0;
      affine[index * 9 + 6] = x;
      affine[index * 9 + 7] = y;
      affine[index * 9 + 8] = 1;
      const q = time * 0.0475 + index * 1.9 + seed;
      const weights = [
        (core ? 2.4 : 0.55) + 0.3 * Math.sin(q * 0.83),
        (core ? 0.1 : 0.34) + 0.26 * Math.sin(q * 1.13 + 1),
        0.3 + 0.26 * Math.sin(q * 0.71 + 2),
        0.16 + 0.16 * Math.sin(q * 1.31 + 3),
        0.2 + 0.18 * Math.sin(q * 0.97 + 4),
        0.2 + 0.18 * Math.sin(q * 1.19 + 5),
        0.14 + 0.14 * Math.sin(q * 0.61 + 6),
        0.22 + 0.2 * Math.sin(q * 0.89 + 7),
        0.18 + 0.16 * Math.sin(q * 1.07 + 8),
        grid * (0.16 + 0.16 * Math.sin(time * 0.0113 + index)),
        0.14 + 0.14 * Math.sin(q * 0.77 + 9),
        0.12 + 0.12 * Math.sin(q * 1.23 + 10),
      ];
      for (let variation = 0; variation < 12; variation += 1) {
        weights[variation] = Math.max(0, weights[variation] ?? 0) * (variation === 0 ? 1 : mix * (core ? 0.16 : 1));
      }
      const sum = weights.reduce((current, weight) => current + weight, 0);
      const inverse = 1.12 / Math.max(sum, 0.001);
      variation1[index * 4] = (weights[0] ?? 0) * inverse;
      variation1[index * 4 + 1] = (weights[1] ?? 0) * inverse * bass;
      variation1[index * 4 + 2] = (weights[2] ?? 0) * inverse * mid;
      variation1[index * 4 + 3] = (weights[3] ?? 0) * inverse;
      variation2[index * 4] = (weights[4] ?? 0) * inverse;
      variation2[index * 4 + 1] = (weights[5] ?? 0) * inverse * high;
      variation2[index * 4 + 2] = (weights[6] ?? 0) * inverse;
      variation2[index * 4 + 3] = (weights[7] ?? 0) * inverse * mid;
      variation3[index * 4] = (weights[8] ?? 0) * inverse * high;
      variation3[index * 4 + 1] = (weights[9] ?? 0) * inverse;
      variation3[index * 4 + 2] = (weights[10] ?? 0) * inverse;
      variation3[index * 4 + 3] = (weights[11] ?? 0) * inverse;
      cumulative += (transformWeights[index] ?? 0) / total;
      metadata[index * 4] = index / (NT - 1);
      metadata[index * 4 + 1] = cumulative;
      metadata[index * 4 + 2] = 0.7 * Math.sin(time * 0.0107 + index + seed);
      metadata[index * 4 + 3] = 0.5 * Math.cos(time * 0.0087 + index + seed);
    }
    const rotation = time * 0.0168 + seed * 0.1;
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const offsetX = 0.1 * Math.sin(time * 0.0071 + seed);
    const offsetY = 0.1 * Math.cos(time * 0.0059 + seed);
    finalTransform.set([cosine, sine, 0, -sine, cosine, 0, offsetX, offsetY, 1]);
  }

  function drawFlame(dt: number) {
    if (
      !gl || !stateTarget || !nextStateTarget || !accumulator || !nextAccumulator || !toneTarget ||
      !bloomA || !bloomB || !wideA || !wideB
    ) return;
    updateFlameParameters(state.flowTime);
    updatePalette(dt);
    if (!paletteTarget || !waveTarget) return;
    const pointSide = SCALE_STEPS[scaleIndex] ?? SCALE_STEPS[2];

    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, nextStateTarget.framebuffer);
    gl.viewport(0, 0, pointSide, pointSide);
    gl.useProgram(updateProgram.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, stateTarget.texture);
    gl.uniform1i(updateProgram.uniforms.uState, 0);
    gl.uniform1i(updateProgram.uniforms.uSize, pointSide);
    gl.uniformMatrix3fv(updateProgram.uniforms.uAff, false, affine);
    gl.uniform4fv(updateProgram.uniforms.uV1, variation1);
    gl.uniform4fv(updateProgram.uniforms.uV2, variation2);
    gl.uniform4fv(updateProgram.uniforms.uV3, variation3);
    gl.uniform4fv(updateProgram.uniforms.uMeta, metadata);
    gl.uniform1f(updateProgram.uniforms.uSym, track.sym);
    gl.uniform1f(updateProgram.uniforms.uSymP, 0.34);
    gl.uniform2f(updateProgram.uniforms.uGridK, 0.55 + 0.25 * Math.sin(state.flowTime * 0.009), 0.55 + 0.25 * Math.cos(state.flowTime * 0.011));
    gl.uniform1ui(updateProgram.uniforms.uSeed, state.frameNo >>> 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    [stateTarget, nextStateTarget] = [nextStateTarget, stateTarget];

    gl.bindFramebuffer(gl.FRAMEBUFFER, nextAccumulator.framebuffer);
    gl.viewport(0, 0, accumulatorSide, accumulatorSide);
    gl.useProgram(decayProgram.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, accumulator.texture);
    gl.uniform1i(decayProgram.uniforms.uT, 0);
    const maximumTrail = float32Accumulator ? 0.995 : 0.955;
    gl.uniform1f(decayProgram.uniforms.uD, Math.min(state.tune.trail, maximumTrail));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    [accumulator, nextAccumulator] = [nextAccumulator, accumulator];

    gl.bindFramebuffer(gl.FRAMEBUFFER, accumulator.framebuffer);
    gl.viewport(0, 0, accumulatorSide, accumulatorSide);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(scatterProgram.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, stateTarget.texture);
    gl.uniform1i(scatterProgram.uniforms.uState, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, paletteTarget.texture);
    gl.uniform1i(scatterProgram.uniforms.uPal, 1);
    gl.uniform1i(scatterProgram.uniforms.uSize, pointSide);
    gl.uniformMatrix3fv(scatterProgram.uniforms.uFin, false, finalTransform);
    gl.uniform2f(scatterProgram.uniforms.uFinW, 0.04, 0.96);
    gl.uniform2f(scatterProgram.uniforms.uAsp, 1, 1);
    gl.uniform1f(scatterProgram.uniforms.uZoom, FLAME_FILL);
    gl.uniform1f(scatterProgram.uniforms.uCiShift, clamp((state.audio.bass - 0.5) * 0.07 * state.tune.react, -0.1, 0.1));
    gl.uniform4fv(scatterProgram.uniforms.uFlare, flareBuffer);
    gl.uniform4fv(scatterProgram.uniforms.uTrail, trailBuffer);
    gl.uniform3f(scatterProgram.uniforms.uTrailK, 0.115, 0.085, 1.5);
    gl.uniform1i(scatterProgram.uniforms.uTrailN, trailCount);
    gl.uniform1i(scatterProgram.uniforms.uFlareN, flareCount);
    gl.drawArrays(gl.POINTS, 0, STEPS_FOR[scaleIndex] ?? STEPS_FOR[2]);
    gl.disable(gl.BLEND);

    const loudness = clamp(1 + (state.audio.loud - 0.55) * 0.55 * state.tune.react, 0.55, 1.7);
    gl.bindFramebuffer(gl.FRAMEBUFFER, toneTarget.framebuffer);
    gl.viewport(0, 0, accumulatorSide, accumulatorSide);
    gl.useProgram(toneProgram.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, accumulator.texture);
    gl.uniform1i(toneProgram.uniforms.uT, 0);
    const decay = Math.min(state.tune.trail, maximumTrail);
    const discArea = Math.PI * Math.pow(accumulatorSide * FLAME_FILL * 0.5, 2);
    const meanDensity = (STEPS_FOR[scaleIndex] ?? STEPS_FOR[2]) / Math.max(1 - decay, 0.005) / discArea;
    gl.uniform1f(toneProgram.uniforms.uExp, state.tune.exposure * loudness * 0.85 / Math.max(meanDensity, 0.000001));
    gl.uniform1f(toneProgram.uniforms.uGamma, state.tune.gamma);
    gl.uniform1f(toneProgram.uniforms.uSat, state.tune.sat);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const bloomSide = bloomA.width;
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.framebuffer);
    gl.viewport(0, 0, bloomSide, bloomSide);
    gl.useProgram(brightProgram.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, toneTarget.texture);
    gl.uniform1i(brightProgram.uniforms.uTex, 0);
    gl.uniform2f(brightProgram.uniforms.uRes, bloomSide, bloomSide);
    gl.uniform1f(brightProgram.uniforms.uThreshold, 0.42);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    for (const [source, destination, directionX, directionY] of [
      [bloomA, bloomB, 1.4, 0],
      [bloomB, bloomA, 0, 1.4],
    ] as const) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer);
      gl.viewport(0, 0, bloomSide, bloomSide);
      gl.useProgram(blurProgram.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, source.texture);
      gl.uniform1i(blurProgram.uniforms.uTex, 0);
      gl.uniform2f(blurProgram.uniforms.uRes, bloomSide, bloomSide);
      gl.uniform2f(blurProgram.uniforms.uDir, directionX, directionY);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    const currentLayout = layout();
    const rectangleDiameter = currentLayout.d * RECT_K;
    const offsetX = currentLayout.x - rectangleDiameter * 0.5;
    const offsetY = height - (currentLayout.y + rectangleDiameter * 0.5);
    const wideWidth = wideA.width;
    const wideHeight = wideA.height;
    const step = width / wideWidth;
    gl.bindFramebuffer(gl.FRAMEBUFFER, wideA.framebuffer);
    gl.viewport(0, 0, wideWidth, wideHeight);
    gl.useProgram(spillProgram.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, toneTarget.texture);
    gl.uniform1i(spillProgram.uniforms.uTex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomA.texture);
    gl.uniform1i(spillProgram.uniforms.uBloom, 1);
    gl.uniform2f(spillProgram.uniforms.uRes, wideWidth, wideHeight);
    gl.uniform2f(spillProgram.uniforms.uOff, offsetX, offsetY);
    gl.uniform2f(spillProgram.uniforms.uScale, rectangleDiameter, step);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    for (const [source, destination, directionX, directionY] of [
      [wideA, wideB, 5.5, 0],
      [wideB, wideA, 0, 5.5],
      [wideA, wideB, 2.4, 0],
      [wideB, wideA, 0, 2.4],
    ] as const) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer);
      gl.viewport(0, 0, wideWidth, wideHeight);
      gl.useProgram(blurProgram.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, source.texture);
      gl.uniform1i(blurProgram.uniforms.uTex, 0);
      gl.uniform2f(blurProgram.uniforms.uRes, wideWidth, wideHeight);
      gl.uniform2f(blurProgram.uniforms.uDir, directionX, directionY);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(compositeProgram.program);
    for (const [unit, texture, uniform] of [
      [0, toneTarget.texture, compositeProgram.uniforms.uTex],
      [1, bloomA.texture, compositeProgram.uniforms.uBloom],
      [2, wideA.texture, compositeProgram.uniforms.uWide],
      [3, waveTarget.texture, compositeProgram.uniforms.uWave],
      [4, paletteTarget.texture, compositeProgram.uniforms.uPalC],
    ] as const) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uniform, unit);
    }
    gl.uniform4f(compositeProgram.uniforms.uWaveK, currentLayout.d * 0.76, currentLayout.d * 0.5, 0.84 * state.tune.wave, 0);
    gl.uniform2f(compositeProgram.uniforms.uRes, width, height);
    gl.uniform2f(compositeProgram.uniforms.uSrcRes, accumulatorSide, accumulatorSide);
    gl.uniform2f(compositeProgram.uniforms.uScale, rectangleDiameter, rectangleDiameter);
    gl.uniform2f(compositeProgram.uniforms.uOff, offsetX, offsetY);
    gl.uniform2f(compositeProgram.uniforms.uCentre, currentLayout.x, height - currentLayout.y);
    gl.uniform1f(compositeProgram.uniforms.uGlow, state.tune.glow * clamp(1 + (state.audio.high - 0.4) * 0.65 * state.tune.react, 0.45, 2));
    gl.uniform1f(compositeProgram.uniforms.uSpill, (0.3 + 0.34 * state.tune.glow) * state.tune.ambient);
    gl.uniform1f(compositeProgram.uniforms.uAmbient, state.tune.ambient);
    gl.uniform3f(compositeProgram.uniforms.uBgCol, background[0] ?? 0, background[1] ?? 0, background[2] ?? 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function updateCpuParameters(time: number) {
    const seed = track.flowSeed;
    for (let index = 0; index < NT; index += 1) {
      const phase = index * 2.3999632 + seed;
      const rotation = phase + time * 0.017 * (index % 2 ? 1 : -1) + 0.55 * Math.sin(time * 0.0091 + phase);
      const scale = 0.52 + 0.3 * Math.sin(time * 0.0131 + phase * 1.3);
      const cosine = Math.cos(rotation) * scale;
      const sine = Math.sin(rotation) * scale;
      cpuAffine[index * 9] = cosine;
      cpuAffine[index * 9 + 1] = sine;
      cpuAffine[index * 9 + 3] = -sine;
      cpuAffine[index * 9 + 4] = cosine;
      cpuAffine[index * 9 + 6] = 0.62 * Math.sin(time * 0.0163 + phase * 2.1);
      cpuAffine[index * 9 + 7] = 0.62 * Math.cos(time * 0.0197 + phase * 1.3);
    }
  }

  function drawFallback(dt: number) {
    if (!fallbackContext) return;
    const fallbackWidth = Math.max(1, Math.round(fallbackCanvas.clientWidth));
    const fallbackHeight = Math.max(1, Math.round(fallbackCanvas.clientHeight));
    if (fallbackCanvas.width !== fallbackWidth || fallbackCanvas.height !== fallbackHeight) {
      fallbackCanvas.width = fallbackWidth;
      fallbackCanvas.height = fallbackHeight;
      cpu.side = 0;
    }
    const side = Math.min(fallbackWidth, fallbackHeight);
    if (cpu.side !== side) {
      cpu.side = side;
      cpu.histogram = new Float32Array(side * side * 4);
      cpu.image = fallbackContext.createImageData(side, side);
      cpu.pixels = cpu.image.data;
    }
    const histogram = cpu.histogram;
    if (!histogram || !cpu.image || !cpu.pixels) return;
    updatePaletteCpu(dt);
    updateCpuParameters(state.flowTime);
    for (let index = 0; index < histogram.length; index += 1) histogram[index] = (histogram[index] ?? 0) * 0.93;
    let x = cpu.x;
    let y = cpu.y;
    let colour = cpu.colour;
    const paletteA = PAL_RGB[state.palA] ?? PAL_RGB[0];
    const paletteB = PAL_RGB[state.palB] ?? PAL_RGB[1];
    if (!paletteA || !paletteB) return;
    for (let sample = 0; sample < 40000; sample += 1) {
      const transform = (Math.random() * NT) | 0;
      const offset = transform * 9;
      const qx = (cpuAffine[offset] ?? 0) * x + (cpuAffine[offset + 3] ?? 0) * y + (cpuAffine[offset + 6] ?? 0);
      const qy = (cpuAffine[offset + 1] ?? 0) * x + (cpuAffine[offset + 4] ?? 0) * y + (cpuAffine[offset + 7] ?? 0);
      const radius2 = qx * qx + qy * qy + 0.000001;
      const radius = Math.sqrt(radius2);
      const angle = Math.atan2(qx, qy);
      const sine = Math.sin(radius2);
      const cosine = Math.cos(radius2);
      x = 0.42 * qx + 0.3 * (qx / radius2) + 0.18 * (qx * sine - qy * cosine) + 0.1 * (angle * 0.3183);
      y = 0.42 * qy + 0.3 * (qy / radius2) + 0.18 * (qx * cosine + qy * sine) + 0.1 * (radius - 1);
      const symmetry = (Math.random() * track.sym) | 0;
      const symmetryAngle = (TAU * symmetry) / track.sym;
      const symmetryCosine = Math.cos(symmetryAngle);
      const symmetrySine = Math.sin(symmetryAngle);
      const nextX = x * symmetryCosine - y * symmetrySine;
      y = x * symmetrySine + y * symmetryCosine;
      x = nextX;
      colour = (colour + transform / (NT - 1)) * 0.5;
      if (!(x * x + y * y < 1e6)) {
        x = Math.random() * 2 - 1;
        y = Math.random() * 2 - 1;
        colour = Math.random();
        continue;
      }
      if (sample < 24) continue;
      const bubble = 4 / (x * x + y * y + 4);
      const pixelX = (x * bubble * 0.94 * 0.5 + 0.5) * side;
      const pixelY = (0.5 - y * bubble * 0.94 * 0.5) * side;
      if (pixelX < 0 || pixelY < 0 || pixelX >= side || pixelY >= side) continue;
      const index = (((pixelY | 0) * side + (pixelX | 0)) * 4);
      const a = palAt(paletteA, colour);
      const b = palAt(paletteB, colour);
      histogram[index] = (histogram[index] ?? 0) + a[0] + (b[0] - a[0]) * state.palMix;
      histogram[index + 1] = (histogram[index + 1] ?? 0) + a[1] + (b[1] - a[1]) * state.palMix;
      histogram[index + 2] = (histogram[index + 2] ?? 0) + a[2] + (b[2] - a[2]) * state.palMix;
      histogram[index + 3] = (histogram[index + 3] ?? 0) + 1;
    }
    cpu.x = x;
    cpu.y = y;
    cpu.colour = colour;
    const exposure = 26 * state.tune.exposure;
    const inverseGamma = 1 / state.tune.gamma;
    for (let index = 0; index < side * side; index += 1) {
      const density = histogram[index * 4 + 3] ?? 0;
      if (density <= 0) {
        cpu.pixels[index * 4] = 0;
        cpu.pixels[index * 4 + 1] = 0;
        cpu.pixels[index * 4 + 2] = 0;
        cpu.pixels[index * 4 + 3] = 255;
        continue;
      }
      const light = Math.log(1 + density * exposure) / density;
      cpu.pixels[index * 4] = 255 * Math.min(1, Math.pow(Math.max((histogram[index * 4] ?? 0) * light, 0), inverseGamma));
      cpu.pixels[index * 4 + 1] = 255 * Math.min(1, Math.pow(Math.max((histogram[index * 4 + 1] ?? 0) * light, 0), inverseGamma));
      cpu.pixels[index * 4 + 2] = 255 * Math.min(1, Math.pow(Math.max((histogram[index * 4 + 2] ?? 0) * light, 0), inverseGamma));
      cpu.pixels[index * 4 + 3] = 255;
    }
    fallbackContext.fillStyle = "#000";
    fallbackContext.fillRect(0, 0, fallbackWidth, fallbackHeight);
    fallbackContext.putImageData(cpu.image, (fallbackWidth - side) >> 1, (fallbackHeight - side) >> 1);
  }

  function updatePaletteCpu(dt: number) {
    palettePhaseTime += dt;
    if (palettePhaseTime >= palettePhaseLength) {
      palettePhaseTime = 0;
      palettePhaseLength = 12 + 8 * (0.5 + 0.5 * Math.sin(state.clock * 0.037 + track.flowSeed));
      state.palStep = (state.palStep + 1) % track.worlds.length;
      state.palA = state.palB;
      state.palB = track.worlds[(state.palStep + 1) % track.worlds.length] ?? state.palA;
    }
    const fraction = clamp(palettePhaseTime / palettePhaseLength, 0, 1);
    state.palMix = fraction * fraction * (3 - 2 * fraction);
  }

  function startFallback() {
    canvas.hidden = true;
    fallbackCanvas.hidden = false;
    fallbackContext = fallbackCanvas.getContext("2d");
  }

  const performanceState = {
    window: [] as number[],
    windowSum: 0,
    settle: 2,
  };

  function adapt(raw: number) {
    if (!gl || raw <= 0) return;
    performanceState.window.push(raw);
    performanceState.windowSum += raw;
    while (performanceState.window.length > 10 && performanceState.windowSum > 1) {
      performanceState.windowSum -= performanceState.window.shift() ?? 0;
    }
    performanceState.settle -= raw;
    if (performanceState.settle > 0 || performanceState.window.length < 10) return;
    const sorted = performanceState.window.slice().sort((a, b) => a - b);
    const framesPerSecond = 1 / (sorted[sorted.length >> 1] ?? 1);
    if (framesPerSecond < 53.36 && scaleIndex < SCALE_STEPS.length - 1) {
      scaleIndex += 1;
      rebuildStateTargets();
      performanceState.settle = 2.5;
    }
  }

  function destroyGlResources() {
    if (!gl) return;
    for (const target of [
      stateTarget,
      nextStateTarget,
      accumulator,
      nextAccumulator,
      toneTarget,
      bloomA,
      bloomB,
      wideA,
      wideB,
      paletteTarget,
      waveTarget,
    ]) deleteTarget(target);
    stateTarget = null;
    nextStateTarget = null;
    accumulator = null;
    nextAccumulator = null;
    toneTarget = null;
    bloomA = null;
    bloomB = null;
    wideA = null;
    wideB = null;
    paletteTarget = null;
    waveTarget = null;
    for (const info of programs) gl.deleteProgram(info.program);
    programs.length = 0;
    if (vertexArray) gl.deleteVertexArray(vertexArray);
    vertexArray = null;
  }

  const onContextLost = (event: Event) => {
    event.preventDefault();
    gl = null;
    startFallback();
  };
  const onContextRestored = () => {
    fallbackContext = null;
    fallbackCanvas.hidden = true;
    canvas.hidden = false;
    if (!initialiseGl()) startFallback();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);
  cleanups.push(() => {
    canvas.removeEventListener("webglcontextlost", onContextLost);
    canvas.removeEventListener("webglcontextrestored", onContextRestored);
  });

  const resizeObserver = new ResizeObserver(() => {
    if (gl) resizeGl();
  });
  resizeObserver.observe(container);
  cleanups.push(() => resizeObserver.disconnect());

  const onVisibilityChange = () => {
    if (!document.hidden) performanceState.settle = Math.max(performanceState.settle, 1);
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  cleanups.push(() => document.removeEventListener("visibilitychange", onVisibilityChange));

  if (!initialiseGl()) startFallback();

  let previousFrame = 0;
  const frame = (now: number) => {
    if (stopped) return;
    const raw = previousFrame ? (now - previousFrame) / 1000 : 1 / 60;
    previousFrame = now;
    const dt = Math.min(raw, 0.1);
    state.frameNo += 1;
    analyser.analyse(dt);
    const beat = analyser.detectBeat(dt);
    if (beat > 0) {
      addFlare(beat * state.tune.react * 0.9);
      queueBeat(beat);
    }
    state.nextIdle -= dt;
    if (state.nextIdle <= 0) {
      state.nextIdle = (state.motion < 1 ? 9 : 5) + Math.random() * (state.motion < 1 ? 7 : 5);
      if (beat === 0) {
        addFlare(0.25 + Math.random() * 0.4);
        queueBeat(0.35);
      }
    }
    updateFlares(dt);
    updateTrail(dt);
    if (gl) updateWave(dt);
    const speed = state.tune.speed * state.motion;
    state.clock += dt * state.motion;
    state.flowTime += dt * speed * clamp(1 + (state.audio.level - 0.45) * 0.45 * state.tune.react, 0.25, 2.5);
    if (gl && !gl.isContextLost()) {
      if (canvas.width !== Math.round(canvas.clientWidth * dpr) || canvas.height !== Math.round(canvas.clientHeight * dpr)) resizeGl();
      drawFlame(dt);
      adapt(raw);
    } else if (fallbackContext) {
      drawFallback(dt);
    }
    rafId = requestAnimationFrame(frame);
  };
  rafId = requestAnimationFrame(frame);
  cleanups.push(() => cancelAnimationFrame(rafId));

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      for (let index = cleanups.length - 1; index >= 0; index -= 1) cleanups[index]?.();
      activePointers.clear();
      trail.length = 0;
      state.flares.length = 0;
      beatQueue.length = 0;
      destroyGlResources();
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      gl = null;
      fallbackContext = null;
      cpu.histogram = null;
      cpu.image = null;
      cpu.pixels = null;
    },
  };
}
