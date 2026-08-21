/* Transplanted verbatim from DESIGN-LOCKED-HALL.html.
   Every constant is that file's. Do not tune, round, simplify or refactor.
   The only departures are lifecycle — the source page never unmounts, this runs
   inside a route — and the shader, which now lives in its own file and is
   imported instead of read out of a <script> tag. */

import FRAG from "./hall.frag.glsl?raw";

/* mode 'preview' = /design-preview: the developer harness and the room stage are
   present and the journey runs on its own timers.
   mode 'entry'   = the real customer flow: no harness, no room stage, and the
   wait ends when the caller says the psychic accepted, not on a timer.
   mode 'room'    = the live reading. No request panel and no harness; React owns
   the thread and the composer, and the caller drives the state. */
export interface HallOptions {
  mode?: "preview" | "entry" | "room";
  /** Entry mode: called when she presses Begin. Return false to stay on the form. */
  onBegin?: (question: string) => boolean | Promise<boolean>;
  /** "Add £N and carry on" — hand straight to the top-up path the app already has. */
  onAddTime?: (amountGbp: number) => void;
  /** "End the reading here instead" on the hold screen. */
  onEndNow?: () => void;
  /** A star was pressed on the receipt. */
  onRate?: (stars: number) => void;
  /** "Read with her again" / "Back to the readers" on the receipt. */
  onAgain?: () => void;
  onBackToReaders?: () => void;
}

/** What the receipt shows. Every field comes from the real session. */
export interface HallReceipt {
  /** Preformatted duration, e.g. "0:35" — rendered verbatim under DURATION. */
  minutes: number | string | null;
  total: string | null;      // already formatted, e.g. "£124.80"
  perMinute: string | null;  // already formatted, e.g. "£5.20"
}

export function startHall(opts: HallOptions = {}) {
  const MODE = opts.mode ?? "preview";
  const cleanups: Array<() => void> = [];

/* ═══════════ the sky ═══════════ */
/* NULL-TOLERANT: the sky canvas belongs to whichever component hosts the hall.
   If it is absent the shader sky simply never draws (ok stays false) and every
   other part of startHall still runs. */
const gl_c=document.getElementById('gl') as HTMLCanvasElement;
const gl=(gl_c?gl_c.getContext('webgl',{antialias:false,alpha:false,powerPreference:'high-performance'}):null) as WebGLRenderingContext;
let ok=!!gl;
const VS='attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}';
function sh(t:number,s:string){const o=gl.createShader(t)!;gl.shaderSource(o,s);gl.compileShader(o);
  if(!gl.getShaderParameter(o,gl.COMPILE_STATUS)){console.error(gl.getShaderInfoLog(o));ok=false;}return o;}
let prog:WebGLProgram,uRes:any,uTime:any,uBreath:any,uPtr:any,uWake:any,uC:any,uAccent:any,uExp:any;
if(ok){
  prog=gl.createProgram()!;
  gl.attachShader(prog,sh(gl.VERTEX_SHADER,VS));
  gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,FRAG));
  gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog,gl.LINK_STATUS)){console.error(gl.getProgramInfoLog(prog));ok=false;}
}
if(ok){
  gl.useProgram(prog!);
  const buf=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const a=gl.getAttribLocation(prog!,'a');
  gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
  uRes=gl.getUniformLocation(prog!,'uRes');
  uTime=gl.getUniformLocation(prog!,'uTime');
  uBreath=gl.getUniformLocation(prog!,'uBreath');
  uPtr=gl.getUniformLocation(prog!,'uPtr');
  uWake=gl.getUniformLocation(prog!,'uWake');
  uC=[0,1,2,3,4,5].map(i=>gl.getUniformLocation(prog!,'uC'+i));
  uAccent=gl.getUniformLocation(prog!,'uAccent');
  uExp=gl.getUniformLocation(prog!,'uExp');
}

