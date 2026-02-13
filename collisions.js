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
  const initialVelocities = [
    new Vector(particle1.dx * DT, particle1.dy * DT),
    new Vector(particle2.dx * DT, particle2.dy * DT),
  ];
  const masses = [particle1.size * particle1.size, particle2.size * particle2.size];

  // ✅ Use NEXT positions so the collision normal matches your detection logic
  const x1n = particle1.x + particle1.dx * DT;
  const y1n = particle1.y + particle1.dy * DT;
  const x2n = particle2.x + particle2.dx * DT;
  const y2n = particle2.y + particle2.dy * DT;

  const xDiff = x1n - x2n;
  const yDiff = y1n - y2n;

  const distance = Math.sqrt(xDiff * xDiff + yDiff * yDiff);

  // ✅ Avoid NaNs if circles are exactly on top of each other
  if (distance < 1e-8) return;

  const normalizedX = xDiff / distance;
  const normalizedY = yDiff / distance;

  const centerOfMassNormal = new Vector(normalizedX, normalizedY);
  const centerOfMassTangential = new Vector(normalizedY, -normalizedX);

  const totalMass = masses[0] + masses[1];
  const combinedVelocity = new Vector(
    (initialVelocities[0].x * masses[0] + initialVelocities[1].x * masses[1]) / totalMass,
    (initialVelocities[0].y * masses[0] + initialVelocities[1].y * masses[1]) / totalMass
  );

  const initialVelocitiesCM = [
    new Vector(
      (masses[1] / totalMass) * (initialVelocities[0].x - initialVelocities[1].x),
      (masses[1] / totalMass) * (initialVelocities[0].y - initialVelocities[1].y)
    ),
    new Vector(
      (masses[0] / totalMass) * (initialVelocities[1].x - initialVelocities[0].x),
      (masses[0] / totalMass) * (initialVelocities[1].y - initialVelocities[0].y)
    ),
  ];

  const initialVelocitiesCMTangent = [
    initialVelocitiesCM[0].x * centerOfMassTangential.x + initialVelocitiesCM[0].y * centerOfMassTangential.y,
    initialVelocitiesCM[1].x * centerOfMassTangential.x + initialVelocitiesCM[1].y * centerOfMassTangential.y,
  ];

  const initialVelocitiesCMNormal = [
    initialVelocitiesCM[0].x * centerOfMassNormal.x + initialVelocitiesCM[0].y * centerOfMassNormal.y,
    initialVelocitiesCM[1].x * centerOfMassNormal.x + initialVelocitiesCM[1].y * centerOfMassNormal.y,
  ];

  const finalVelocities = [
    new Vector(
      initialVelocitiesCMTangent[0] * centerOfMassTangential.x - initialVelocitiesCMNormal[0] * centerOfMassNormal.x + combinedVelocity.x,
      initialVelocitiesCMTangent[0] * centerOfMassTangential.y - initialVelocitiesCMNormal[0] * centerOfMassNormal.y + combinedVelocity.y
    ),
    new Vector(
      initialVelocitiesCMTangent[1] * centerOfMassTangential.x - initialVelocitiesCMNormal[1] * centerOfMassNormal.x + combinedVelocity.x,
      initialVelocitiesCMTangent[1] * centerOfMassTangential.y - initialVelocitiesCMNormal[1] * centerOfMassNormal.y + combinedVelocity.y
    ),
  ];

  particle1.dx = (finalVelocities[0].x * collisionFriction) / DT;
  particle1.dy = (finalVelocities[0].y * collisionFriction) / DT;
  particle2.dx = (finalVelocities[1].x * collisionFriction) / DT;
  particle2.dy = (finalVelocities[1].y * collisionFriction) / DT;
}

export { collideParticles };

