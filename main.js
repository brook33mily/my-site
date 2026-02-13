const vertexShaderText = `
precision mediump float;

attribute vec2 vertPosition;

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
  let gravity = [0, -1]; // [-1..1]
  function handleOrientation(event) {
    let x = event.beta;
    let y = event.gamma;

    if (x == null || y == null) {
      gravity[0] = 0;
      gravity[1] = -1;
      return;
    }

    if (x > 90) x = 90;
    if (x < -90) x = -90;

    gravity[0] = y / 90;
    gravity[1] = -x / 90;
  }

  if (!(window.DeviceOrientationEvent == undefined)) {
    window.addEventListener("deviceorientation", handleOrientation, true);
  }

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

  function resizeCanvasToDisplaySize() {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
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
    gl.uniform1f(aspectUniformLocation, canvas.width / canvas.height);
  }
  updateViewportAndAspect();

  // -----------------------------------------------
  // Geometry: circle vertices
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
  gl.vertexAttribPointer(positionAttribLocation, 2, gl.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0);
  gl.enableVertexAttribArray(positionAttribLocation);

  // -----------------------------------------------
  // Helpers
  // -----------------------------------------------
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  // -----------------------------------------------
  // Student-style solver: Verlet + substeps + overlap push
  // -----------------------------------------------
  class Circle {
    constructor() {
      this.radius = rand(0.03, 0.12);

      // current position
      this.x = rand(-1 + this.radius, 1 - this.radius);
      this.y = rand(-1 + this.radius, 1 - this.radius);

      // previous position (gives initial velocity)
      const initVel = 0.02;
      this.px = this.x - rand(-initVel, initVel);
      this.py = this.y - rand(-initVel, initVel);

      // accumulated accel
      this.ax = 0;
      this.ay = 0;

      this.color = [Math.random(), Math.random(), Math.random(), 1];
    }

    accelerate(ax, ay) {
      this.ax += ax;
      this.ay += ay;
    }

    // Verlet integrate step
    integrate() {
      const vx = this.x - this.px;
      const vy = this.y - this.py;

      this.px = this.x;
      this.py = this.y;

      this.x = this.x + vx + this.ax;
      this.y = this.y + vy + this.ay;

      this.ax = 0;
      this.ay = 0;
    }

    draw() {
      gl.uniform4fv(colorUniformLocation, this.color);
      gl.uniform2f(centerUniformLocation, this.x, this.y);
      gl.uniform1f(radiusUniformLocation, this.radius);
      gl.drawArrays(gl.TRIANGLE_FAN, 0, sides + 2);
    }
  }

  function solveCircleCollisions(circles, collisionFactor) {
    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const a = circles[i];
        const b = circles[j];

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a.radius + b.radius;

        if (dist === 0 || dist >= minDist) continue;

        const nx = dx / dist;
        const ny = dy / dist;

        const delta = minDist - dist;

        // "mass" ~ radius^2 like student code
        const massA = a.radius * a.radius;
        const massB = b.radius * b.radius;

        const aShare = massA / (massA + massB);
        const bShare = massB / (massA + massB);

        // Push positions apart (this is the big stability trick)
        const tx = delta * nx;
        const ty = delta * ny;

        a.x += tx * (1 - aShare);
        a.y += ty * (1 - aShare);

        b.x -= tx * (1 - bShare);
        b.y -= ty * (1 - bShare);

        // Add a little "bounce" by accelerating along separation direction
        // This mimics the student's accelerateCircle(...) lines.
        a.accelerate(tx * (1 - aShare) * collisionFactor, ty * (1 - aShare) * collisionFactor);
        b.accelerate(-tx * (1 - bShare) * collisionFactor, -ty * (1 - bShare) * collisionFactor);
      }
    }
  }

  function solveWallCollisions(circles, collisionFactor) {
    for (const c of circles) {
      const vx = (c.x - c.px) * collisionFactor;
      const vy = (c.y - c.py) * collisionFactor;

      // left/right
      if (c.x < -1 + c.radius) {
        c.x = -1 + c.radius;
        c.px = c.x;
        c.accelerate(-vx, 0);
      } else if (c.x > 1 - c.radius) {
        c.x = 1 - c.radius;
        c.px = c.x;
        c.accelerate(-vx, 0);
      }

      // bottom/top
      if (c.y < -1 + c.radius) {
        c.y = -1 + c.radius;
        c.py = c.y;
        c.accelerate(0, -vy);
      } else if (c.y > 1 - c.radius) {
        c.y = 1 - c.radius;
        c.py = c.y;
        c.accelerate(0, -vy);
      }
    }
  }

  function applyAirFriction(circles, airFriction) {
    // student code computes vel from (cur - prev) and accelerates opposite
    for (const c of circles) {
      const vx = (c.x - c.px) * -airFriction;
      const vy = (c.y - c.py) * -airFriction;
      c.accelerate(vx, vy);
    }
  }

  // -----------------------------------------------
  // Create circles
  // -----------------------------------------------
  const circles = [];
  const NUM = 60;
  for (let i = 0; i < NUM; i++) circles.push(new Circle());

  // Tune like student code
  const numSubSteps = 8;
  const collisionFactor = 0.10; // try 0.08–0.2
  const airFriction = 0.02;     // small; student used 1 in pixel units; ours is clip units
  const gravityMultiplier = 0.003; // scale for clip-space (VERY important)

  // -----------------------------------------------
  // Main loop
  // -----------------------------------------------
  let lastTime = performance.now();

  function render(time) {
    const dtSec = (time - lastTime) / 1000;
    lastTime = time;

    // clamp dt so physics doesn't explode on tab switch
    let dt = dtSec;
    if (dt > 0.05) dt = 0.05;

    if (resizeCanvasToDisplaySize()) {
      gl.useProgram(shaderProgram);
      updateViewportAndAspect();
    }

    // Physics in substeps (key to good collisions)
    let step = dt / numSubSteps;
    for (let s = 0; s < numSubSteps; s++) {
      // gravity in ANY direction
      for (const c of circles) {
        c.accelerate(gravity[0] * gravityMultiplier, gravity[1] * gravityMultiplier);
      }

      applyAirFriction(circles, airFriction);

      // Solve collisions multiple times per substep for "solid" behavior
      solveCircleCollisions(circles, collisionFactor);
      solveWallCollisions(circles, collisionFactor);

      // Integrate positions
      for (const c of circles) c.integrate();
    }

    // Draw
    gl.clear(gl.COLOR_BUFFER_BIT);
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

