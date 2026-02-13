//
// Initialize a Shader Program, which consists of a Vertex Shader and a Fragment Shader, compiled and linked.
// NOTE: This file never needs to be changed.
//
function initShaderProgram(gl, vsSource, fsSource) {
  // Create and compile the two shaders.
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

  // Combine the two shaders into a shader program
  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  // If creating the shader program failed, alert
  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert(
      `Unable to initialize the shader program: ${gl.getProgramInfoLog(
        shaderProgram
      )}`
    );
    throw new Error("Unable to initialize the shader program")
  }

  gl.validateProgram(shaderProgram);
  if (!gl.getProgramParameter(shaderProgram, gl.VALIDATE_STATUS)) {
    console.error('ERROR validating program!', gl.getProgramInfoLog(shaderProgram));
    throw new Error("ERROR validating program!")
  }

  return shaderProgram;
}

//
// creates a shader of the given type with the given source code, and compiles it.
//
function loadShader(gl, type, source) {
  // Make an empty shader
  const shader = gl.createShader(type);

  // Send the source to the shader object
  gl.shaderSource(shader, source);

  // Compile the shader program
  gl.compileShader(shader);

  // If compiling the shader failed, alert
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(
      `An error occurred compiling the shaders: ${gl.getShaderInfoLog(shader)}`
    );
    gl.deleteShader(shader);
    throw new Error("Could not make a shader.");
  }

  return shader;
}

export { initShaderProgram };