/* ═══════════ the wheels ═══════════ */
const NS='http://www.w3.org/2000/svg';
const G=['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];
function mk(t:string,at:Record<string,any>){const e=document.createElementNS(NS,t);for(const k in at)e.setAttribute(k,at[k]);return e;}
function wheel(svg:Element,rO:number,rI:number,glyphs:boolean,cls?:string){
  svg.appendChild(mk('circle',{cx:50,cy:50,r:rO,class:'rim'}));
  svg.appendChild(mk('circle',{cx:50,cy:50,r:rI,class:'rim'}));
  svg.appendChild(mk('circle',{cx:50,cy:50,r:(rI-3),class:'rim'}));
  for(let i=0;i<12;i++){
    const A=(i/12)*Math.PI*2-Math.PI/2;
    svg.appendChild(mk('line',{x1:(50+Math.cos(A)*rI).toFixed(2),y1:(50+Math.sin(A)*rI).toFixed(2),
      x2:(50+Math.cos(A)*rO).toFixed(2),y2:(50+Math.sin(A)*rO).toFixed(2),class:'tick'}));
    if(glyphs){
      const B=((i+.5)/12)*Math.PI*2-Math.PI/2, rg=(rO+rI)/2;
      const tx=mk('text',{x:(50+Math.cos(B)*rg).toFixed(2),y:(50+Math.sin(B)*rg).toFixed(2)});
      tx.textContent=G[i]+'\uFE0E';svg.appendChild(tx);
    }
  }
  for(let i=0;i<72;i++){
    const A=(i/72)*Math.PI*2;
    svg.appendChild(mk('line',{x1:(50+Math.cos(A)*(rI-3)).toFixed(2),y1:(50+Math.sin(A)*(rI-3)).toFixed(2),
      x2:(50+Math.cos(A)*(rI-(i%6===0?5.4:4.2))).toFixed(2),
      y2:(50+Math.sin(A)*(rI-(i%6===0?5.4:4.2))).toFixed(2),class:'tick'}));
  }
}
/* NULL-TOLERANT: each wheel is drawn only if its host svg is on the page. A
   missing wheel costs that wheel, nothing else. */
const w1El=document.getElementById('w1');if(w1El)wheel(w1El,48,41,true);
const w2El=document.getElementById('w2');if(w2El)wheel(w2El,46,38,true);


/* ═══════════ palettes ═══════════ */
const PALETTES=[
 {name:'amethyst',  exp:0.90, accent:[1.00,0.82,0.48], css:'#E8C88B',
  ramp:[[0.026,0.014,0.048],[0.078,0.038,0.140],[0.230,0.100,0.330],
        [0.520,0.190,0.400],[0.780,0.450,0.240],[0.980,0.820,0.540]]},

 {name:'sapphire',  exp:0.88, accent:[0.78,0.90,1.00], css:'#BFD8F0',
  ramp:[[0.012,0.020,0.048],[0.028,0.062,0.135],[0.050,0.150,0.290],
        [0.090,0.310,0.470],[0.240,0.560,0.660],[0.720,0.880,0.950]]},

 {name:'copper',    exp:0.90, accent:[1.00,0.78,0.56], css:'#F0BE93',
  ramp:[[0.034,0.016,0.020],[0.098,0.038,0.044],[0.250,0.088,0.090],
        [0.500,0.190,0.150],[0.760,0.410,0.250],[0.970,0.780,0.600]]},

 {name:'jade',      exp:0.88, accent:[0.86,0.94,0.72], css:'#CFE2AE',
  ramp:[[0.012,0.028,0.026],[0.024,0.075,0.066],[0.048,0.175,0.145],
        [0.110,0.330,0.240],[0.340,0.560,0.320],[0.820,0.920,0.700]]},

 {name:'wine',      exp:0.88, accent:[0.94,0.80,0.86], css:'#E8CBD6',
  ramp:[[0.028,0.012,0.026],[0.078,0.026,0.056],[0.190,0.052,0.108],
        [0.390,0.115,0.195],[0.620,0.300,0.370],[0.930,0.760,0.800]]}
];
/* the journey: cool, green, violet, deep rose, candle, and back round */
const ORDER=[1,3,0,4,2];
const SEGMENT=195000;           /* 3 min 15 per colour, 16 minutes for the full turn */
let cyc=0, AUTO=true, PREVIEW=false, PI=0, FLARE=0;
const CUR={ramp:PALETTES[ORDER[0]].ramp.map(c=>c.slice()),
           accent:PALETTES[ORDER[0]].accent.slice(),
           exp:PALETTES[ORDER[0]].exp};
function smoothstep(x:number){return x*x*(3-2*x);}
function lerpPal(dt:number){
  let A,B,t;
  if(AUTO){
    cyc+=dt/(PREVIEW?SEGMENT/26:SEGMENT);
    const n=ORDER.length;
    if(!isFinite(cyc)||cyc<0)cyc=0;
    const i=((Math.floor(cyc)%n)+n)%n;
    A=PALETTES[ORDER[i]]||PALETTES[0];B=PALETTES[ORDER[(i+1)%n]]||PALETTES[0];
    t=smoothstep(cyc-Math.floor(cyc));
    PI=ORDER[i];
    const label=t<.5?A.name:B.name;
    if(label!==lastLabel){lastLabel=label;paintName(label);}
  }else{ A=B=PALETTES[PI]||PALETTES[0]; t=0; }
  const k=Math.min(1,dt*0.0016);
  for(let i=0;i<6;i++)for(let j=0;j<3;j++){
    const want=A.ramp[i][j]+(B.ramp[i][j]-A.ramp[i][j])*t;
    CUR.ramp[i][j]+=(want-CUR.ramp[i][j])*k;
  }
  for(let j=0;j<3;j++){
    const want=A.accent[j]+(B.accent[j]-A.accent[j])*t;
    CUR.accent[j]+=(want-CUR.accent[j])*k;
  }
  const we=A.exp+(B.exp-A.exp)*t;
  CUR.exp+=(we-CUR.exp)*k;
  cssGold();
}
let lastLabel='';
function paintName(n:string){
  const el=document.getElementById('swname');if(!el)return;
  el.style.opacity='0';setTimeout(()=>{el.textContent=n;el.style.opacity='1';},280);
}

function cssGold(){
  const a=CUR.accent;
  document.documentElement.style.setProperty('--gold',
    'rgb('+Math.round(a[0]*255)+','+Math.round(a[1]*255)+','+Math.round(a[2]*255)+')');
}

/* ADDED-BEGIN reduced motion. The design file only quiets the CSS animations; the
   shader clock, the dust and the colour cycle all kept running. */
const RMQ=matchMedia('(prefers-reduced-motion: reduce)');
let RM=RMQ.matches;
const onRM=()=>{RM=RMQ.matches;};
RMQ.addEventListener('change',onRM);
cleanups.push(()=>RMQ.removeEventListener('change',onRM));

/* no-WebGL fallback. If getContext returns null the sky never draws and she gets
   flat black. Paint the same palette as a still CSS gradient so the orb, the
   wheels and the copy still have a sky to sit in. */
if(!ok){
  const c=CUR.ramp.map(v=>'rgb('+Math.round(v[0]*255)+','+Math.round(v[1]*255)+','+Math.round(v[2]*255)+')');
  gl_c.style.background='radial-gradient(120% 80% at 50% 31%,'
    +c[5]+' 0%,'+c[4]+' 16%,'+c[3]+' 34%,'+c[2]+' 54%,'+c[1]+' 76%,'+c[0]+' 100%)';
  document.documentElement.setAttribute('data-gl','off');
  cleanups.push(()=>document.documentElement.removeAttribute('data-gl'));
}
/* ADDED-END */

/* ═══════════ sound ═══════════ */
let ctx:any=null,bedGain:any=null,uiGain:any=null,breathGain:any=null,soundOn=false,bedNodes:any[]=[];
let flowSrc:any=null,flowGain:any=null,flowFilt:any=null;
function boot(){
  if(ctx)return;
  ctx=new (window.AudioContext||(window as any).webkitAudioContext)({latencyHint:'playback'});
  bedGain=ctx.createGain();bedGain.gain.value=0;
  breathGain=ctx.createGain();breathGain.gain.value=1;
  bedGain.connect(breathGain);breathGain.connect(ctx.destination);
  uiGain=ctx.createGain();uiGain.gain.value=.5;uiGain.connect(ctx.destination);
  const conv=ctx.createConvolver();
  const len=ctx.sampleRate*5,b=ctx.createBuffer(2,len,ctx.sampleRate);
  for(let c=0;c<2;c++){const d=b.getChannelData(c);
    for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.0);}
  conv.buffer=b;const wet=ctx.createGain();wet.gain.value=.55;
  conv.connect(wet);wet.connect(ctx.destination);uiGain.connect(conv);
  const n=ctx.sampleRate*3,nb=ctx.createBuffer(1,n,ctx.sampleRate),nd=nb.getChannelData(0);
  for(let i=0;i<n;i++)nd[i]=Math.random()*2-1;
  flowSrc=ctx.createBufferSource();flowSrc.buffer=nb;flowSrc.loop=true;
  flowFilt=ctx.createBiquadFilter();flowFilt.type='bandpass';
  flowFilt.frequency.value=520;flowFilt.Q.value=1.1;
  flowGain=ctx.createGain();flowGain.gain.value=0;
  flowSrc.connect(flowFilt);flowFilt.connect(flowGain);flowGain.connect(ctx.destination);
  flowSrc.start();
  if(ctx.state!=='running')ctx.resume();
}
function startBed(){
  boot();bedNodes.forEach(n=>{try{n.stop()}catch(e){}});bedNodes=[];
  const out=ctx.createGain();out.gain.value=1;out.connect(bedGain);
  [65.41,98,130.81,196,261.63,392].forEach((f,i)=>{
    const o=ctx.createOscillator();o.type='sine';o.frequency.value=f;
    const g=ctx.createGain();g.gain.value=[.22,.14,.09,.05,.024,.012][i];
    const l=ctx.createOscillator();l.frequency.value=.011+i*.0045;
    const lg=ctx.createGain();lg.gain.value=g.gain.value*.7;
    l.connect(lg);lg.connect(g.gain);l.start();
    o.connect(g);g.connect(out);o.start();bedNodes.push(o,l);});
  bedGain.gain.setTargetAtTime(.2,ctx.currentTime,4);
}
function stopBed(){if(!ctx)return;bedGain.gain.setTargetAtTime(0,ctx.currentTime,1.2);
  bedNodes.forEach(n=>{try{n.stop()}catch(e){}});bedNodes=[];
  if(flowGain)flowGain.gain.setTargetAtTime(0,ctx.currentTime,.3);}
