/* main.js — Bouncing Circles PWA (WebGL)
   - Resizes to screen + handles iPhone orientation changes
   - Uses real delta-time (dt) so speed is consistent
   - SPEED knob to slow things down
   - Circle-circle elastic collisions + wall bounces
*/

"use strict";

// ===============================
// CONFIG (tweak these)
// ===============================
const NUM_CIRCLES = 22;
const MIN_R = 18;
const MAX_R = 55;

const SPEED = 0.50;            // 🔥 Lower = slower (try 0.25–0.70)
const WALL_BOUNCE = 0.98;      // 1.0 perfectly bouncy, <1 loses energy
const COLLISION_RESTITUTION = 0.98;
const GLOBAL_DAMPING = 0.999;  // small velocity damping each step
const MAX_DT = 1 / 30;         // clamp big frame jumps (tab switch, etc.)

// Physics is in "pixel-ish" coordinates that match CSS pixels,
// then converted to clip space for WebGL drawing.
const BG = [0.78, 0.86, 0.82, 1.0]; // background (soft green)

// ===============================
// CANVAS + WEBGL SETUP
// ===============================
const canvas = document.getElementById("glcanvas");
const gl = canvas.getContext("webgl", { antialias: true });

if (!gl) {
  alert("WebGL not supported in this browser.");
  throw new Error("WebGL not supported");
}

// --- Resize support (fixes iPhone rotation) ---
function resizeCanvasToScreen() {
  const dpr = window.devicePixelRatio || 1;
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;
  const w = Math.floor(cssW * dpr);
  const h = Math.floor(cssH * dpr);

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
}

resizeCanvasToScreen();
window.addEventListener("resize", resizeCanvasToScreen);
window.addEventListener("orientationchange", () => {
  // iOS sometimes reports old dimensions immediately
  setTimeout(resizeCanvasToScreen, 200);
});

// ===============================
// SHADERS (simple color pass-through)
// ===============================
const VERT_SRC = `
attribute vec2 a_pos;
attribute vec4 a_col;
varying vec4 v_col;
void main() {
  v_col = a_col;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG_SRC = `
