// main.js
// Bouncing circles + collisions + iPhone tilt gravity (robust iOS permission + fallback)

"use strict";

/* ---------------------------- Canvas Setup ---------------------------- */

const canvas = document.getElementById("glcanvas") || document.querySelector("canvas");
if (!canvas) throw new Error("No canvas found. Expected id='glcanvas' or a <canvas>.");

const ctx = canvas.getContext("2d", { alpha: false });

function resizeCanvasToDisplaySize() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}
window.addEventListener("resize", resizeCanvasToDisplaySize);
resizeCanvasToDisplaySize();

/* ---------------------------- Utilities ---------------------------- */

function rand(min, max) { return Math.random() * (max - min) + min; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx*dx + dy*dy; }

function randomColor() {
  const r = Math.floor(rand(80, 255));
  const g = Math.floor(rand(80, 255));
  const b = Math.floor(rand(80, 255));
  return `rgb(${r},${g},${b})`;
}

/* ---------------------------- Physics Params ---------------------------- */

const NUM_START = 12;
const MIN_R = 12;
const MAX_R = 34;

const WALL_BOUNCE = 0.92;
const COLLISION_BOUNCE = 0.98;
const AIR_FRICTION = 0.998;

// Gravity values used every frame
let gravityX = 0;
let gravityY = 0.18; // desktop default: gentle down

// Tilt tuning
const gravityStrength = 0.75; // try 0.5–1.2
const smoothFactor = 0.18;    // try 0.10–0.30 (higher = less smoothing)
let orientationEnabled = false;

// Debug counters
let lastSensorTs = 0;
let lastBeta = null, lastGamma = null;
let lastAccX = null, lastAccY = null;

/* ---------------------------- Circle Model ---------------------------- */

class Circle {
  constructor(x, y, r) {
    this.x = x; this.y = y; this.r = r;
    this.vx = rand(-2.0, 2.0);
    this.vy = rand(-1.5, 1.5);
    this.color = randomColor();
    this.mass = r * r;
  }
}

const circles = [];

/* ---------------------------- Spawning ---------------------------- */

function overlapsAny(x, y, r) {
  for (const c of circles) {
    const rr = r + c.r;
    if (dist2(x, y, c.x, c.y) < rr * rr) return true;
  }
  return false;
}

function spawnCircle(x = null, y = null) {
  resizeCanvasToDisplaySize();
  const w = canvas.width, h = canvas.height;

  const r = rand(MIN_R, MAX_R);
  let sx = x ?? rand(r, w - r);
  let sy = y ?? rand(r, h - r);

  sx = clamp(sx, r, w - r);
  sy = clamp(sy, r, h - r);

  let tries = 0;
  while (tries < 80 && overlapsAny(sx, sy, r)) {
    sx = rand(r, w - r);
    sy = rand(r, h - r);
    tries++;
  }

  circles.push(new Circle(sx, sy, r));
}

function initScene() {
  circles.length = 0;
  for (let i = 0; i < NUM_START; i++) spawnCircle();
}
initScene();

/* ---------------------------- Input ---------------------------- */

canvas.addEventListener("pointerdown", (e) => {
  // Enable tilt on first user interaction (required on iOS)
  if (!orientationEnabled) enableTiltSensors();

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const mx = (e.clientX - rect.left) * dpr;
  const my = (e.clientY - rect.top) * dpr;

  // Pop circle if tapped
  for (let i = circles.length - 1; i >= 0; i--) {
    const c = circles[i];
    if (dist2(mx, my, c.x, c.y) <= c.r * c.r) {
      circles.splice(i, 1);
      return;
    }
  }
  // Otherwise add a circle
  spawnCircle(mx, my);
});

// iOS Safari often behaves better with touchstart for permissions
window.addEventListener("touchstart", () => {
  if (!orientationEnabled) enableTiltSensors();
}, { once: true });

/* ---------------------------- Tilt Sensors (Robust iOS) ---------------------------- */

async function enableTiltSensors() {
  if (orientationEnabled) return;

  try {
    // iOS 13+ permission prompts
    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {

      const orientState = await DeviceOrientationEvent.requestPermission();

      // Some iOS versions also require this for motion
      if (typeof DeviceMotionEvent !== "undefined" &&
          typeof DeviceMotionEvent.requestPermission === "function") {
        await DeviceMotionEvent.requestPermission();
      }

      if (orientState !== "granted") return;
    }

    window.addEventListener("deviceorientation", handleOrientation, true);
    window.addEventListener("devicemotion", handleMotion, true);

    orientationEnabled = true;
    lastSensorTs = performance.now();
  } catch (err) {
    console.log("Tilt permission failed:", err);
  }
}

function handleOrientation(event) {
  const beta = event.beta;   // front/back (-180..180)
  const gamma = event.gamma; // left/right (-90..90)
  if (beta == null || gamma == null) return;

  lastBeta = beta;
  lastGamma = gamma;

  // Map tilt degrees -> [-1,1] -> gravity strength
  const targetGX = clamp(gamma / 45, -1, 1) * gravityStrength;
  const targetGY = clamp(beta / 45, -1, 1) * gravityStrength;

  gravityX = gravityX + (targetGX - gravityX) * smoothFactor;
  gravityY = gravityY + (targetGY - gravityY) * smoothFactor;

  lastSensorTs = performance.now();
}