const HARM=[130.81,196,261.63,392,523.25,659.25,784];
let lastH=0;
function harmonic(v:number){
  if(!soundOn)return;boot();
  const now=performance.now();if(now-lastH<1300)return;lastH=now;
  const f=HARM[(Math.random()*HARM.length)|0],t=ctx.currentTime;
  const o=ctx.createOscillator();o.type='sine';o.frequency.value=f;
  const o2=ctx.createOscillator();o2.type='sine';o2.frequency.value=f*2.004;
  const g=ctx.createGain(),g2=ctx.createGain();g2.gain.value=.22;
  o.connect(g);o2.connect(g2);g2.connect(g);g.connect(uiGain);
  g.gain.setValueAtTime(0,t);
  g.gain.linearRampToValueAtTime(Math.min(.085,v),t+1.3);
  g.gain.setTargetAtTime(.0001,t+2.6,2.0);
  o.start(t);o2.start(t);o.stop(t+10);o2.stop(t+10);
}

/* ═══════════ dust and touch ═══════════ */
/* NULL-TOLERANT: dust needs its own canvas and the pointer wake needs the touch
   canvas. Either may be absent; each disables only itself. */
const dc=document.getElementById('dust') as HTMLCanvasElement;
const D=(dc?dc.getContext('2d'):null) as CanvasRenderingContext2D;
const tc=document.getElementById('touch') as HTMLCanvasElement;
let W=0,H=0,DPR=1,DUST:any[]=[];
function seed(){
  const n=matchMedia('(max-width:700px)').matches?90:150;
  DUST=new Array(n);
  for(let i=0;i<n;i++)DUST[i]={x:Math.random()*W,y:Math.random()*H,
    r:.5+Math.random()*1.7,a:.10+Math.random()*.26,
    vy:-(.0014+Math.random()*.0028),sw:.3+Math.random()*.9,
    ph:Math.random()*6.283,reach:0};
}
function size(){
  DPR=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;
  if(gl_c){
    gl_c.width=Math.floor(W*Math.min(DPR,1.5));gl_c.height=Math.floor(H*Math.min(DPR,1.5));
    gl_c.style.width=W+'px';gl_c.style.height=H+'px';
    if(ok)gl.viewport(0,0,gl_c.width,gl_c.height);
  }
  if(dc){dc.width=W*DPR;dc.height=H*DPR;dc.style.width=W+'px';dc.style.height=H+'px';}
  if(D)D.setTransform(DPR,0,0,DPR,0,0);
  if(tc){tc.width=1;tc.height=1;tc.style.width=W+'px';tc.style.height=H+'px';}
  seed();
}