precision mediump float;
varying vec4 v_col;
void main() {
  gl_FragColor = v_col;
}
`;

function compileShader(type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const err = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("Shader compile error: " + err);
  }
  return sh;
}

function makeProgram(vsSrc, fsSrc) {
  const vs = compileShader(gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl.FRAGMENT_SHADER, fsSrc);

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);

  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const err = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error("Program link error: " + err);
  }
  return prog;
}

const program = makeProgram(VERT_SRC, FRAG_SRC);
gl.useProgram(program);

const aPosLoc = gl.getAttribLocation(program, "a_pos");
const aColLoc = gl.getAttribLocation(program, "a_col");

// Interleaved buffer: [x,y,r,g,b,a] per vertex
const vbo = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);

gl.enableVertexAttribArray(aPosLoc);
gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 24, 0);

gl.enableVertexAttribArray(aColLoc);
gl.vertexAttribPointer(aColLoc, 4, gl.FLOAT, false, 24, 8);

// ===============================
// HELPERS
// ===============================
function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function randomColorRGBA() {
  // bright-ish random
  const r = rand(0.1, 0.95);
  const g = rand(0.1, 0.95);
  const b = rand(0.1, 0.95);
  return [r, g, b, 1.0];
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function circlesOverlap(c1, c2) {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const rr = c1.r + c2.r;
  return (dx * dx + dy * dy) < (rr * rr);
}

// Convert pixel coords to clip space (-1..1)
function pxToClipX(xPx) {
  const cssW = window.innerWidth;
  return (xPx / cssW) * 2 - 1;
}
function pxToClipY(yPx) {
  const cssH = window.innerHeight;
  // yPx goes down; clip y goes up
  return 1 - (yPx / cssH) * 2;
}
function pxToClipR(rPx) {
  // radius needs to scale differently for x/y if aspect changes,
  // so we’ll build circle vertices in pixel space then convert each vertex.
  return rPx;
}

// ===============================
// CIRCLE MODEL
// ===============================
class Circle {
  constructor(x, y, vx, vy, r, color) {
    this.x = x;     // in CSS pixels
    this.y = y;
    this.vx = vx;   // px/sec-ish
    this.vy = vy;
    this.r = r;
    this.color = color;

    // Mass proportional to area
    this.m = r * r;
  }
}

const circles = [];

function spawnCircles() {
  circles.length = 0;

  const W = window.innerWidth;
  const H = window.innerHeight;

  let attempts = 0;
  while (circles.length < NUM_CIRCLES && attempts < 5000) {
    attempts++;

    const r = rand(MIN_R, MAX_R);
    const x = rand(r, W - r);
    const y = rand(r, H - r);

    // initial velocity: keep modest so it doesn’t look chaotic
    const vx = rand(-120, 120);
    const vy = rand(-120, 120);

    const c = new Circle(x, y, vx, vy, r, randomColorRGBA());

    let ok = true;
    for (const other of circles) {
      if (circlesOverlap(c, other)) {
        ok = false;
        break;
      }
    }

    if (ok) circles.push(c);
  }
}

spawnCircles();

// Re-spawn if screen size changes drastically (optional but nice)
let lastW = window.innerWidth;
let lastH = window.innerHeight;
window.addEventListener("resize", () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (Math.abs(w - lastW) > 80 || Math.abs(h - lastH) > 80) {
    lastW = w;
    lastH = h;
    spawnCircles();
  }
});

// ===============================
// PHYSICS
// ===============================
function resolveWallCollisions(c) {
  const W = window.innerWidth;
  const H = window.innerHeight;

  // Left/right
  if (c.x - c.r < 0) {
    c.x = c.r;
    c.vx = Math.abs(c.vx) * WALL_BOUNCE;
  } else if (c.x + c.r > W) {
    c.x = W - c.r;
    c.vx = -Math.abs(c.vx) * WALL_BOUNCE;
  }

  // Top/bottom
  if (c.y - c.r < 0) {
    c.y = c.r;
    c.vy = Math.abs(c.vy) * WALL_BOUNCE;
  } else if (c.y + c.r > H) {
    c.y = H - c.r;
    c.vy = -Math.abs(c.vy) * WALL_BOUNCE;
  }
}

function resolveCircleCollisions() {
  // Pairwise impulse-based collision + positional correction
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      const a = circles[i];
      const b = circles[j];

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist2 = dx * dx + dy * dy;
      const rSum = a.r + b.r;

      if (dist2 >= rSum * rSum) continue;

      const dist = Math.sqrt(dist2) || 0.0001;
      const nx = dx / dist;
      const ny = dy / dist;

      // Positional correction to separate overlapping circles
      const penetration = rSum - dist;
      const totalMass = a.m + b.m;
      const aMove = penetration * (b.m / totalMass);
      const bMove = penetration * (a.m / totalMass);

      a.x -= nx * aMove;
      a.y -= ny * aMove;
      b.x += nx * bMove;
      b.y += ny * bMove;

      // Relative velocity along normal
      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const velAlongNormal = rvx * nx + rvy * ny;

      // If they’re moving apart after correction, skip impulse
      if (velAlongNormal > 0) continue;

      // Impulse scalar
      const e = COLLISION_RESTITUTION;
      const jImpulse = -(1 + e) * velAlongNormal / (1 / a.m + 1 / b.m);

      const ix = jImpulse * nx;
      const iy = jImpulse * ny;

      a.vx -= ix / a.m;
      a.vy -= iy / a.m;
      b.vx += ix / b.m;
      b.vy += iy / b.m;
    }
  }
}

function updatePhysics(dt) {
  // move
  for (const c of circles) {
    c.x += c.vx * dt;
    c.y += c.vy * dt;

    // mild damping so it feels calmer
    c.vx *= GLOBAL_DAMPING;
    c.vy *= GLOBAL_DAMPING;

    resolveWallCollisions(c);
  }

  // resolve circle collisions after movement
  resolveCircleCollisions();
}

// ===============================
// RENDERING (build triangles for circles)
// ===============================
function pushCircleTriangles(verts, c) {
  // Choose segments based on radius (bigger = smoother)
  const seg = clamp(Math.floor(c.r * 0.6), 16, 60);

  const color = c.color;
  const cx = c.x;
  const cy = c.y;
  const r = c.r;

  // Triangle fan -> triangles: center, p_i, p_{i+1}
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;

    const x0 = cx + Math.cos(a0) * r;
    const y0 = cy + Math.sin(a0) * r;
    const x1 = cx + Math.cos(a1) * r;
    const y1 = cy + Math.sin(a1) * r;

    // center
    verts.push(pxToClipX(cx), pxToClipY(cy), color[0], color[1], color[2], color[3]);
    // p0
    verts.push(pxToClipX(x0), pxToClipY(y0), color[0], color[1], color[2], color[3]);
    // p1
    verts.push(pxToClipX(x1), pxToClipY(y1), color[0], color[1], color[2], color[3]);
  }
}

function drawScene() {
  resizeCanvasToScreen();

  gl.clearColor(BG[0], BG[1], BG[2], BG[3]);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const verts = [];
  for (const c of circles) {
    pushCircleTriangles(verts, c);
  }

  const data = new Float32Array(verts);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

  gl.drawArrays(gl.TRIANGLES, 0, data.length / 6);
}

// ===============================
// ANIMATION LOOP (stable dt + speed knob)
// ===============================
let lastTime = performance.now();

function animate(now) {
  let dt = (now - lastTime) / 1000;
  lastTime = now;

  dt = Math.min(dt, MAX_DT);
  dt *= SPEED; // 🔥 slow it down here

  updatePhysics(dt);
  drawScene();

  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

