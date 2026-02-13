import { collideParticles } from "./collisions.js";
//import * as mat4 from "./esm/mat4.js";

const BALL_WALL_FRICTION = 0.9;
const AIR_FRICTION = .999;
const BALL_BALL_FRICTION = 0.9;
const G = 30.0;

class Circle {
    xlow; // number means double. "number" type is better than "any" type.
    xhigh; // Use BigInt for integers bigger than 52 bits.
    ylow;
    yhigh;
    color;
    size;
    x;
    y;
    dx;
    dy;
    constructor(xlow, xhigh, ylow, yhigh) { // make the circles inside these World Coordinates
        this.xlow = xlow;
        this.xhigh = xhigh;
        this.ylow = ylow;
        this.yhigh = yhigh;
        this.color = [Math.random(), Math.random(), Math.random(), 1]
        this.size = 1.0 + Math.random() * 1; // between 1.0 and 2.0
        const minx = xlow + this.size;
        const maxx = xhigh - this.size;
        this.x = minx + Math.random() * (maxx - minx);
        const miny = ylow + this.size;
        const maxy = yhigh - this.size;
        this.y = miny + Math.random() * (maxy - miny);
        this.dx = Math.random() * 2 + 2; // 2 to 4
        if (Math.random() > .5)
            this.dx = -this.dx;
        this.dy = Math.random() * 2 + 2;
        if (Math.random() > .5)
            this.dy = - this.dy;
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
        // Ball Wall Collisions
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
        // Ball Ball Collisions
        for (let j = me + 1; j < circleList.length; j++) {
            const myR = this.size;
            const myX = this.x;
            const myY = this.y;
            const myDX = this.dx;
            const myDY = this.dy;
            const myNextX = myX + myDX * DT;
            const myNextY = myY + myDY * DT;

            const OtherR = circleList[j].size;
            const OtherX = circleList[j].x;
            const OtherY = circleList[j].y;
            const OtherDX = circleList[j].dx;
            const OtherDY = circleList[j].dy;
            const OtherNextX = OtherX + OtherDX * DT;
            const OtherNextY = OtherY + OtherDY * DT;

            const dsquared = (OtherNextX - myNextX) ** 2 + (OtherNextY - myNextY) ** 2;
            if (dsquared < (myR + OtherR) ** 2) {
                collideParticles(this, circleList[j], DT, BALL_BALL_FRICTION);
            }
        }
    }
    positions(DT) {
        // Update Position
        this.x += this.dx * DT;
        this.y += this.dy * DT;
    }

    draw(gl, shaderProgram) {
        drawCircle(gl, shaderProgram, this.color, this.x, this.y, this.size);
    }
}

function CreateCircleVertices(sides) {
    const positions = [];
    positions.push(0);
    positions.push(0);
    for (let i = 0; i < sides + 1; i++) {
        const radians = i / sides * 2 * Math.PI;
        const x = Math.cos(radians);
        const y = Math.sin(radians);
        positions.push(x);
        positions.push(y);
    }
    return positions;
}

function drawCircle(gl, shaderProgram, color, x, y, size) {
    //
    // Create the vertexBufferObject
    //
    const sides = 64;
    const vertices = CreateCircleVertices(sides);

    const vertexBufferObject = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBufferObject);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    //
    // Set Vertex Attributes
    //
    const positionAttribLocation = gl.getAttribLocation(shaderProgram, 'vertPosition');
    gl.vertexAttribPointer(
        positionAttribLocation, // Attribute location
        2, // Number of elements per attribute
        gl.FLOAT, // Type of elements
        false,
        2 * Float32Array.BYTES_PER_ELEMENT, // Size of an individual vertex
        0 // Offset from the beginning of a single vertex to this attribute
    );
    gl.enableVertexAttribArray(positionAttribLocation);

    //
    // Set Uniform uColor
    //
    const colorUniformLocation = gl.getUniformLocation(shaderProgram, "uColor");
    gl.uniform4fv(colorUniformLocation, color);

    //
    // Set Uniform uModelViewMatrix
    //
    const modelViewMatrixUniformLocation = gl.getUniformLocation(shaderProgram, "uModelViewMatrix");
    const modelViewMatrix = mat4.create();
    mat4.translate(modelViewMatrix, modelViewMatrix, [x, y, 0]);
    mat4.scale(modelViewMatrix, modelViewMatrix, [size, size, 1]);
    //    mat4.rotate(modelViewMatrix, modelViewMatrix, (degrees* Math.PI / 180), [0, 0, 1]);
    gl.uniformMatrix4fv(modelViewMatrixUniformLocation, false, modelViewMatrix);

    //
    // Starts the Shader Program, which draws the current object to the screen.
    //
    gl.drawArrays(gl.TRIANGLE_FAN, 0, sides + 2);
}

export { Circle, drawCircle };