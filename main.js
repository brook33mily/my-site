// main.js
// Bouncing Circles + collisions + device orientation gravity (iPhone/PWA friendly)

"use strict";

/* ---------------------------- Canvas Setup ---------------------------- */

const canvas = document.getElementById("glcanvas") || document.querySelector("canvas");
if (!canvas) {
  throw new Error("No canvas found. Expected id='glcanvas' (or any <canvas>).");
}

const ctx = canvas.getContext("2d", { alpha: false });

function resizeCanvasToDisplaySize() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  const newWidth = Math.max(1, Math.floor(rect.width * dpr));
  const newHeight = Math.max(1, Math.floor(rect.height * dpr));

  if (canvas.width !== newWidth || canvas.height !== newHeight) {
    canvas.width = newWidth;
    canvas.height = newHeight;
  }
}
window.addEventListener("resize", resizeCanvasToDisplaySize);
resizeCanvasToDisplaySize();

/* ---------------------------- Utilities ---------------------------- */

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function randomColor() {
  // Nice bright-ish colors
  const r = Math.floor(rand(80, 255));
  const g = Math.floor(rand(80, 255));
  const b = Math.floor(rand(80, 255));
  return `rgb(${r},${g},${b})`;
}

/* ---------------------------- Physics Params ---------------------------- */

const NUM_START = 12;
const MIN_R = 12;
const MAX_R = 34;

const WALL_BOUNCE = 0.92;      // restitution against walls
const COLLISION_BOUNCE = 0.98; // restitution between circles
const AIR_FRICTION = 0.998;    // global damping each frame

// Gravity defaults (desktop)
let gravityX = 0;
let gravityY = 0.18; // gentle down gravity on desktop

// Orientation gravity control
let orientationEnabled = false;
const gravityStrength = 0.55;  // tweak: bigger = stronger tilt gravity
const smoothFactor = 0.15;     // tweak: bigger = less smoothing (more jitter)

/* ---------------------------- Circle Model ---------------------------- */

class Circle {
  constructor(x, y, r) {
    this.x = x;
    this.y = y;
    this.r = r;

    this.vx = rand(-2.0, 2.0);
    this.vy = rand(-1.5, 1.5);

    this.color = randomColor();
    this.mass = r * r; // area-based mass feel
  }
}

const circles = [];

/* ---------------------------- Spawn Helpers ---------------------------- */

function overlapsAny(x, y, r) {
  for (const c of circles) {
    const rr = r + c.r;
    if (dist2(x, y, c.x, c.y) < rr * rr) return true;
  }
  return false;
}

