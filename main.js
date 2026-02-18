// ===================== Shaders =====================
const vertexShaderText = `
  precision mediump float;

  attribute vec2 vertPosition;

  uniform vec2 uCenter;
  uniform float uRadius;
  uniform float uAspect;

  void main() {
    vec2 pos = vertPosition * uRadius;
    pos.x /= uAspect;     // aspect correction so circles stay round
    pos += uCenter;
    gl_Position = vec4(pos, 0.0, 1.0);
  }
`;

const fragmentShaderText = `
  precision mediump float;

  uniform vec4 uColor;

  void main() {
    gl_FragColor = uColor;
  }
`;

// ===================== Helpers =====================
function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function resizeCanvasToDisplaySize(canvas) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const needResize = canvas.width !== w || canvas.height !== h;
  if (needResize) {
    canvas.width = w;
    canvas.height = h;
  }
  return needResize;
}

function playPopSound() {
  // Simple WebAudio "pop"
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  const ctx = playPopSound._ctx || (playPopSound._ctx = new AudioCtx());
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "triangle";
  osc.frequency.value = 220;

  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.25, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.09);
}

// ===================== Main =====================
async function main() {
  console.log("Bouncing Circles PWA running");

  // ---------- Canvas / GL ----------
  const canvas = document.getElementById("glcanvas");

  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;


  // PWA instructions: set width/height from client size (not in HTML)
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;

  const gl = canvas.getContext("webgl", { antialias: true });
  if (!gl) {
    alert("WebGL not supported");
    return;
  }

  function resize() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  window.addEventListener("resize", resize);
  resize();


  // ---------- Compile / Link program ----------
  const program = initShaderProgram(gl, vertexShaderText, fragmentShaderText);
  if (!program) return;

  const positionAttribLocation = gl.getAttribLocation(program, "vertPosition");
  const centerUniformLocation = gl.getUniformLocation(program, "uCenter");
  const radiusUniformLocation = gl.getUniformLocation(program, "uRadius");
  const aspectUniformLocation = gl.getUniformLocation(program, "uAspect");
  const colorUniformLocation = gl.getUniformLocation(program, "uColor");

  // ---------- Circle geometry (triangle fan) ----------
  const sides = 40;
  const verts = [];
  verts.push(0, 0);
  for (let i = 0; i <= sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    verts.push(Math.cos(a), Math.sin(a));
  }

  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);

  gl.useProgram(program);
  gl.enableVertexAttribArray(positionAttribLocation);
  gl.vertexAttribPointer(positionAttribLocation, 2, gl.FLOAT, false, 0, 0);

  gl.clearColor(0.75, 0.85, 0.8, 1.0);

  // ---------- Accelerometer / Orientation Gravity ----------
  // gravity[] always in [-1..+1]
  let gravity = [0, -1];
  let hardwareWorking = false;

  function handleOrientation(event) {
    let x = event.beta;  // [-180, 180)
    let y = event.gamma; // [-90, 90)

    if (x == null || y == null) {
      gravity[0] = 0;
      gravity[1] = -1;
      return;
    }

    hardwareWorking = true;

    x = clamp(x, -90, 90);
    gravity[0] = y / 90;   // -1..+1
    gravity[1] = -x / 90;  // -1..+1, flipped
  }

  // iOS permission button (required for iPhone/iPad Safari)
  // (Matches the idea in your iOS permission handout.) :contentReference[oaicite:0]{index=0}
  if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function") {
    const button = document.createElement("button");
    button.className = "perm-btn";
    button.innerText = "Enable Device Orientation";
    document.body.appendChild(button);

    button.addEventListener("click", () => {
      DeviceOrientationEvent.requestPermission()
        .then((state) => {
          if (state === "granted") {
            window.addEventListener("deviceorientation", handleOrientation, true);
            button.style.display = "none";
          } else {
            alert("Device orientation permission not granted");
          }
        })
        .catch(console.error);
    });
  } else {
    window.addEventListener("deviceorientation", handleOrientation, true);
  }

  // ---------- Physics + Collisions ----------
  // NOTE about aspect:
  // We render circles with x scaled by 1/aspect in the shader (uAspect).
  // For collision math, we do distance in "visual space" by scaling x by 1/aspect too.

  class Circle {
    constructor() {
      this.radius = rand(0.03, 0.09);
      this.x = rand(-1 + this.radius, 1 - this.radius);
      this.y = rand(-1 + this.radius, 1 - this.radius);

      this.vx = rand(-0.8, 0.8);
      this.vy = rand(-0.8, 0.8);

      this.color = [Math.random(), Math.random(), Math.random(), 1.0];
      this.alive = true;
    }

    draw() {
      gl.uniform4fv(colorUniformLocation, this.color);
      gl.uniform2f(centerUniformLocation, this.x, this.y);
      gl.uniform1f(radiusUniformLocation, this.radius);
      gl.drawArrays(gl.TRIANGLE_FAN, 0, sides + 2);
    }
  }

  const circles = [];
  const NUM = 40;
  for (let i = 0; i < NUM; i++) circles.push(new Circle());

  function getAspect() {
    return canvas.width / canvas.height;
  }

  function effectiveRadiusX(r, aspect) {
    return r / aspect;
  }

  function wallCollisions(c, aspect) {
    const rx = effectiveRadiusX(c.radius, aspect);

    if (c.x + rx > 1) {
      c.x = 1 - rx;
      c.vx *= -1;
    } else if (c.x - rx < -1) {
      c.x = -1 + rx;
      c.vx *= -1;
    }

    if (c.y + c.radius > 1) {
      c.y = 1 - c.radius;
      c.vy *= -1;
    } else if (c.y - c.radius < -1) {
      c.y = -1 + c.radius;
      c.vy *= -1;
    }
  }

  function circleCircleCollisions(aspect) {
    // Elastic collisions in adjusted space where x is scaled by 1/aspect
    for (let i = 0; i < circles.length; i++) {
      const a = circles[i];
      if (!a.alive) continue;

      for (let j = i + 1; j < circles.length; j++) {
        const b = circles[j];
        if (!b.alive) continue;

        const ax = a.x / aspect;
        const bx = b.x / aspect;

        const dx = bx - ax;       // adjusted x
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a.radius + b.radius;

        if (dist > 0 && dist < minDist) {
          // Push them apart (positional correction)
          const overlap = minDist - dist;
          const nx = dx / dist;
          const ny = dy / dist;

          // Move centers in adjusted space, then convert back
          const axNew = ax - nx * overlap * 0.5;
          const bxNew = bx + nx * overlap * 0.5;

          a.x = axNew * aspect;
          b.x = bxNew * aspect;

          a.y -= ny * overlap * 0.5;
          b.y += ny * overlap * 0.5;

          // Velocities in adjusted space
          let avx = a.vx / aspect;
          let bvx = b.vx / aspect;
          let avy = a.vy;
          let bvy = b.vy;

          // Relative velocity along normal
          const rvx = bvx - avx;
          const rvy = bvy - avy;
          const velAlongNormal = rvx * nx + rvy * ny;

          // If separating, skip impulse
          if (velAlongNormal > 0) continue;

          // Mass ~ area ~ r^2 (feels nicer)
          const ma = a.radius * a.radius;
          const mb = b.radius * b.radius;

          const restitution = 1.0; // perfectly bouncy
          const jImpulse = -(1 + restitution) * velAlongNormal / (1 / ma + 1 / mb);

          const impX = jImpulse * nx;
          const impY = jImpulse * ny;

          avx -= impX / ma;
          avy -= impY / ma;
          bvx += impX / mb;
          bvy += impY / mb;

          // Convert adjusted vx back
          a.vx = avx * aspect;
          b.vx = bvx * aspect;
          a.vy = avy;
          b.vy = bvy;

          // Tiny damping to prevent jitter explosions
          const damp = 0.999;
          a.vx *= damp; a.vy *= damp;
          b.vx *= damp; b.vy *= damp;
        }
      }
    }
  }

  // ---------- Pop on click/touch ----------
  function popAtClientXY(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const xNdc = ((clientX - rect.left) / rect.width) * 2 - 1;
    const yNdc = 1 - ((clientY - rect.top) / rect.height) * 2;

    const aspect = getAspect();

    for (const c of circles) {
      if (!c.alive) continue;

      const dx = (xNdc - c.x) / aspect; // adjusted x distance
      const dy = yNdc - c.y;
      const d = Math.hypot(dx, dy);

      if (d <= c.radius) {
        c.alive = false;
        playPopSound();
        break;
      }
    }
  }

  canvas.addEventListener("click", (e) => {
    popAtClientXY(e.clientX, e.clientY);
  });

  canvas.addEventListener("touchstart", (e) => {
    if (e.touches && e.touches.length > 0) {
      const t = e.touches[0];
      popAtClientXY(t.clientX, t.clientY);
    }
  }, { passive: true });

  // ---------- Render loop ----------
  let lastTime = performance.now();

  function render(time) {
    const dt = (time - lastTime) / 1000;
    lastTime = time;

    const resized = resizeCanvasToDisplaySize(canvas);
    const aspect = getAspect();

    if (resized) {
      gl.viewport(0, 0, canvas.width, canvas.height);
    }

    gl.uniform1f(aspectUniformLocation, aspect);

    gl.clear(gl.COLOR_BUFFER_BIT);

    // gravity strength: tweak to taste
    const gravityStrength = 0.9; // acceleration in NDC-ish units
    const ax = gravity[0] * gravityStrength;
    const ay = gravity[1] * gravityStrength;

    // Update motion
    for (const c of circles) {
      if (!c.alive) continue;

      // Accelerate
      c.vx += ax * dt;
      c.vy += ay * dt;

      // Integrate
      c.x += c.vx * dt;
      c.y += c.vy * dt;

      // Wall collisions
      wallCollisions(c, aspect);
    }

    // Circle-circle collisions
    circleCircleCollisions(aspect);

    // Draw
    for (const c of circles) {
      if (!c.alive) continue;
      c.draw();
    }

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
}

main();

// ===================== Shader Utilities =====================
function initShaderProgram(gl, vsSource, fsSource) {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert("Unable to initialize shader program: " + gl.getProgramInfoLog(shaderProgram));
    return null;
  }

  gl.validateProgram(shaderProgram);
  if (!gl.getProgramParameter(shaderProgram, gl.VALIDATE_STATUS)) {
    console.error("ERROR validating program!", gl.getProgramInfoLog(shaderProgram));
    return null;
  }

  gl.useProgram(shaderProgram);
  return shaderProgram;
}

function loadShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert("An error occurred compiling the shaders: " + gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