let px=-999,py=-999,down=false,ptrS=0,CALM=false;
const WAKE:any[]=[];for(let i=0;i<8;i++)WAKE.push({x:0,y:0,l:0});
let wi=0,lastWake=0;
/* FIX 2: the wake now listens on window, not on #touch. window already
   receives every pointer event in the viewport, so the wake behaviour is
   unchanged; setPointerCapture is dropped because listening on window keeps a
   drag alive by construction, which is the only thing the capture provided. */
const onPtrDown=(e:PointerEvent)=>{down=true;px=e.clientX;py=e.clientY;
  harmonic(.075);};
const onPtrMove=(e:PointerEvent)=>{
  px=e.clientX;py=e.clientY;
  if(down){
    const now=performance.now();
    if(now-lastWake>70){lastWake=now;
      WAKE[wi]={x:px,y:py,l:1};wi=(wi+1)%8;}
  }
};
const onPtrUp=()=>down=false;
const onPtrCancel=()=>down=false;
const onPtrLeave=()=>{down=false;px=py=-999;};
window.addEventListener('pointerdown',onPtrDown);
window.addEventListener('pointermove',onPtrMove);
window.addEventListener('pointerup',onPtrUp);
window.addEventListener('pointercancel',onPtrCancel);
window.addEventListener('pointerleave',onPtrLeave);
cleanups.push(()=>{window.removeEventListener('pointerdown',onPtrDown);window.removeEventListener('pointermove',onPtrMove);
  window.removeEventListener('pointerup',onPtrUp);window.removeEventListener('pointercancel',onPtrCancel);
  window.removeEventListener('pointerleave',onPtrLeave);});



const BREATH=11000,t00=performance.now();
let t0=performance.now(),clock=0;
let raf:number;
function frame(now:number){
  const dt=Math.max(0,Math.min(34,now-t0));t0=now;
/* ADDED-BEGIN supersedes `const S=CALM?.5:1;` — RM drives the whole frame to zero,
   which freezes the shader clock and stops the dust drift in one place. */
  const S=RM?0:(CALM?.5:1);
/* ADDED-END */
  clock+=dt*0.001*S;
  const br=(1-Math.cos((((now-t00)%BREATH)/BREATH)*6.283))/2;

  ptrS += (((down?1:(px>-900?0.34:0)) - ptrS))*Math.min(1,dt*0.006);

  if(ok){
    gl.uniform2f(uRes,gl_c.width,gl_c.height);
    gl.uniform1f(uTime,clock);
    gl.uniform1f(uBreath,br);
    const sc=gl_c.width/W;
    gl.uniform3f(uPtr,(px<-900?-9999:px*sc),(px<-900?-9999:(H-py)*sc),ptrS);
    const arr=new Float32Array(24);
    for(let i=0;i<8;i++){
      const w=WAKE[i];
      w.l=Math.max(0,w.l-dt/(CALM?4200:2600));
      arr[i*3]=w.x*sc;arr[i*3+1]=(H-w.y)*sc;arr[i*3+2]=w.l;
    }
    gl.uniform3fv(uWake,arr);
/* ADDED-BEGIN supersedes `lerpPal(dt);` — a zero delta holds the palette still. */
    lerpPal(RM?0:dt);
/* ADDED-END */
    for(let i=0;i<6;i++)gl.uniform3f(uC[i],CUR.ramp[i][0],CUR.ramp[i][1],CUR.ramp[i][2]);
    gl.uniform3f(uAccent,CUR.accent[0],CUR.accent[1],CUR.accent[2]);
    if(FLARE>0)FLARE=Math.max(0,FLARE-dt/2000);
    gl.uniform1f(uExp,CUR.exp*(1+FLARE*0.42));
    gl.drawArrays(gl.TRIANGLES,0,3);
  }

  if(soundOn&&ctx){
    if(breathGain)breathGain.gain.setTargetAtTime(.74+br*.4,ctx.currentTime,.6);
    if(flowGain){
      const amt=(down?1:0)*ptrS;
      flowGain.gain.setTargetAtTime(Math.min(.045,amt*.045),ctx.currentTime,.2);
      flowFilt.frequency.setTargetAtTime(420+amt*380,ctx.currentTime,.3);
    }
  }

  if(!D){raf=requestAnimationFrame(frame);return;}
  D.clearRect(0,0,W,H);
  for(const p of DUST){
    p.ph+=dt*.00014*p.sw*S;
    p.y+=p.vy*dt*(.7+br*.5)*S;
    p.x+=Math.sin(p.ph)*.0052*dt*S;
    if(px>-900){
      const dx=px-p.x,dy=py-p.y,d=Math.hypot(dx,dy);
      if(d<300&&d>0){
        const pull=(1-d/300)*(down?.00040:.00016)*dt*S;
        p.x+=dx/d*pull*300;p.y+=dy/d*pull*300;
        p.x+=-dy/d*pull*160;p.y+=dx/d*pull*160;
        p.reach=Math.min(1,p.reach+(1-d/300)*.007);
      }
    }
    p.reach*=.9964;
    if(p.y<-10){p.y=H+10;p.x=Math.random()*W;}
    if(p.x<-10)p.x=W+10;if(p.x>W+10)p.x=-10;
    const al=(p.a+p.reach*.45)*(.7+br*.42);
    const rr=p.r*(1+p.reach*.6);
    const gr=D.createRadialGradient(p.x,p.y,0,p.x,p.y,rr*4.6);
    gr.addColorStop(0,'rgba(255,229,172,'+al+')');
    gr.addColorStop(1,'rgba(255,229,172,0)');
    D.fillStyle=gr;D.beginPath();D.arc(p.x,p.y,rr*4.6,0,6.283);D.fill();
    D.fillStyle='rgba(255,253,244,'+(al*.75)+')';
    D.beginPath();D.arc(p.x,p.y,rr*.5,0,6.283);D.fill();
  }
  raf=requestAnimationFrame(frame);
}
size();addEventListener('resize',size);
raf=requestAnimationFrame(frame);
cleanups.push(()=>{cancelAnimationFrame(raf);removeEventListener('resize',size);});


