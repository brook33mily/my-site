const vertexShaderText = `
precision mediump float;

attribute vec2 vertPosition;

// movement + size
uniform vec2 uCenter;
uniform float uRadius;
uniform float uAspect;

void main() {
  vec2 pos = vertPosition * uRadius;
  pos.x /= uAspect;
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

main();

async function main() {
  console.log("This is working");

  // -----------------------------------------------
  // Device orientation gravity (tilt)
  // -----------------------------------------------
  let gravity = [0, -1]; // Always in [-1, +1] both axes (scaled later)
  let hardwareWorking = false;

  function handleOrientation(event) {
    let x = event.beta;  // [-180,180)
    let y = event.gamma; // [-90,90)

    if (x == null || y == null) {
      gravity[0] = 0;
      gravity[1] = -1;
      return;
    }

    hardwareWorking = true;

    // constrain x to [-90, 90] so we don't require upside-down device
    if (x > 90) x = 90;
    if (x < -90) x = -90;

    gravity[0] = y / 90;   // -1..1
    gravity[1] = -x / 90;  // -1..1 (flip so screen coords feel right)
  }

  if (!(window.DeviceOrientationEvent == undefined)) {
    window.addEventListener("deviceorientation", handleOrientation, true);
  }

  // For iOS/Safari permission flow (works on iPhone/iPad)
  if (DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function") {
    const button = document.createElement("button");
    button.innerText = "Enable Device Orientation";
    document.body.appendChild(button);

    button.addEventListener("click", function () {
      DeviceOrientationEvent.requestPermission()
        .then((permissionState) => {
          if (permissionState === "granted") {
            button.style.display = "none";
            window.addEventListener("deviceorientation", handleOrientation, true);
          } else {
            alert("Device orientation permission not granted");
          }
        })
        .catch(console.error);
    });
  }

  // -----------------------------------------------
  // WebGL setup
  // -----------------------------------------------
  const canvas = document.getElementById("glcanvas");

  // Per PWA instructions: size canvas from its CSS/display size, not HTML attrs
  function resizeCanvasToDisplaySize() {
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = Math.floor(canvas.clientWidth * dpr);
    const displayHeight = Math.floor(canvas.clientHeight * dpr);

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
      return true;
    }
    return false;
  }

  resizeCanvasToDisplaySize();

  const gl = canvas.getContext("webgl");
  if (!gl) {
    alert("Your browser does not support WebGL");
    return;
  }

  gl.clearColor(0.75, 0.85, 0.8, 1.0);

  const shaderProgram = initShaderProgram(gl, vertexShaderText, fragmentShaderText);
  gl.useProgram(shaderProgram);

  const aspectUniformLocation = gl.getUniformLocation(shaderProgram, "uAspect");
  const colorUniformLocation = gl.getUniformLocation(shaderProgram, "uColor");
  const centerUniformLocation = gl.getUniformLocation(shaderProgram, "uCenter");
  const radiusUniformLocation = gl.getUniformLocation(shaderProgram, "uRadius");

  function updateViewportAndAspect() {
    gl.viewport(0, 0, canvas.width, canvas.height);
    const aspect = canvas.width / canvas.height;
    gl.uniform1f(aspectUniformLocation, aspect);
  }
  updateViewportAndAspect();

  // -----------------------------------------------
  // Geometry: circle vertices (TRIANGLE_FAN)
  // -----------------------------------------------
  function createCircleVertices(sides) {
    const positions = [];
    positions.push(0, 0);
    for (let i = 0; i < sides + 1; i++) {
      const radians = (i / sides) * 2 * Math.PI;
      positions.push(Math.cos(radians), Math.sin(radians));
    }
    return positions;
  }

  const sides = 64;
  const circleVertices = createCircleVertices(sides);

  const circleVertexBufferObject = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, circleVertexBufferObject);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(circleVertices), gl.STATIC_DRAW);

  const positionAttribLocation = gl.getAttribLocation(shaderProgram, "vertPosition");
  gl.vertexAttribPointer(
    positionAttribLocation,
    2,
    gl.FLOAT,
    false,
    2 * Float32Array.BYTES_PER_ELEMENT,
    0
  );
  gl.enableVertexAttribArray(positionAttribLocation);

  // -----------------------------------------------
  // Helpers
  // -----------------------------------------------
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  // Resolve collisions for all circle pairs:
  // - positional correction removes overlap (prevents sticking)
  // - impulse updates velocities (bounce)
  function resolveCircleCollisions(circles) {
    const restitution = 0.98; // bounciness (1 = perfectly elastic)
    const slop = 0.0005;      // tolerance to reduce jitter
    const percent = 0.8;      // how strongly we separate overlap

    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const a = circles[i];
        const b = circles[j];

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const r = a.radius + b.radius;

        const dist2 = dx * dx + dy * dy;
        if (dist2 >= r * r) continue; // not overlapping

        let dist = Math.sqrt(dist2);
        if (dist < 1e-8) dist = 1e-8; // avoid divide-by-zero

        // collision normal (a -> b)
        const nx = dx / dist;
        const ny = dy / dist;

        // --- positional correction (push apart)
        const penetration = r - dist;
        const correctionMag = Math.max(penetration - slop, 0) * percent;

        // mass proportional to area (radius^2)
        const massA = a.radius * a.radius;
        const massB = b.radius * b.radius;
        const invMassA = 1 / massA;
        const invMassB = 1 / massB;
        const invMassSum = invMassA + invMassB;

        a.x -= (correctionMag * nx) * (invMassA / invMassSum);
        a.y -= (correctionMag * ny) * (invMassA / invMassSum);
        b.x += (correctionMag * nx) * (invMassB / invMassSum);
        b.y += (correctionMag * ny) * (invMassB / invMassSum);

        // --- impulse (bounce)
        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;

        const velAlongNormal = rvx * nx + rvy * ny;

        // if separating, no impulse
        if (velAlongNormal > 0) continue;

        const jImpulse = -(1 + restitution) * velAlongNormal / invMassSum;

        const impulseX = jImpulse * nx;
        const impulseY = jImpulse * ny;

        a.vx -= impulseX * invMassA;
        a.vy -= impulseY * invMassA;
        b.vx += impulseX * invMassB;
        b.vy += impulseY * invMassB;
      }
    }
  }

  // -----------------------------------------------
  // Circle simulation
  // -----------------------------------------------
  class Circle {
    constructor() {
      this.radius = rand(0.03, 0.12);
      this.x = rand(-1 + this.radius, 1 - this.radius);
      this.y = rand(-1 + this.radius, 1 - this.radius);
      this.vx = rand(-0.6, 0.6);
      this.vy = rand(-0.6, 0.6);
      this.color = [Math.random(), Math.random(), Math.random(), 1];
    }

    update(dt) {
      // gravity[] is [-1..1]. Scale to feel good.
      const gStrength = 1.2;

      // Apply gravity
      this.vx += gravity[0] * gStrength * dt;
      this.vy += gravity[1] * gStrength * dt;

      // Light air damping (keeps things from exploding)
      const damping = 0.995;
      this.vx *= damping;
      this.vy *= damping;

      // Integrate position
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Wall collisions (bounce)
      if (this.x + this.radius > 1) {
        this.x = 1 - this.radius;
        this.vx *= -1;
      } else if (this.x - this.radius < -1) {
        this.x = -1 + this.radius;
        this.vx *= -1;
      }

      if (this.y + this.radius > 1) {
        this.y = 1 - this.radius;
        this.vy *= -1;
      } else if (this.y - this.radius < -1) {
        this.y = -1 + this.radius;
        this.vy *= -1;
      }
    }

    draw() {
      gl.uniform4fv(colorUniformLocation, this.color);
      gl.uniform2f(centerUniformLocation, this.x, this.y);
      gl.uniform1f(radiusUniformLocation, this.radius);
      gl.drawArrays(gl.TRIANGLE_FAN, 0, sides + 2);
    }
  }

  // Make circles
  const circles = [];
  for (let i = 0; i < 60; i++) circles.push(new Circle());

  // -----------------------------------------------
  // Main loop
  // -----------------------------------------------
  let lastTime = performance.now();

  function render(time) {
    const dt = (time - lastTime) / 1000;
    lastTime = time;

    // handle resize (important on mobile rotate)
    if (resizeCanvasToDisplaySize()) {
      gl.useProgram(shaderProgram);
      updateViewportAndAspect();
    }

    gl.clear(gl.COLOR_BUFFER_BIT);

    // Update motion
    for (const c of circles) c.update(dt);

    // NEW: resolve circle–circle collisions
    resolveCircleCollisions(circles);

    // Draw
    for (const c of circles) c.draw();

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
}

// -----------------------------------------------
// Shader helpers
// -----------------------------------------------
function initShaderProgram(gl, vsSource, fsSource) {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert(`Unable to initialize shader program: ${gl.getProgramInfoLog(shaderProgram)}`);
    return null;
  }

  gl.validateProgram(shaderProgram);
  if (!gl.getProgramParameter(shaderProgram, gl.VALIDATE_STATUS)) {
    console.error("ERROR validating program!", gl.getProgramInfoLog(shaderProgram));
    return null;
  }

  return shaderProgram;
}

function loadShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(`Error compiling shader: ${gl.getShaderInfoLog(shader)}`);
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