// Fallback: use accelerationIncludingGravity if orientation isn't coming in
function handleMotion(event) {
  const ag = event.accelerationIncludingGravity;
  if (!ag) return;

  // iOS: ag.x is left/right, ag.y is up/down (screen coords vary by orientation)
  lastAccX = ag.x;
  lastAccY = ag.y;

  const now = performance.now();
  // Only apply motion fallback if orientation hasn't updated recently
  if (now - lastSensorTs > 250) {
    const targetGX = clamp(ag.x / 9.8, -1, 1) * gravityStrength;
    const targetGY = clamp(-ag.y / 9.8, -1, 1) * gravityStrength;

    gravityX = gravityX + (targetGX - gravityX) * smoothFactor;
    gravityY = gravityY + (targetGY - gravityY) * smoothFactor;
  }
}

/* ---------------------------- Collisions ---------------------------- */

function resolveCircleCollision(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const minD = a.r + b.r;

  if (d === 0 || d >= minD) return;

  const nx = dx / d;
  const ny = dy / d;

  // Separate (positional correction)
  const penetration = minD - d;
  const totalMass = a.mass + b.mass;
  const aShare = (b.mass / totalMass);
  const bShare = (a.mass / totalMass);

  a.x -= nx * penetration * aShare;
  a.y -= ny * penetration * aShare;
  b.x += nx * penetration * bShare;
  b.y += ny * penetration * bShare;

  // Relative velocity along normal
  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const velAlongNormal = rvx * nx + rvy * ny;

  // If moving apart, skip impulse
  if (velAlongNormal > 0) return;

  const e = COLLISION_BOUNCE;
  const invA = 1 / a.mass;
  const invB = 1 / b.mass;

  const j = -(1 + e) * velAlongNormal / (invA + invB);
  const ix = j * nx;
  const iy = j * ny;

  a.vx -= ix * invA;
  a.vy -= iy * invA;
  b.vx += ix * invB;
  b.vy += iy * invB;
}

function resolveWallCollision(c) {
  const w = canvas.width, h = canvas.height;

  if (c.x - c.r < 0) { c.x = c.r; c.vx = Math.abs(c.vx) * WALL_BOUNCE; }
  if (c.x + c.r > w) { c.x = w - c.r; c.vx = -Math.abs(c.vx) * WALL_BOUNCE; }

  if (c.y - c.r < 0) { c.y = c.r; c.vy = Math.abs(c.vy) * WALL_BOUNCE; }
  if (c.y + c.r > h) { c.y = h - c.r; c.vy = -Math.abs(c.vy) * WALL_BOUNCE; }
}

/* ---------------------------- Main Loop ---------------------------- */

let lastT = performance.now();

function step(t) {
  resizeCanvasToDisplaySize();
  const dt = Math.min(0.033, (t - lastT) / 1000);
  lastT = t;

  // Update
  for (const c of circles) {
    c.vx += gravityX;
    c.vy += gravityY;

    // Scale by dt to keep consistent feel
    c.x += c.vx * (dt * 60);
    c.y += c.vy * (dt * 60);

    c.vx *= AIR_FRICTION;
    c.vy *= AIR_FRICTION;

    resolveWallCollision(c);
  }

  // Pairwise collisions
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      resolveCircleCollision(circles[i], circles[j]);
    }
  }

  draw();
  requestAnimationFrame(step);
}

function draw() {
  const w = canvas.width, h = canvas.height;

  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, w, h);

  for (const c of circles) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fillStyle = c.color;
    ctx.fill();
  }

  // UI text
  ctx.fillStyle = "white";
  const fontPx = Math.max(12, Math.floor(14 * (window.devicePixelRatio || 1)));
  ctx.font = `${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;

  ctx.fillText(
    orientationEnabled
      ? "Tilt gravity ON • Tap circle to pop • Tap empty to add"
      : "Tap once to enable tilt gravity • Tap circle to pop • Tap empty to add",
    12, 22
  );

  // Debug readout so you can see if sensors are actually coming in
  const gStr = `g=(${gravityX.toFixed(2)}, ${gravityY.toFixed(2)})`;
  const oStr = (lastBeta == null || lastGamma == null)
    ? "ori=(no)"
    : `ori=(${lastBeta.toFixed(0)}, ${lastGamma.toFixed(0)})`;
  const mStr = (lastAccX == null || lastAccY == null)
    ? "acc=(no)"
    : `acc=(${lastAccX.toFixed(2)}, ${lastAccY.toFixed(2)})`;

  ctx.fillText(`${gStr}  ${oStr}  ${mStr}`, 12, 44);

  // Tiny gravity vector indicator
  const cx = 24, cy = 66;
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.strokeStyle = "white";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + gravityX * 25, cy + gravityY * 25);
  ctx.stroke();
}

requestAnimationFrame(step);

