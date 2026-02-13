// type tsc to convert all .ts into .js

import { Circle } from "./circle.js";
import { initShaderProgram } from "./shader.js";
//import * as mat4 from "./esm/mat4.js";

main();
async function main() {
	console.log('This is working');

	let gravity = [0, -1]; // Always between -1 and +1 in both directions. Scaled later.
	let hardwareWorking = false;

	if (!(window.DeviceOrientationEvent == undefined)) {
		window.addEventListener("deviceorientation", handleOrientation);
	}

	function handleOrientation(event) {
		let x = event.beta; // In degree in the range [-180,180)
		let y = event.gamma; // In degree in the range [-90,90)

		if (x == null || y == null) {
			gravity[0] = 0;
			gravity[1] = -1;
		}
		else {
			hardwareWorking = true;
			// Because we don't want to have the device upside down
			// We constrain the x value to the range [-90,90]
			if (x > 90) {
				x = 90;
			}
			if (x < -90) {
				x = -90;
			}

			gravity[0] = y / 90; // -1 to +1
			gravity[1] = -x / 90; // flip y upside down.
		}
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
					}
					else {
						alert("Device orientation permission not granted");
					}
				})
				.catch(console.error);
		});
	} // if DeviceOrientation
	else {
		window.addEventListener("deviceorientation", handleOrientation, true);
	}


	//
	// Init gl
	// 
	const canvas = document.getElementById('glcanvas');
	canvas.width = canvas.clientWidth;
	canvas.height = canvas.clientHeight;
	const gl = canvas.getContext('webgl')

	if (!gl) {
		alert('Your browser does not support WebGL');
	}

	gl.clearColor(0.75, 0.85, 0.8, 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	//
	// Create shaderProgram
	// 
	const vertexShaderText = await (await fetch("simple.vs")).text();
	const fragmentShaderText = await (await fetch("simple.fs")).text();
	let shaderProgram = initShaderProgram(gl, vertexShaderText, fragmentShaderText);
	gl.useProgram(shaderProgram);


	//
	// Set Uniform uProjectionMatrix
	//	
	const projectionMatrixUniformLocation = gl.getUniformLocation(shaderProgram, "uProjectionMatrix");
	// canvas.clientWidth is controlled by css settings, or css pixels
	// canvas.width is actual pixels in the final GL generated image.
	const aspect = canvas.clientWidth / canvas.clientHeight;
	const projectionMatrix = mat4.create();
	const yhigh = 10;
	const ylow = -yhigh;
	const xlow = ylow * aspect;
	const xhigh = yhigh * aspect;
	mat4.ortho(projectionMatrix, xlow, xhigh, ylow, yhigh, -1, 1);
	gl.uniformMatrix4fv(
		projectionMatrixUniformLocation,
		false,
		projectionMatrix
	);

	// Reset gravity direction with a click, if we don't have orientation hardware
	addEventListener("click", click);
	function click(event) {
		// based on hardwareWorking?
		const x = event.offsetX;
		const y = gl.canvas.clientHeight - event.offsetY;
		const xratio = x / gl.canvas.clientWidth;
		const yratio = y / gl.canvas.clientHeight;
		gravity[0] = -1 + (1 - -1) * xratio;
		gravity[1] = -1 + (1 - -1) * yratio;
	}

	//
	// Create the objects in the scene:
	//
	const NUM_CIRCLES = 6;
	const circleList = [];

	let tries = 0;
	while (circleList.length < NUM_CIRCLES && tries < 10000) {
		tries += 1;
		let c = new Circle(xlow, xhigh, ylow, yhigh);
		if (!checkForIntersection(c, circleList)) {
			circleList.push(c);
		}
	}

	function checkForIntersection(c, circleList) {
		for (let j = 0; j < circleList.length; j++) {
			const myR = c.size;
			const myX = c.x;
			const myY = c.y;

			const OtherR = circleList[j].size;
			const OtherX = circleList[j].x;
			const OtherY = circleList[j].y;


			const dsquared = (OtherX - myX) ** 2 + (OtherY - myY) ** 2;
			if (dsquared < (myR + OtherR) ** 2) {
				return true;
			}
		}
		return false;
	}

	//
	// Main render loop
	//
	let previousTime = 0;
	function redraw(currentTime) {
		currentTime *= .001; // milliseconds to seconds
		let DT = currentTime - previousTime;
		previousTime = currentTime;
		if (DT > .1) {
			DT = .1;
		}

		// Clear the canvas before we start drawing on it.
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		UpdateAllCircles(gl, shaderProgram, circleList, DT, gravity);

		requestAnimationFrame(redraw);
	}
	requestAnimationFrame(redraw);
};

function UpdateAllCircles(gl, shaderProgram, circleList, DT, gravity) {
	for (let i = 0; i < circleList.length; i++) {
		circleList[i].forces(DT, gravity);
	}

	for (let k = 0; k < circleList.length * 2; k++) {
		for (let i = 0; i < circleList.length; i++) {
			circleList[i].ballBall(DT, circleList, i);
			circleList[i].ballWall(DT)
		}
	}

	for (let i = 0; i < circleList.length; i++) {
		circleList[i].positions(DT);
	}

	for (let i = 0; i < circleList.length; i++) {
		circleList[i].ballWall(DT);
	}

	// Draw the scene
	for (let i = 0; i < circleList.length; i++) {
		circleList[i].draw(gl, shaderProgram);
	}
}

