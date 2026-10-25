(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
let paused = RM, mouse = [.5, .5], pal = 0;
const PALS = [['#ffcfc2', '#c3b8ff', '#b7ecd2', '#fff0b5'], ['#ffc2dd', '#bfe0ff', '#d6f5b8', '#ffe3b8'], ['#e2c8ff', '#b8f0ee', '#ffd0c0', '#fdf3b0'], ['#bfe0ff', '#ffd1e6', '#c8f7d6', '#ffe9b0']];
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

/* ---------- WebGL ---------- */
const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const NOISE = `float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.02+vec2(3.1,1.7);a*=.5;}return v;}`;
const HEAD = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\nuniform vec2 R;uniform float T;uniform vec2 M;uniform vec3 A,B,C,D;' + NOISE;
// tall tile: topographic contour lines that swell around the pointer
const F1 = HEAD + `void main(){vec2 uv=gl_FragCoord.xy/R;vec2 q=uv*vec2(R.x/R.y,1.)*2.4;float t=T*.07;
float d=distance(uv,M);float f=fbm(q+vec2(t,-t*.6)+fbm(q*1.3-t)*.9)+.22*exp(-d*5.);
float l=abs(fract(f*13.)-.5);float line=smoothstep(.06,.0,l-.035);
vec3 col=mix(A,B,smoothstep(.2,.8,f));col=mix(col,C,smoothstep(.55,1.,fbm(q*.7+9.)));
vec3 bg=vec3(.075,.07,.09);float fill=smoothstep(.0,1.,f)*.12;
gl_FragColor=vec4(bg+col*fill+col*line*.9,1.);}`;
// page background: slow pastel waves, surf-like bands
const F2 = HEAD + `void main(){vec2 uv=gl_FragCoord.xy/R;float t=T*.05;float w=0.;
for(int i=0;i<4;i++){float k=float(i);w+=sin(uv.x*(3.+k*1.7)+t*(1.+k*.4)+fbm(uv*2.+k)*3.)*(.18/(1.+k*.6));}
float y=uv.y+w;vec3 col=mix(A,B,smoothstep(.2,.7,y));col=mix(col,C,smoothstep(.55,1.,y+.15*sin(t+uv.x*4.)));
col=mix(col,D,smoothstep(.85,1.1,y)*.6);float v=smoothstep(1.2,.2,distance(uv,vec2(.5)));
gl_FragColor=vec4(col*.28*v,1.);}`;
function mkGL(cv, fs) {
  const gl = cv.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) return null;
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
  gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = n => gl.getUniformLocation(pr, n);
  const U = { R: u('R'), T: u('T'), M: u('M'), A: u('A'), B: u('B'), C: u('C'), D: u('D') };
  return { cv, vis: true, draw(t, m, colors, scale) {
    const w = Math.max(2, (cv.clientWidth * scale) | 0), h = Math.max(2, (cv.clientHeight * scale) | 0);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
    gl.uniform2f(U.R, w, h); gl.uniform1f(U.T, t); gl.uniform2f(U.M, m[0], m[1]);
    ['A', 'B', 'C', 'D'].forEach((k, i) => gl.uniform3fv(U[k], colors[i]));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  } };
}
const g1 = mkGL($('#gl1'), F1), g2 = mkGL($('#bg'), F2);
if (!g2) $('#bg').style.display = 'none';
if (g1) new IntersectionObserver(e => g1.vis = e[0].isIntersecting).observe($('#gl1'));
else $('.shade').style.background = 'linear-gradient(160deg,var(--a),var(--b))';
const tile = $('.shade');
addEventListener('pointermove', e => {
  mouse = [e.clientX / innerWidth, 1 - e.clientY / innerHeight];
  $$('.eye').forEach(el => {
    const r = el.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), d = Math.hypot(dx, dy) || 1;
    el.style.transform = `translate(${dx / d * 5}px,${dy / d * 5}px)`;
  });
}, { passive: true });

/* ---------- palette & motion ---------- */
function applyPal() {
  const p = PALS[pal], r = document.documentElement.style;
  ['a', 'b', 'c', 'd'].forEach((k, i) => r.setProperty('--' + k, p[i]));
  $$('#chips span').forEach((s, i) => s.style.setProperty('--p', p[i % 4]));
}
$('#pal').onclick = () => { pal = (pal + 1) % PALS.length; applyPal(); };
$('#mot').onclick = e => { paused = !paused; e.target.textContent = paused ? '>' : '||'; };

