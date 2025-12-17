import * as THREE from "three";

/**
 * Grid point cloud geometry (position + uv + aRandom + aSize)
 */
export function createParticleGeometry(particlesCount = 360) {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const uvs = [];
  const randoms = [];
  const sizes = [];

  for (let y = 0; y < particlesCount; y++) {
    for (let x = 0; x < particlesCount; x++) {
      const u = x / (particlesCount - 1);
      const v = y / (particlesCount - 1);
      positions.push((u - 0.5) * 2.0, (v - 0.5) * 2.0, 0);
      uvs.push(u, v);
      randoms.push(Math.random());
      sizes.push(Math.random());
    }
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aRandom", new THREE.Float32BufferAttribute(randoms, 1));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));

  return geometry;
}