/* ══════════════ the journey ══════════════ */
const HH=document.documentElement;
HH.setAttribute('data-state',MODE==="room"?'room':'form');
/* The room stage only exists in preview mode, so these may be absent. */
const thread=document.getElementById('thread'),stEl=document.getElementById('st'),
      nudgeEl=document.getElementById('nudge');
let timers:number[]=[],cardT:any=null,ci=0,nudgeT:any=null;
const cards=[...document.querySelectorAll('.card')];
function at(ms:number,fn:()=>void){timers.push(window.setTimeout(fn,ms));}
function showCard(i:number){cards.forEach(c=>c.classList.remove('on'));
  if(i<0)return;at(560,()=>cards.forEach((c,n)=>c.classList.toggle('on',n===i)));}

function bubble(cls:string,txt:string){
  if(!thread)return;
  const d=document.createElement('div');d.className='bub '+cls;d.textContent=txt;
  thread.appendChild(d);thread.scrollTop=thread.scrollHeight;
  while(thread.children.length>9)thread.removeChild(thread.firstChild!);
}
function typingOn(){
  if(!thread||!stEl||!nudgeEl)return;
  if(thread.querySelector('.typing'))return;
  const t=document.createElement('div');t.className='typing';t.innerHTML='<i></i><i></i><i></i>';
  thread.appendChild(t);thread.scrollTop=thread.scrollHeight;stEl.textContent='typing…';
  clearTimeout(nudgeT);nudgeT=setTimeout(()=>nudgeEl.classList.add('on'),4000);
}
function typingOff(){if(!thread||!stEl||!nudgeEl)return;
  const t=thread.querySelector('.typing');if(t)t.remove();
  stEl.textContent='reading for you';clearTimeout(nudgeT);nudgeEl.classList.remove('on');}

function toLobby(){
  HH.setAttribute('data-state','sending');
  at(700,()=>{HH.setAttribute('data-state','lobby');ci=0;showCard(0);
    cardT=setInterval(()=>{ci=(ci+1)%cards.length;showCard(ci);},5400);});
  /* Preview drifts to the arrival on a timer. The real flow waits for the
     CHAT_ACCEPTED websocket event, which the caller feeds in via arrive(). */
  if(MODE==="preview")at(12500,toArrival);
}
function toArrival(){
  clearInterval(cardT);
  HH.setAttribute('data-state','accepting');
  harmonic(.10);
  FLARE=1;                                   /* the sky brightens with her */
  /* Entry mode stops here: the global Incoming Reading prompt takes over and
     the existing /chats room is the destination, exactly as it is today. */
  if(MODE==="preview")at(3600,toRoom);
}
function toRoom(){
  if(!thread)return;
  HH.setAttribute('data-state','room');
  thread.innerHTML='';
  bubble('me',"He stopped answering six weeks ago. Daniel, born 14 August 1992. I'm 12/12/1999.");
  at(900,()=>bubble('her','daniel, six weeks of that silence after something that felt so right'));
  at(2300,()=>bubble('her','that shift is real and you felt it before you could even name it'));
  at(3600,typingOn);
}
function reset(){timers.forEach(clearTimeout);timers=[];clearInterval(cardT);
  showCard(-1);if(thread)thread.innerHTML='';FLARE=0;HH.setAttribute('data-state','form');}

/* the orb straddles the top edge of the panel, whatever size the window is.
   There are three panels now — the request, the top-up hold and the receipt —
   and only ever one on screen. This is the ONLY writer of --panelTop: it picks
   the panel that belongs to the current state and measures that one, so the
   panels can never fight each other over the variable. */
function activePanel():HTMLElement|null{
  const st=HH.getAttribute('data-state');
  if(st==='pausing')return document.getElementById('pausepanel');
  if(st==='ended')return document.getElementById('endpanel');
  return document.getElementById('panel');
}
/* FIX 1 — the orb straddles the panel's top edge, but the panel's own top
   padding varies per breakpoint, so at some sizes the orb's aura reached past
   it and landed on the heading. Rather than tune a number per breakpoint, the
   pin is now computed from measured geometry: take the panel's top edge, and if
   that would leave less than ORB_CLEARANCE between the BOTTOM OF THE AURA and
   the top of the panel's first heading, lift the orb until it does. Every value
   is read from the live layout, so it holds at any viewport size. */