/* ---------- main loop ---------- */
let t0 = performance.now(), tt = 0;
function loop(now) {
  if (!paused) tt += (now - t0) / 1000;
  t0 = now;
  const cols = PALS[pal].map(hex);
  if (g2) g2.draw(tt, mouse, cols, .35);
  if (g1 && g1.vis) {
    const r = tile.getBoundingClientRect();
    g1.draw(tt, [(mouse[0] * innerWidth - r.left) / r.width, 1 - (( (1 - mouse[1]) * innerHeight - r.top) / r.height)], cols, .6);
  }
  analyse();
  requestAnimationFrame(loop);
}

/* ---------- focus timer (timestamp based) ---------- */
const TOTAL = 25 * 60e3, arc = $('#arc'), dg = $('#dg'), tb = $('#tb'), C = 2 * Math.PI * 66;
arc.style.strokeDasharray = C;
let endsAt = 0, left = TOTAL, run = false;
function tick() {
  if (run) left = Math.max(0, endsAt - Date.now());
  const s = Math.ceil(left / 1000);
  dg.textContent = String((s / 60) | 0).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  arc.style.strokeDashoffset = C * (1 - left / TOTAL);
  if (run && left === 0) { run = false; tb.textContent = 'Again'; left = TOTAL; }
}
tb.onclick = () => {
  if (run) { run = false; tb.textContent = 'Resume'; }
  else { endsAt = Date.now() + left; run = true; tb.textContent = 'Pause'; }
};
setInterval(tick, 250); tick();

/* ---------- sound studio (Web Audio) ---------- */
let ac, gain, src, an, data, kind = 'brown', playing = false;
function buffer(type) {
  const n = ac.sampleRate * 4, b = ac.createBuffer(2, n, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let l = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'white') d[i] = w * .5;
      else if (type === 'brown') { l = (l + .02 * w) / 1.02; d[i] = l * 3.4; }
      else { b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .969 * b2 + w * .153852; b3 = .8665 * b3 + w * .3104856; b4 = .55 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362) * .11; b6 = w * .115926; }
    }
  }
  return b;
}
function start() {
  ac = ac || new (window.AudioContext || window.webkitAudioContext)();
  ac.resume();
  if (!gain) { gain = ac.createGain(); an = ac.createAnalyser(); an.fftSize = 64; data = new Uint8Array(an.frequencyBinCount); gain.connect(an); an.connect(ac.destination); }
  stop(true);
  src = ac.createBufferSource(); src.buffer = buffer(kind); src.loop = true; src.connect(gain); src.start();
  gain.gain.cancelScheduledValues(ac.currentTime); gain.gain.setValueAtTime(0, ac.currentTime);
  gain.gain.linearRampToValueAtTime($('#vol').value / 100, ac.currentTime + .6);
  playing = true; $('#sp').textContent = 'Stop';
}
function stop(quick) {
  if (!src) return;
  const s = src; src = null;
  if (quick) { s.stop(); return; }
  gain.gain.cancelScheduledValues(ac.currentTime); gain.gain.setValueAtTime(gain.gain.value, ac.currentTime);
  gain.gain.linearRampToValueAtTime(0, ac.currentTime + .5); s.stop(ac.currentTime + .55);
  playing = false; $('#sp').textContent = 'Play';
}
$('#sp').onclick = () => playing ? stop() : start();
$('#vol').oninput = e => { if (gain) gain.gain.setTargetAtTime(e.target.value / 100, ac.currentTime, .05); };
$$('[data-n]').forEach(b => b.onclick = () => { kind = b.dataset.n; $$('[data-n]').forEach(x => x.classList.toggle('on', x === b)); if (playing) start(); });
const bars = $$('#bars i');
function analyse() {
  if (playing && an) { an.getByteFrequencyData(data); bars.forEach((b, i) => b.style.height = Math.max(6, data[i + 1] / 255 * 100) + '%'); }
  else bars.forEach((b, i) => b.style.height = (10 + 8 * Math.sin(tt * 1.4 + i * .7)) + '%');
}

