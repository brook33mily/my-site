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
  // Beginning of accelerometer / device orientation initialization
  // -----------------------------------------------
  let gravity = [0, -1]; // Always between -1 and +1 in both directions. Scaled later.
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

    // constrain x to [-90, 90]
    if (x > 90) x = 90;
    if (x < -90) x = -90;

    gravity[0] = y / 90;   // -1 to +1
    gravity[1] = -x / 90;  // flip y upside down
  }

  if (!(window.DeviceOrientationEvent == undefined)) {
    window.addEventListener("deviceorientation", handleOrientation, true);
  }

  // For iOS / some Mac Safari cases, request permission with a button
  if (DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function") {
    const button = document.createElement("button");
    button.innerText = "Enable Device Orientation";
    document.body.appendChild(button);

    button.addEventListener("click", function () {
      DeviceOrientationEvent.requestPermission()
        .then((permissionState) => {
          if (permissionState === "granted") {
            button.style.display = "none";
            // listener already attached above, but safe to ensure:
            window.addEventListener("deviceorientation", handleOrientation, true);
          } else {
            alert("Device orientation permission not granted");
          }
        })
        .catch(console.error);
    });
  }
  // -----------------------------------------------
  // End of accelerometer initialization
  // -----------------------------------------------

  //
  // Init gl
  //
  const canvas = document.getElementById("glcanvas");

  // Per your instructions: set these in JS, not in HTML
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

  //
  // Create shaders
  //
  let shaderProgram = initShaderProgram(gl, vertexShaderText, fragmentShaderText);
  gl.useProgram(shaderProgram);

  const aspectUniformLocation = gl.getUniformLocation(shaderProgram, "uAspect");

  function updateViewportAndAspect() {
    gl.viewport(0, 0, canvas.width, canvas.height);
    const aspect = canvas.width / canvas.height;
    gl.uniform1f(aspectUniformLocation, aspect);
  }
  updateViewportAndAspect();

  //
  // Create buffer
  //
  function CreateCircleVertices(sides) {
    const positions = [];
    positions.push(0, 0);
    for (let i = 0; i < sides + 1; i++) {
      const radians = (i / sides) * 2 * Math.PI;
      positions.push(Math.cos(radians), Math.sin(radians));
    }
    return positions;
  }

  const sides = 64;
  const circleVertices = CreateCircleVertices(sides);

  const circleVertexBufferObject = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, circleVertexBufferObject);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(circleVertices), gl.STATIC_DRAW);

  //
  // Set Vertex Attributes
  //
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

  //
  // Set Uniforms
  //
  const colorUniformLocation = gl.getUniformLocation(shaderProgram, "uColor");
  const centerUniformLocation = gl.getUniformLocation(shaderProgram, "uCenter");
  const radiusUniformLocation = gl.getUniformLocation(shaderProgram, "uRadius");

  //
  // Circle class
  //
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

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
      // Scale gravity to something that feels good
      // (gravity[] is [-1..1], so this sets overall acceleration strength)
      const gStrength = 1.2;

      // Apply gravity (tilt) + a little damping
      this.vx += gravity[0] * gStrength * dt;
      this.vy += gravity[1] * gStrength * dt;

      const damping = 0.995; // tiny air friction
      this.vx *= damping;
      this.vy *= damping;

      // Integrate position
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Wall bounce with clamp
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

  //
  // Make many circles
  //
  const circles = [];
  for (let i = 0; i < 60; i++) circles.push(new Circle());

  //
  // Main loop
  //
  let lastTime = performance.now();

  function render(time) {
    const dt = (time - lastTime) / 1000;
    lastTime = time;

    // Handle resize (important on mobile rotate)
    if (resizeCanvasToDisplaySize()) {
      updateViewportAndAspect();
    }

    gl.clear(gl.COLOR_BUFFER_BIT);

    for (const c of circles) {
      c.update(dt);
      c.draw();
    }

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
}

//
// Shader helpers
//
function initShaderProgram(gl, vsSource, fsSource) {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert(`Unable to initialize the shader program: ${gl.getProgramInfoLog(shaderProgram)}`);
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
    alert(`An error occurred compiling the shaders: ${gl.getShaderInfoLog(shader)}`);
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