const ORB_CLEARANCE=12;
function pinOrb(){
  const p=activePanel();if(!p)return;
  const r=p.getBoundingClientRect();
  if(r.height<=0)return;
  let top=r.top;
  /* the aura is the widest ring on the orb, so it decides the real bottom edge */
  const aura=document.querySelector('.orb .aura') as HTMLElement|null;
  const fix=document.querySelector('.orbfix') as HTMLElement|null;
  const head=p.querySelector('.eyebrow')||p.querySelector('.ptitle')||p.firstElementChild;
  if(aura&&fix&&head){
    /* .orbfix carries a 1500ms transition on transform, so getBoundingClientRect
       reports a MID-FLIGHT size while the orb is still scaling and the lift comes
       out short. offsetHeight is the untransformed box and --os is a custom
       property, which changes instantly, so together they give the settled size
       no matter when this runs. */
    /* REVERTED to offsetHeight * --os. The measured rect is read while .orbfix
       is still running its own 1500ms transform (hall.css:116), so it is wrong
       by transition phase; this form is wrong by a scale-composition factor but
       is stable, and it produced no overlap anywhere. The floor is now "must not
       overlap", not a fixed 12px, so the stable-but-approximate term is correct. */
    const os=parseFloat(getComputedStyle(fix).getPropertyValue('--os'))||1;
    const half=(aura.offsetHeight*os)/2;               /* orb is centred on `top` */
    const headTop=head.getBoundingClientRect().top;
    const maxTop=headTop-half-ORB_CLEARANCE;
    if(top>maxTop)top=maxTop;
  }
  document.documentElement.style.setProperty('--panelTop',Math.round(top)+'px');
}
/* after a state change the new panel has to be laid out before it can be
   measured, so re-pin on the next frame and again once the fade has settled */
/* FIX 1 — the 700ms pin lands while .panel is still running its 900ms
   transform (hall.css:139), so it measures a heading that is still moving. The
   panel's own transitionend, filtered to `transform`, re-pins the moment it has
   actually settled; the 1000ms pin is the safety net for when the transition is
   cancelled or never fires at all, as under prefers-reduced-motion. */
function repinOnSettle(){
  const p=activePanel();if(!p)return;
  const once=(e:Event)=>{
    if((e as TransitionEvent).propertyName!=='transform')return;
    p.removeEventListener('transitionend',once);pinOrb();
  };
  p.addEventListener('transitionend',once);
  cleanups.push(()=>p.removeEventListener('transitionend',once));
}
function repin(){requestAnimationFrame(pinOrb);at(120,pinOrb);at(700,pinOrb);
  repinOnSettle();at(1000,pinOrb);}
pinOrb();addEventListener('resize',pinOrb);setTimeout(pinOrb,120);setTimeout(pinOrb,600);
repinOnSettle();setTimeout(pinOrb,1000);
const stages=[...document.querySelectorAll('.stage')] as HTMLElement[];
stages.forEach(s=>s.addEventListener('scroll',pinOrb,{passive:true}));
cleanups.push(()=>{removeEventListener('resize',pinOrb);
  stages.forEach(s=>s.removeEventListener('scroll',pinOrb));});

/* The request panel does not exist in room mode. */
const beginBtn=document.getElementById('begin');
let sending=false;
const onBegin=async ()=>{
  if(sending)return;
  boot();
  if(MODE==="preview"){toLobby();return;}
  /* Entry mode: the real request must succeed before she is moved off the form. */
  if(!opts.onBegin){toLobby();return;}
  sending=true;
  beginBtn?.setAttribute('aria-busy','true');
  const q=(document.getElementById('q') as HTMLTextAreaElement|null);
  let ok=false;
  try{ ok=await opts.onBegin(q?q.value:""); }finally{
    sending=false; beginBtn?.removeAttribute('aria-busy');
  }
  if(ok)toLobby();
};
if(beginBtn){beginBtn.addEventListener('click',onBegin);
cleanups.push(()=>beginBtn.removeEventListener('click',onBegin));}
/* ═══════════ 5 · the top-up hold, and 6 · the receipt ═══════════
   Both live in the state machine beside the request, the wait and the arrival.
   They are wired in BOTH modes: /design-preview drives them from the mock bar,
   the real room drives them from its own billing states. Nothing here decides
   anything about money — pressing "Add" hands straight back out to the caller,
   which uses the top-up path the app already has. */

let cdNum=document.getElementById('cdnum'),cdFill=document.getElementById('cdfill');
let amtsEl=document.getElementById('amts'),addBtn=document.getElementById('addtime');
let cdT:any=null,cdLeft=0,cdSpan=300,amount=25,perMin:number|null=null;

const mmss=(s:number)=>Math.floor(s/60)+':'+String(Math.max(0,Math.floor(s%60))).padStart(2,'0');

function paintAmounts(){
  [...document.querySelectorAll('.amt')].forEach(b=>{
    const a=Number((b as HTMLElement).dataset.amt);
    b.setAttribute('aria-pressed',String(a===amount));
    const i=b.querySelector('i');
    /* the minutes each amount buys, at her reader's real rate — never a guess.
       Rounded DOWN so the number can never over-promise. */
    if(i)i.textContent=perMin&&perMin>0?Math.floor(a/perMin)+' min':'';
  });
  if(addBtn)addBtn.textContent='Add £'+amount+' and carry on';
}
paintAmounts();

const onAmts=(e:Event)=>{
  const b=(e.target as HTMLElement).closest('.amt');if(!b)return;
  amount=Number((b as HTMLElement).dataset.amt)||amount;paintAmounts();harmonic(.06);};

const onAdd=()=>{opts.onAddTime?.(amount);if(MODE==="preview")toRoom();};

let endInstead=document.getElementById('endinstead');
const onEndNow=()=>{opts.onEndNow?.();if(MODE==="preview")toEnded();};

function stopCd(){if(cdT){clearInterval(cdT);cdT=null;}}
cleanups.push(stopCd);