/* ---------- heatmap ---------- */
const hm = $('#hm'); hm.style.gridTemplateColumns = 'repeat(53,1fr)';
const rnd = (x, y) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const end = new Date(); const start0 = new Date(end); start0.setDate(end.getDate() - 53 * 7 + (7 - end.getDay()) % 7);
let tot = 0, cur = 0, best = 0, streak = 0;
for (let i = 0; i < 371; i++) {
  const d = new Date(start0); d.setDate(start0.getDate() + i);
  const future = d > end, wk = d.getDay() % 6 === 0 ? .45 : 1, term = Math.sin(i / 38) * .5 + .6;
  const m = future ? 0 : Math.round(Math.max(0, rnd(i, 7) * 170 * wk * term - 24));
  tot += m; if (m > 0) { streak++; best = Math.max(best, streak); } else streak = 0; if (!future) cur = streak;
  const el = document.createElement('i');
  el.className = 'l' + (m === 0 ? 0 : m < 40 ? 1 : m < 80 ? 2 : m < 120 ? 3 : 4); if (future) el.style.visibility = 'hidden';
  el.title = d.toDateString() + ': ' + m + ' min'; el.style.animationDelay = (i % 53) * 18 + (i / 53 | 0) * 9 + 'ms';
  hm.appendChild(el);
}
$('#hs').textContent = `sample data · ${Math.round(tot / 60)} h this year · current streak ${cur} d · longest ${best} d`;

/* ---------- misc ---------- */
const TOOLS = 'Todos,Habits,Goals,Pomodoro,Timers,Stopwatch,Grades,GPA,What-if,Flashcards,Notes,Journal,Calendar,Kanban,Eisenhower,Time tracker,Exam mode,Noise mixer,Binaural beats,Units,Dates,Text case,Colour,Hash,QR code,Dice,Regex,JSON,Snippets,Whiteboard,World clock,Countdowns,Budget,Bookmarks'.split(',');
$('#chips').innerHTML = TOOLS.map(t => `<span>${t}</span>`).join('') + '<span>+ many more</span>';
const V = '1.2.0', BASE = 'https://github.com/opngo/flow/releases/download/v' + V + '/';
const ua = navigator.userAgent, win = /Windows/i.test(ua), lin = /Linux/i.test(ua) && !/Android/i.test(ua);
$('[data-plat]').textContent = win ? 'Windows' : lin ? 'Linux' : 'macOS';
const FILES = [['macOS Apple silicon', `Flow-${V}-mac-arm64.dmg`, !win && !lin], ['macOS Intel', `Flow-${V}-mac-x64.dmg`], ['Windows installer', `Flow-${V}-win-x64.exe`, win], ['Windows portable', `Flow-${V}-portable.exe`], ['Linux AppImage', `Flow-${V}-linux-x86_64.AppImage`, lin], ['Checksums', 'SHA256SUMS.txt']];
$('#dl').innerHTML = FILES.map(([l, f, p]) => `<a class="btn ${p ? 'pri' : ''}" href="${BASE + f}">${l}</a>`).join('');
$$('[data-copy]').forEach(b => b.onclick = async () => {
  try { await navigator.clipboard.writeText(b.previousElementSibling.textContent); b.textContent = 'Copied'; } catch { b.textContent = 'Select'; }
  setTimeout(() => b.textContent = 'Copy', 1500);
});
const io = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return; e.target.classList.add('in'); setTimeout(() => e.target.classList.add('done'), 900);
  $$('.gb u', e.target).forEach(u => u.style.width = u.dataset.w + '%'); io.unobserve(e.target);
}), { threshold: .12 });
$$('.t').forEach((t, i) => { t.style.transitionDelay = (i % 3) * 90 + 'ms'; io.observe(t); });
$$('.t:not(.shade)').forEach(t => t.addEventListener('pointermove', e => {
  if (RM) return; const r = t.getBoundingClientRect();
  t.style.transform = `perspective(900px) rotateY(${((e.clientX - r.left) / r.width - .5) * 3}deg) rotateX(${(.5 - (e.clientY - r.top) / r.height) * 3}deg)`;
}));
$$('.t').forEach(t => t.addEventListener('pointerleave', () => t.style.transform = ''));
const sy = $('#ch');
$$('use[href="#ch"]').forEach(u => { const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.innerHTML = sy.innerHTML; u.replaceWith(g); });
const intro = $('.intro'), pin = $('.pin'), letters = $$('#pt span'), floaters = $$('[data-s]'), topbar = $('#topbar'), side = $('.side');
function par() {
  const y = scrollY, max = Math.max(1, intro.offsetHeight - innerHeight), p = Math.min(1, Math.max(0, y / max));
  topbar.classList.toggle('st', y > 20);
  side.classList.toggle('on', p > .9);
  if (RM) return;
  letters.forEach((s, i) => s.style.transform = `translateY(${-p * (110 + i * 80)}px) rotate(${(i - 1.5) * p * 9}deg) scale(${1 + p * .15})`);
  floaters.forEach(e => e.style.transform = `translateY(${-p * e.dataset.s}px)`);
  pin.style.opacity = String(1 - Math.max(0, p - .6) / .4);
}
addEventListener('scroll', par, { passive: true }); addEventListener('resize', par); par();
applyPal(); requestAnimationFrame(loop);
})();
