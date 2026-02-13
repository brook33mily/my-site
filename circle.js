import { collideParticles } from "./collisions.js";
//import * as mat4 from "./esm/mat4.js";

// ✅ Make sure mat4 exists even though this file is a module.
// gl-matrix is loaded in index.html (defer) and exposes glMatrix.mat4 globally. :contentReference[oaicite:4]{index=4}
const mat4 = (globalThis.glMatrix && globalThis.glMatrix.mat4) ? globalThis.glMatrix.mat4 : globalThis.mat4;

const BALL_WALL_FRICTION = 0.9;
const AIR_FRICTION = .999;
const BALL_BALL_FRICTION = 0.9;
const G = 30.0;

class Circle {
    xlow;
    xhigh;
    ylow;
    yhigh;
    color;
    size;
    x;
    y;
    dx;
    dy;

    constructor(xlow, xhigh, ylow, yhigh) {
        this.xlow = xlow;
        this.xhigh = xhigh;
        this.ylow = ylow;
        this.yhigh = yhigh;

        this.color = [Math.random(), Math.random(), Math.random(), 1];
        this.size = 1.0 + Math.random() * 1; // between 1.0 and 2.0

        const minx = xlow + this.size;
        const maxx = xhigh - this.size;
        this.x = minx + Math.random() * (maxx - minx);

        const miny = ylow + this.size;
        const maxy = yhigh - this.size;
        this.y = miny + Math.random() * (maxy - miny);

        this.dx = Math.random() * 2 + 2; // 2 to 4
        if (Math.random() > .5) this.dx = -this.dx;

        this.dy = Math.random() * 2 + 2;
        if (Math.random() > .5) this.dy = -this.dy;
    }

    forces(DT, gravity) {
        // Gravity
        this.dx += G * gravity[0] * DT;
        this.dy += G * gravity[1] * DT;

        // Air Friction
        this.dx *= AIR_FRICTION ** DT;
        this.dy *= AIR_FRICTION ** DT;
    }

    ballWall(DT) {
        if (this.x + this.dx * DT + this.size > this.xhigh) {
            this.dx = -Math.abs(this.dx) * BALL_WALL_FRICTION;
        }
        if (this.x + this.dx * DT - this.size < this.xlow) {
            this.dx = Math.abs(this.dx) * BALL_WALL_FRICTION;
        }
        if (this.y + this.dy * DT + this.size > this.yhigh) {
            this.dy = -Math.abs(this.dy) * BALL_WALL_FRICTION;
        }
        if (this.y + this.dy * DT - this.size < this.ylow) {
            this.dy = Math.abs(this.dy) * BALL_WALL_FRICTION;
        }
    }

    ballBall(DT, circleList, me) {
        for (let j = me + 1; j < circleList.length; j++) {
            const myR = this.size;
            const myX = this.x;
            const myY = this.y;
            const myDX = this.dx;
            const myDY = this.dy;
            const myNextX = myX + myDX * DT;
            const myNextY = myY + myDY * DT;

            const other = circleList[j];
            const OtherR = other.size;
            const OtherX = other.x;
            const OtherY = other.y;
            const OtherDX = other.dx;
            const OtherDY = other.dy;
            const OtherNextX = OtherX + OtherDX * DT;
            const OtherNextY = OtherY + OtherDY * DT;

            const dx = OtherNextX - myNextX;
            const dy = OtherNextY - myNextY;
            const dsquared = dx * dx + dy * dy;

            const minDist = myR + OtherR;
            if (dsquared < minDist * minDist) {
                // ✅ positional correction (push them apart) to prevent "sticking"
                const dist = Math.sqrt(dsquared);
                if (dist > 1e-8) {
                    const overlap = minDist - dist;
                    const nx = dx / dist;
                    const ny = dy / dist;

                    // split correction (you can mass-weight later if you want)
                    this.x -= nx * overlap * 0.5;
                    this.y -= ny * overlap * 0.5;
                    other.x += nx * overlap * 0.5;
                    other.y += ny * overlap * 0.5;
                }

                // keep your collision response method
                collideParticles(this, other, DT, BALL_BALL_FRICTION);
            }
        }
    }

    positions(DT) {
        this.x += this.dx * DT;
        this.y += this.dy * DT;
    }

    draw(gl, shaderProgram) {
        drawCircle(gl, shaderProgram, this.color, this.x, this.y, this.size);
    }
}

function CreateCircleVertices(sides) {
    const positions = [];
    positions.push(0, 0);
    for (let i = 0; i < sides + 1; i++) {
        const radians = (i / sides) * 2 * Math.PI;
        positions.push(Math.cos(radians), Math.sin(radians));
    }
    return positions;
}

function drawCircle(gl, shaderProgram, color, x, y, size) {
    const sides = 64;
    const vertices = CreateCircleVertices(sides);

    const vertexBufferObject = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBufferObject);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

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

    const colorUniformLocation = gl.getUniformLocation(shaderProgram, "uColor");
    gl.uniform4fv(colorUniformLocation, color);

    const modelViewMatrixUniformLocation = gl.getUniformLocation(shaderProgram, "uModelViewMatrix");

    // If mat4 is missing, fail loudly instead of silently drawing nothing
    if (!mat4) {
        throw new Error("mat4 is not available. Ensure gl-matrix loads before main.js.");
    }

    const modelViewMatrix = mat4.create();
    mat4.translate(modelViewMatrix, modelViewMatrix, [x, y, 0]);
    mat4.scale(modelViewMatrix, modelViewMatrix, [size, size, 1]);
    gl.uniformMatrix4fv(modelViewMatrixUniformLocation, false, modelViewMatrix);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, sides + 2);
}

export { Circle, drawCircle };