function tickCd(){
  if(cdNum)cdNum.textContent=mmss(cdLeft);
  if(cdFill)cdFill.style.width=(cdSpan>0?Math.max(0,Math.min(100,(cdLeft/cdSpan)*100)):0)+'%';
}

/** The hold screen. seconds = the server's real grace period. */
function toPausing(seconds?:number){
  stopCd();
  cdSpan=seconds&&seconds>0?Math.round(seconds):300;   /* 5:00 only when the server gives nothing */
  cdLeft=cdSpan;
  tickCd();
  HH.setAttribute('data-state','pausing');
  repin();
  cdT=setInterval(()=>{
    cdLeft=Math.max(0,cdLeft-1);tickCd();
    if(cdLeft<=0){stopCd();toEnded();}
  },1000);
}

/** The receipt. Everything on it is the session's own numbers. */
function toEnded(r?:HallReceipt){
  stopCd();
  if(r){
    const set=(id:string,v:string|number|null)=>{const e=document.getElementById(id);
      if(e)e.textContent=v==null?'—':String(v);};
    set('rmins',r.minutes);set('rtotal',r.total);set('rrate',r.perMinute);
  }
  HH.setAttribute('data-state','ended');
  repin();
}

let starsEl=document.getElementById('stars');
let rated=0;
const paintStars=()=>[...document.querySelectorAll('.star')].forEach(s=>
  s.setAttribute('aria-pressed',String(Number((s as HTMLElement).dataset.star)<=rated)));
const onStars=(e:Event)=>{
  const s=(e.target as HTMLElement).closest('.star');if(!s)return;
  rated=Number((s as HTMLElement).dataset.star)||0;paintStars();harmonic(.08);
  opts.onRate?.(rated);};
let againBtn=document.getElementById('again'),backBtn=document.getElementById('backtoreaders');
const onAgain=()=>{opts.onAgain?.();if(MODE==="preview")reset();};
const onBack=()=>{opts.onBackToReaders?.();};

/* FIX A — the receipt and hold controls used to be wired ONCE, right here, by
   getElementById inside if-guards. On /chats the hall now starts while the
   conversation LIST is showing, so none of those elements existed yet: every
   guard skipped silently and the closing card rendered with no listeners at
   all (CDP measured 0 click listeners on /chats against 1 on /design-preview).
   The wiring lives in wireRoomControls(), which unbinds, re-queries and
   rebinds — idempotent — and is exposed on the API so HallRoom can call it the
   moment its DOM is actually mounted. */
let roomWired:Array<[Element,EventListener]>=[];
function unwireRoomControls(){for(const [el,fn] of roomWired)el.removeEventListener('click',fn);roomWired=[];}
cleanups.push(unwireRoomControls);
function wireRoomControls(){
  unwireRoomControls();
  cdNum=document.getElementById('cdnum');cdFill=document.getElementById('cdfill');
  amtsEl=document.getElementById('amts');addBtn=document.getElementById('addtime');
  endInstead=document.getElementById('endinstead');
  starsEl=document.getElementById('stars');
  againBtn=document.getElementById('again');backBtn=document.getElementById('backtoreaders');
  const bind=(el:Element|null,fn:EventListener)=>{if(el){el.addEventListener('click',fn);roomWired.push([el,fn]);}};
  bind(amtsEl,onAmts);bind(addBtn,onAdd);bind(endInstead,onEndNow);
  bind(starsEl,onStars);bind(againBtn,onAgain);bind(backBtn,onBack);
  paintAmounts();paintStars();tickCd();
}
wireRoomControls();

const pillsEl=document.getElementById('pills');
const onPills=(e:Event)=>{
  const p=(e.target as HTMLElement).closest('.pill');if(!p)return;
  [...document.querySelectorAll('.pill')].forEach(x=>x.setAttribute('aria-pressed',String(x===p)));
  harmonic(.06);};
if(pillsEl){pillsEl.addEventListener('click',onPills);
cleanups.push(()=>pillsEl.removeEventListener('click',onPills));}

/* ── the developer harness. /design-preview only — it must never reach a
   customer, and in entry mode none of these elements are rendered at all. ── */
