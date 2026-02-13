import { Circle } from "./circle.js";

class Vector {
  x;
  y;
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
}
function collideParticles(particle1, particle2, DT, collisionFriction) {
  // Initial velocities and masses of two particles
  const initialVelocities = [new Vector(particle1.dx * DT, particle1.dy * DT), new Vector(particle2.dx * DT, particle2.dy * DT)];
  const masses = [particle1.size * particle1.size, particle2.size * particle2.size];

  // Calculate the difference in positions (xdif, ydif)
  //  const xDiff = particle1.nextx(DT) - particle2.nextx(DT);
  //  const yDiff = particle1.nexty(DT) - particle2.nexty(DT);
  const xDiff = particle1.x - particle2.x;
  const yDiff = particle1.y - particle2.y;

  // Set Center of Mass coordinate system (normalize)
  const distance = Math.sqrt(xDiff * xDiff + yDiff * yDiff);
  const normalizedX = xDiff / distance;
  const normalizedY = yDiff / distance;
  // Center of Mass coordinate system, normal and tangential components
  const centerOfMassNormal = new Vector(normalizedX, normalizedY);
  const centerOfMassTangential = new Vector(normalizedY, -normalizedX);


  // Calculate total mass and combined velocity
  const totalMass = masses[0] + masses[1];
  const combinedVelocity = new Vector((initialVelocities[0].x * masses[0] + initialVelocities[1].x * masses[1]) / totalMass,
    (initialVelocities[0].y * masses[0] + initialVelocities[1].y * masses[1]) / totalMass);

  // Calculate initial velocities in the Center of Mass coordinates (um values)
  const initialVelocitiesCM = [
    new Vector((masses[1] / totalMass) * (initialVelocities[0].x - initialVelocities[1].x), (masses[1] / totalMass) * (initialVelocities[0].y - initialVelocities[1].y)),
    new Vector((masses[0] / totalMass) * (initialVelocities[1].x - initialVelocities[0].x), (masses[0] / totalMass) * (initialVelocities[1].y - initialVelocities[0].y))
  ];

  // Calculate initial velocities in Center of Mass coordinates, tangent, and normal components (umt and umn values)
  const initialVelocitiesCMTangent = [initialVelocitiesCM[0].x * centerOfMassTangential.x + initialVelocitiesCM[0].y * centerOfMassTangential.y,
  initialVelocitiesCM[1].x * centerOfMassTangential.x + initialVelocitiesCM[1].y * centerOfMassTangential.y];
  const initialVelocitiesCMNormal = [initialVelocitiesCM[0].x * centerOfMassNormal.x + initialVelocitiesCM[0].y * centerOfMassNormal.y,
  initialVelocitiesCM[1].x * centerOfMassNormal.x + initialVelocitiesCM[1].y * centerOfMassNormal.y];

  // Calculate final velocities (v values) in the Center of Mass coordinate system
  const finalVelocities = [
    new Vector(initialVelocitiesCMTangent[0] * centerOfMassTangential.x - initialVelocitiesCMNormal[0] * centerOfMassNormal.x + combinedVelocity.x,
      initialVelocitiesCMTangent[0] * centerOfMassTangential.y - initialVelocitiesCMNormal[0] * centerOfMassNormal.y + combinedVelocity.y),
    new Vector(initialVelocitiesCMTangent[1] * centerOfMassTangential.x - initialVelocitiesCMNormal[1] * centerOfMassNormal.x + combinedVelocity.x,
      initialVelocitiesCMTangent[1] * centerOfMassTangential.y - initialVelocitiesCMNormal[1] * centerOfMassNormal.y + combinedVelocity.y)
  ];

  // Update particle velocities
  particle1.dx = (finalVelocities[0].x * collisionFriction) / DT;
  particle1.dy = (finalVelocities[0].y * collisionFriction) / DT;
  particle2.dx = (finalVelocities[1].x * collisionFriction) / DT;
  particle2.dy = (finalVelocities[1].y * collisionFriction) / DT;
}

export { collideParticles }