function spawnCircle(x = null, y = null) {
  resizeCanvasToDisplaySize();
  const w = canvas.width;
  const h = canvas.height;

  const r = rand(MIN_R, MAX_R);

  // Choose spawn position
  let sx = x ?? rand(r, w - r);
  let sy = y ?? rand(r, h - r);

  // If user clicked near edge, clamp inside
  sx = clamp(sx, r, w - r);
  sy = clamp(sy, r, h - r);

  // Try a few times to avoid overlap
  let tries = 0;
  while (tries < 60 && overlapsAny(sx, sy, r)) {
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

/* ---------------------------- Input: Click/Tap ---------------------------- */

// Tap/click: pop a circle if you hit one; otherwise add a new circle
canvas.addEventListener("pointerdown", (e) => {
  // iOS permission must be user-initiated; enable on first interaction.
  if (!orientationEnabled) enableOrientation();

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const mx = (e.clientX - rect.left) * dpr;
  const my = (e.clientY - rect.top) * dpr;

  // Find topmost circle under pointer (last drawn is "top")
  for (let i = circles.length - 1; i >= 0; i--) {
    const c = circles[i];
    if (dist2(mx, my, c.x, c.y) <= c.r * c.r) {
      circles.splice(i, 1); // pop
      return;
    }
  }

  // Otherwise add a circle at tap location
  spawnCircle(mx, my);
});

/* ---------------------------- Device Orientation Gravity ---------------------------- */

function enableOrientation() {
  // Already enabled
  if (orientationEnabled) return;

  const addListener = () => {
    window.addEventListener("deviceorientation", handleOrientation, true);
    orientationEnabled = true;
  };

  // iOS 13+ requires permission
  if (typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function") {
    DeviceOrientationEvent.requestPermission()
      .then((state) => {
        if (state === "granted") addListener();
      })
      .catch(() => {
        // If denied or errors, we just keep desktop gravity
      });
  } else {
    // Android / other browsers
    addListener();
  }
}

// Smoothly map beta/gamma to gravityX/gravityY
function handleOrientation(event) {
  const beta = event.beta;   // front/back tilt (-180..180)
  const gamma = event.gamma; // left/right tilt (-90..90)

  if (beta == null || gamma == null) return;

  // Convert degrees to a usable acceleration vector
  // gamma right => +x, beta forward => +y
  const targetGX = clamp(gamma / 45, -1, 1) * gravityStrength;
  const targetGY = clamp(beta / 45, -1, 1) * gravityStrength;

  // Smooth to reduce jitter
  gravityX = gravityX + (targetGX - gravityX) * smoothFactor;
  gravityY = gravityY + (targetGY - gravityY) * smoothFactor;
}

/* ---------------------------- Collisions ---------------------------- */

// Resolve circle-circle collisions using impulse response + positional correction
function resolveCircleCollision(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const minDist = a.r + b.r;

  // No collision
  if (dist === 0 || dist >= minDist) return;

  // Normal
  const nx = dx / dist;
  const ny = dy / dist;

  // Positional correction to separate circles (prevents sinking)
  const penetration = minDist - dist;
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

  // If they're separating after correction, skip impulse
  if (velAlongNormal > 0) return;

  const e = COLLISION_BOUNCE; // restitution

  // Impulse scalar
  const invMassA = 1 / a.mass;
  const invMassB = 1 / b.mass;
  const j = -(1 + e) * velAlongNormal / (invMassA + invMassB);

  // Apply impulse
  const ix = j * nx;
  const iy = j * ny;

  a.vx -= ix * invMassA;
  a.vy -= iy * invMassA;
  b.vx += ix * invMassB;
  b.vy += iy * invMassB;
}

function resolveWallCollision(c) {
  const w = canvas.width;
  const h = canvas.height;

  // Left/right
  if (c.x - c.r < 0) {
    c.x = c.r;
    c.vx = Math.abs(c.vx) * WALL_BOUNCE;
  } else if (c.x + c.r > w) {
    c.x = w - c.r;
    c.vx = -Math.abs(c.vx) * WALL_BOUNCE;
  }

  // Top/bottom
  if (c.y - c.r < 0) {
    c.y = c.r;
    c.vy = Math.abs(c.vy) * WALL_BOUNCE;
  } else if (c.y + c.r > h) {
    c.y = h - c.r;
    c.vy = -Math.abs(c.vy) * WALL_BOUNCE;
  }
}

/* ---------------------------- Main Loop ---------------------------- */

let lastT = performance.now();

function step(t) {
  resizeCanvasToDisplaySize();
  const dt = Math.min(0.033, (t - lastT) / 1000); // clamp dt for stability
  lastT = t;

  // Physics update
  for (const c of circles) {
    // gravity (device tilt updates gravityX/Y if enabled)
    c.vx += gravityX;
    c.vy += gravityY;

    // integrate
    c.x += c.vx * (dt * 60);
    c.y += c.vy * (dt * 60);

    // damping
    c.vx *= AIR_FRICTION;
    c.vy *= AIR_FRICTION;

    // walls
    resolveWallCollision(c);
  }

  // Circle-circle collisions (pairwise)
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      resolveCircleCollision(circles[i], circles[j]);
    }
  }

  // Draw
  draw();

  requestAnimationFrame(step);
}

function draw() {
  const w = canvas.width;
  const h = canvas.height;

  // background
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, w, h);

  // circles
  for (const c of circles) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fillStyle = c.color;
    ctx.fill();
  }

  // UI text
  ctx.fillStyle = "white";
  ctx.font = `${Math.max(12, Math.floor(14 * (window.devicePixelRatio || 1)))}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  ctx.fillText(
    orientationEnabled
      ? "Tilt to change gravity • Tap circle to pop • Tap empty space to add"
      : "Tap once to enable tilt gravity • Tap circle to pop • Tap empty space to add",
    12,
    22
  );

  // Show gravity vector (tiny indicator)
  const gx = gravityX;
  const gy = gravityY;
  const cx = 24;
  const cy = 44;
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.strokeStyle = "white";
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + gx * 25, cy + gy * 25);
  ctx.stroke();
}

requestAnimationFrame(step);