if(MODE==="preview"){
const REPLIES=[
 "there's a reason he went quiet and it isn't the one you've been telling yourself",
 "the eight of cups keeps turning up for him. a man walking away from something he still wants",
 "august, around the 14th. watch what happens near his birthday",
 "you already know. you're waiting for me to say it so it's allowed to be true"];
let ri=0;
/* NULL-TOLERANT: the harness composer only exists on /design-preview. */
const sendBtn=document.getElementById('send');
const onSend=()=>{
  typingOff();bubble('her',REPLIES[ri%REPLIES.length]);ri++;harmonic(.08);
  at(2800,typingOn);};
if(sendBtn){
  sendBtn.addEventListener('click',onSend);
  cleanups.push(()=>sendBtn.removeEventListener('click',onSend));
}
let mins=38;
const minsT=setInterval(()=>{mins=Math.max(0,mins-1);const m=document.getElementById('mins');
  if(m)m.textContent=mins+' min';},24000);
cleanups.push(()=>clearInterval(minsT));

const sBtn=document.getElementById('sound')!;
const onSound=()=>{soundOn=!soundOn;sBtn.textContent='sound: '+(soundOn?'on':'off');
  sBtn.setAttribute('aria-pressed',String(soundOn));if(soundOn){boot();startBed();}else stopBed();};
sBtn.addEventListener('click',onSound);
cleanups.push(()=>sBtn.removeEventListener('click',onSound));
const swWrap=document.getElementById('swatches')!;
function hex(c:number[]){return 'rgb('+c.map(v=>Math.round(Math.min(1,v)*255)).join(',')+')';}
PALETTES.forEach((p,i)=>{
  const b=document.createElement('button');b.className='sw';
  b.style.background='radial-gradient(66% 66% at 34% 30%,'+hex(p.ramp[5])+' 0%,'
    +hex(p.ramp[3])+' 52%,'+hex(p.ramp[1])+' 100%)';
  b.setAttribute('aria-pressed',String(i===1));b.title=p.name;
  b.addEventListener('click',()=>{
    const at=ORDER.indexOf(i);
    if(at>=0){cyc=Math.floor(cyc)+ (Math.floor(cyc)%ORDER.length===at?0:0);
      cyc=at+0.001+Math.floor(cyc/ORDER.length)*ORDER.length;}
    PI=i;paintName(p.name);
    [...document.querySelectorAll('.sw')].forEach((x,k)=>x.setAttribute('aria-pressed',String(k===i)));
    harmonic(.07);
  });
  swWrap.appendChild(b);
});
cleanups.push(()=>{swWrap.innerHTML='';});

const cBtn=document.getElementById('calm')!;
const onCalm=()=>{CALM=!CALM;cBtn.setAttribute('aria-pressed',String(CALM));};
cBtn.addEventListener('click',onCalm);
cleanups.push(()=>cBtn.removeEventListener('click',onCalm));

/* NULL-TOLERANT: harness-only reply button and its target composer. */
const replyBtn=document.getElementById('send2');
const onReplyClick=()=>document.getElementById('send')?.click();
if(replyBtn){
  replyBtn.addEventListener('click',onReplyClick);
  cleanups.push(()=>replyBtn.removeEventListener('click',onReplyClick));
}
/* Two jumps so the new screens can be looked at without waiting for a real
   session to run out of money or end. Harness only — they do not exist in the
   customer flow. The receipt numbers here are stand-ins for the look; the real
   room passes the session's own figures into toEnded(). */
const mkPause=document.getElementById('mkpause')!;
const onMkPause=()=>{boot();toPausing();};
mkPause.addEventListener('click',onMkPause);
cleanups.push(()=>mkPause.removeEventListener('click',onMkPause));
const mkEnd=document.getElementById('mkend')!;
const onMkEnd=()=>{boot();toEnded({minutes:24,total:'£124.80',perMinute:'£5.20'});};
mkEnd.addEventListener('click',onMkEnd);
cleanups.push(()=>mkEnd.removeEventListener('click',onMkEnd));
/* the preview room's own End control drives the same jump as the mock bar */
const pvEnd=document.getElementById('pvend');
if(pvEnd){pvEnd.addEventListener('click',onMkEnd);
  cleanups.push(()=>pvEnd.removeEventListener('click',onMkEnd));}

const replayBtn=document.getElementById('replay')!;
const onReplay=()=>{reset();at(400,toLobby);};
replayBtn.addEventListener('click',onReplay);
cleanups.push(()=>replayBtn.removeEventListener('click',onReplay));
const cyBtn=document.getElementById('cycle')!;
const onCycle=()=>{AUTO=!AUTO;cyBtn.setAttribute('aria-pressed',String(AUTO));
  cyBtn.textContent='colour: '+(AUTO?'drifting':'held');};
cyBtn.addEventListener('click',onCycle);
cleanups.push(()=>cyBtn.removeEventListener('click',onCycle));
const pvBtn=document.getElementById('preview')!;
const onPreview=()=>{PREVIEW=!PREVIEW;pvBtn.setAttribute('aria-pressed',String(PREVIEW));
  pvBtn.textContent=PREVIEW?'back to real speed':'watch the whole turn';
  if(PREVIEW&&!AUTO){AUTO=true;cyBtn.setAttribute('aria-pressed','true');cyBtn.textContent='colour: drifting';}};
pvBtn.addEventListener('click',onPreview);
cleanups.push(()=>pvBtn.removeEventListener('click',onPreview));
}
/* ── end of the developer harness ── */

  /* Teardown — the source page never unmounts, so it has no equivalent. */
  cleanups.push(()=>{ timers.forEach(clearTimeout); clearInterval(cardT); clearTimeout(nudgeT);
    HH.removeAttribute('data-state'); HH.style.removeProperty('--panelTop'); HH.style.removeProperty('--gold');
    try{ stopBed(); if(ctx) ctx.close(); }catch(e){} });
  return {
    stop: () => { cleanups.forEach(f=>{try{f();}catch(e){}}); },
    /** Re-binds the receipt/hold controls against the CURRENT DOM. HallRoom
        calls this on mount, because on /chats the hall starts before the room
        exists and the one-shot wiring above finds nothing. */
    wireRoom: wireRoomControls,
    /* Entry mode: the caller fires this when CHAT_ACCEPTED arrives. */
    arrive: () => { if(HH.getAttribute('data-state')==='lobby'||HH.getAttribute('data-state')==='sending') toArrival(); },
    state: () => HH.getAttribute('data-state'),
    /** Her reader's real per-minute rate, so the amount buttons can say what
        each one buys. Arrives after the panel is already on screen. */
    setRate: (gbpPerMinute: number | null) => { perMin = gbpPerMinute; paintAmounts(); },
    /** The billing states the room drives. */
    pausing: (graceSeconds?: number) => toPausing(graceSeconds),
    ended: (r?: HallReceipt) => toEnded(r),
    room: () => { HH.setAttribute('data-state','room'); repin(); },
    /** Whatever the current grace countdown has left, in seconds. */
    graceLeft: () => cdLeft,
  };
}
