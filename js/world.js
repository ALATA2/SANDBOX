import * as THREE from 'three';
import { edgeTable, triTable } from './mctable.js';
import { game } from './game.js';

// World Configuration
export const world = {
  sizeX: 40,
  sizeY: 16,
  sizeZ: 40,
  spacing: 1.6,
  density: null, // Flat Float32Array
  terrainMesh: null,
  waterMesh: null,
  oreDeposits: [], // Array of meshes representing ore nodes
  sceneryMeshes: [], // Trees, rocks, etc.
  lighthouseBeam: null // Rotating lighthouse beam
};

// Indexing helper for 3D array flattened
function getGridIndex(x, y, z) {
  return x * world.sizeY * world.sizeZ + y * world.sizeZ + z;
}

// Get density with bounds checking
export function getDensity(x, y, z) {
  x = Math.max(0, Math.min(Math.round(x), world.sizeX - 1));
  y = Math.max(0, Math.min(Math.round(y), world.sizeY - 1));
  z = Math.max(0, Math.min(Math.round(z), world.sizeZ - 1));
  return world.density[getGridIndex(x, y, z)];
}

// Set density with bounds checking
export function setDensity(x, y, z, value) {
  x = Math.max(0, Math.min(Math.round(x), world.sizeX - 1));
  y = Math.max(0, Math.min(Math.round(y), world.sizeY - 1));
  z = Math.max(0, Math.min(Math.round(z), world.sizeZ - 1));
  world.density[getGridIndex(x, y, z)] = value;
}

// 2D Noise Implementation
function hash2D(x, z) {
  const h = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453123) % 1;
  return h < 0 ? h + 1 : h;
}

function smoothNoise2D(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;

  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);

  const n00 = hash2D(xi, zi);
  const n10 = hash2D(xi + 1, zi);
  const n01 = hash2D(xi, zi + 1);
  const n11 = hash2D(xi + 1, zi + 1);

  const x1 = n00 + u * (n10 - n00);
  const x2 = n01 + u * (n11 - n01);
  return x1 + v * (x2 - x1);
}

function fbmNoise2D(x, z) {
  let value = 0;
  let amplitude = 1.0;
  let frequency = 1.0;
  for (let i = 0; i < 3; i++) {
    value += smoothNoise2D(x * frequency, z * frequency) * amplitude;
    amplitude *= 0.5;
    frequency *= 2.0;
  }
  return value;
}

// Create the island density grid
function generateDensityGrid() {
  const size = world.sizeX * world.sizeY * world.sizeZ;
  world.density = new Float32Array(size);

  const cx = world.sizeX / 2;
  const cz = world.sizeZ / 2;

  for (let x = 0; x < world.sizeX; x++) {
    for (let z = 0; z < world.sizeZ; z++) {
      // Distance from center of the island (radial falloff)
      const dx = x - cx;
      const dz = z - cz;
      const dist = Math.sqrt(dx*dx + dz*dz);
      const maxDist = world.sizeX * 0.48;
      const radialFactor = Math.max(0, 1.0 - dist / maxDist);
      
      // Calculate land height using noise
      const noiseVal = fbmNoise2D(x * 0.1, z * 0.1);
      const islandHeight = (noiseVal * 8.0 + 2.0) * Math.pow(radialFactor, 1.2);

      for (let y = 0; y < world.sizeY; y++) {
        // Flat island base with hills
        let dens = islandHeight - y;

        // Create a cave/tunnel structure near the center
        // A simple 3D mathematical carve: subtract density inside a cylinder/sphere tunnel
        const tunnelRadius = 2.2;
        const tx = cx;
        const ty = 4.5;
        const tz = cz;
        // Horizontal tunnel pointing in Z direction
        const distToTunnelAxis = Math.sqrt(Math.pow(x - tx, 2) + Math.pow(y - ty, 2));
        if (distToTunnelAxis < tunnelRadius && z > 10 && z < 30) {
          const carveAmount = (1.0 - distToTunnelAxis / tunnelRadius) * 2.5;
          dens -= carveAmount;
        }

        setDensity(x, y, z, dens);
      }
    }
  }
}

// Convert density grid to standard low-poly Mesh using Marching Cubes
export function buildMarchingCubesMesh() {
  const positions = [];
  
  // Cube vertex index offsets
  const cornerOffsets = [
    [0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1],
    [0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]
  ];

  // Cube edge corner mappings
  const edgeCorners = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7]
  ];

  const spacing = world.spacing;

  for (let x = 0; x < world.sizeX - 1; x++) {
    for (let y = 0; y < world.sizeY - 1; y++) {
      for (let z = 0; z < world.sizeZ - 1; z++) {
        
        // 1. Get densities at 8 corners
        const d = new Float32Array(8);
        for (let i = 0; i < 8; i++) {
          const off = cornerOffsets[i];
          d[i] = getDensity(x + off[0], y + off[1], z + off[2]);
        }

        // 2. Classify cell corners to find case index (0-255)
        let cubeIndex = 0;
        if (d[0] >= 0) cubeIndex |= 1;
        if (d[1] >= 0) cubeIndex |= 2;
        if (d[2] >= 0) cubeIndex |= 4;
        if (d[3] >= 0) cubeIndex |= 8;
        if (d[4] >= 0) cubeIndex |= 16;
        if (d[5] >= 0) cubeIndex |= 32;
        if (d[6] >= 0) cubeIndex |= 64;
        if (d[7] >= 0) cubeIndex |= 128;

        // Cube is entirely inside or outside the surface
        const edges = edgeTable[cubeIndex];
        if (edges === 0) continue;

        // 3. Interpolate vertices along active edges
        const vertList = new Float32Array(12 * 3);
        for (let i = 0; i < 12; i++) {
          if (edges & (1 << i)) {
            const c1 = edgeCorners[i][0];
            const c2 = edgeCorners[i][1];
            
            const off1 = cornerOffsets[c1];
            const off2 = cornerOffsets[c2];

            const p1x = (x + off1[0]) * spacing;
            const p1y = (y + off1[1]) * spacing;
            const p1z = (z + off1[2]) * spacing;

            const p2x = (x + off2[0]) * spacing;
            const p2y = (y + off2[1]) * spacing;
            const p2z = (z + off2[2]) * spacing;

            const val1 = d[c1];
            const val2 = d[c2];

            // Linear interpolation factor
            let t = 0.5;
            const diff = val2 - val1;
            if (Math.abs(diff) > 0.00001) {
              t = -val1 / diff;
            }
            t = Math.max(0, Math.min(1, t)); // clamp

            vertList[i * 3 + 0] = p1x + t * (p2x - p1x);
            vertList[i * 3 + 1] = p1y + t * (p2y - p1y);
            vertList[i * 3 + 2] = p1z + t * (p2z - p1z);
          }
        }

        // 4. Retrieve triangles from triTable
        const triRowOffset = cubeIndex * 16;
        for (let i = 0; i < 16; i += 3) {
          if (triTable[triRowOffset + i] === -1) break;

          const e0 = triTable[triRowOffset + i + 0];
          const e1 = triTable[triRowOffset + i + 1];
          const e2 = triTable[triRowOffset + i + 2];

          positions.push(vertList[e0 * 3 + 0], vertList[e0 * 3 + 1], vertList[e0 * 3 + 2]);
          positions.push(vertList[e1 * 3 + 0], vertList[e1 * 3 + 1], vertList[e1 * 3 + 2]);
          positions.push(vertList[e2 * 3 + 0], vertList[e2 * 3 + 1], vertList[e2 * 3 + 2]);
        }
      }
    }
  }

  // Create or Update BufferGeometry
  let geometry = null;
  if (world.terrainMesh) {
    geometry = world.terrainMesh.geometry;
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
  } else {
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();

    // Material details: stylized peach-sandy-gold rock
    // Warm tones that react beautifully to sunset light
    world.material = new THREE.MeshStandardMaterial({
      color: 0xdfb48c, // Sandy/clay gold
      roughness: 0.85,
      metalness: 0.05,
      flatShading: true, // Flat shading gives the low-poly look!
      vertexColors: false
    });

    world.terrainMesh = new THREE.Mesh(geometry, world.material);
    world.terrainMesh.receiveShadow = true;
    world.terrainMesh.castShadow = true;
    game.scene.add(world.terrainMesh);
  }
}

// Deform terrain at world hit point (digging craters/tunnels)
export function deformTerrainLowPoly(hitPoint, radius, depth) {
  // Convert world coordinates to grid index
  const spacing = world.spacing;
  const gx = hitPoint.x / spacing;
  const gy = hitPoint.y / spacing;
  const gz = hitPoint.z / spacing;

  const gRadius = radius / spacing;

  const minX = Math.max(0, Math.floor(gx - gRadius));
  const maxX = Math.min(world.sizeX - 1, Math.ceil(gx + gRadius));
  const minY = Math.max(0, Math.floor(gy - gRadius));
  const maxY = Math.min(world.sizeY - 1, Math.ceil(gy + gRadius));
  const minZ = Math.max(0, Math.floor(gz - gRadius));
  const maxZ = Math.min(world.sizeZ - 1, Math.ceil(gz + gRadius));

  let modified = false;

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        // Distance in grid cells
        const dx = x - gx;
        const dy = y - gy;
        const dz = z - gz;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

        if (dist < gRadius) {
          const currentDens = getDensity(x, y, z);
          // Subtract density (air has negative density)
          const reduction = depth * (1.0 - dist / gRadius);
          setDensity(x, y, z, currentDens - reduction);
          modified = true;
        }
      }
    }
  }

  // Regenerate terrain mesh if anything changed
  if (modified) {
    buildMarchingCubesMesh();
  }
}

// Height query helper for collision detection (tunnels supported!)
export function getSurfaceHeightNear(px, py, pz) {
  const spacing = world.spacing;
  const gx = px / spacing;
  const gy = py / spacing;
  const gz = pz / spacing;

  // Scan downwards from the player's current y height to find solid terrain floor
  for (let y = Math.floor(gy); y >= 0; y--) {
    const dens = getDensity(gx, y, gz);
    if (dens >= 0) {
      // Solid found! Interpolate height between y and y+1
      const densAbove = getDensity(gx, y + 1, gz);
      let t = 0.5;
      const diff = dens - densAbove;
      if (Math.abs(diff) > 0.0001) {
        t = dens / diff;
      }
      t = Math.max(0, Math.min(1, t));
      return (y + t) * spacing;
    }
  }
  return 0.1; // Baseline height
}

// Density check helper to detect wall collisions
export function checkCollision(px, py, pz) {
  const spacing = world.spacing;
  const gx = px / spacing;
  const gy = py / spacing;
  const gz = pz / spacing;
  return getDensity(gx, gy, gz) > 0.15; // Return true if solid
}

// Spawns static low-poly island assets
function spawnScenery() {
  const spacing = world.spacing;
  const cx = world.sizeX / 2;
  const cz = world.sizeZ / 2;

  // 1. Crystal Water Plane
  const waterGeometry = new THREE.PlaneGeometry(300, 300);
  const waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x145a80, // Deep crystal teal blue
    roughness: 0.1,
    metalness: 0.8,
    transparent: true,
    opacity: 0.8,
    flatShading: true
  });
  world.waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
  world.waterMesh.rotation.x = -Math.PI / 2;
  world.waterMesh.position.set(cx * spacing, 4.0, cz * spacing); // Water height
  game.scene.add(world.waterMesh);

  // 2. Low-Poly Trees and Rocks
  // Materials
  const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9, flatShading: true });
  const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x2e8b57, roughness: 0.8, flatShading: true });
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x7a8b8b, roughness: 0.9, flatShading: true });
  const goldMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    roughness: 0.2,
    metalness: 0.9,
    emissive: 0xffd700,
    emissiveIntensity: 0.15,
    flatShading: true
  });

  // Spawn trees randomly on the island surface
  for (let i = 0; i < 40; i++) {
    const rx = Math.random() * (world.sizeX - 10) + 5;
    const rz = Math.random() * (world.sizeZ - 10) + 5;
    
    // Find terrain height
    const wx = rx * spacing;
    const wz = rz * spacing;
    const wy = getSurfaceHeightNear(wx, 15, wz);

    // Only spawn trees on land above water
    if (wy > 4.5) {
      const treeGroup = new THREE.Group();
      
      // Trunk
      const trunkGeom = new THREE.CylinderGeometry(0.2, 0.3, 2.5, 5);
      const trunk = new THREE.Mesh(trunkGeom, woodMaterial);
      trunk.position.y = 1.25;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      treeGroup.add(trunk);

      // Leaves (conical layers)
      const foliageGeom1 = new THREE.ConeGeometry(1.2, 2.0, 5);
      const foliage1 = new THREE.Mesh(foliageGeom1, leavesMaterial);
      foliage1.position.y = 2.5;
      foliage1.castShadow = true;
      treeGroup.add(foliage1);

      const foliageGeom2 = new THREE.ConeGeometry(0.9, 1.5, 5);
      const foliage2 = new THREE.Mesh(foliageGeom2, leavesMaterial);
      foliage2.position.y = 3.5;
      foliage2.castShadow = true;
      treeGroup.add(foliage2);

      treeGroup.position.set(wx, wy, wz);
      treeGroup.scale.setScalar(0.8 + Math.random() * 0.4);
      game.scene.add(treeGroup);
      world.sceneryMeshes.push(treeGroup);
    }
  }

  // 3. Low-Poly Rock formations
  for (let i = 0; i < 20; i++) {
    const rx = Math.random() * (world.sizeX - 6) + 3;
    const rz = Math.random() * (world.sizeZ - 6) + 3;
    
    const wx = rx * spacing;
    const wz = rz * spacing;
    const wy = getSurfaceHeightNear(wx, 15, wz);

    if (wy > 3.0) {
      const rockGeom = new THREE.DodecahedronGeometry(1.0 + Math.random() * 1.5, 0);
      const rock = new THREE.Mesh(rockGeom, rockMaterial);
      rock.position.set(wx, wy - 0.5, wz);
      rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      rock.castShadow = true;
      rock.receiveShadow = true;
      game.scene.add(rock);
      world.sceneryMeshes.push(rock);
    }
  }

  // 4. Gold Ore Nodes (Mineral veins)
  // We place 6 explicit harvestable Gold Ore Nodes on the island
  const locations = [
    { x: 18, z: 12 },
    { x: 28, z: 22 },
    { x: 12, z: 28 },
    { x: 22, z: 15 },
    { x: 26, z: 10 },
    { x: 14, z: 22 }
  ];

  locations.forEach((loc, idx) => {
    const wx = loc.x * spacing;
    const wz = loc.z * spacing;
    const wy = getSurfaceHeightNear(wx, 15, wz);

    // Group for the ore deposit (combining dark rock and bright yellow minerals)
    const oreGroup = new THREE.Group();
    oreGroup.name = `ore_${idx}`;

    // Base rock
    const baseRockGeom = new THREE.DodecahedronGeometry(1.4, 0);
    const baseRock = new THREE.Mesh(baseRockGeom, rockMaterial);
    baseRock.castShadow = true;
    baseRock.receiveShadow = true;
    oreGroup.add(baseRock);

    // Gold Crystals poking out
    const cryGeom = new THREE.DodecahedronGeometry(0.5, 0);
    const crystals = [];
    
    const cryPositions = [
      new THREE.Vector3(0.8, 0.6, 0.2),
      new THREE.Vector3(-0.6, 0.8, -0.4),
      new THREE.Vector3(0.2, 1.1, -0.5),
      new THREE.Vector3(-0.2, 0.4, 0.8),
    ];

    cryPositions.forEach((pos) => {
      const cry = new THREE.Mesh(cryGeom, goldMaterial);
      cry.position.copy(pos);
      cry.scale.set(0.6 + Math.random()*0.5, 1.2 + Math.random()*0.6, 0.6 + Math.random()*0.5);
      cry.rotation.set(Math.random() * 0.5, Math.random() * 0.5, Math.random() * 3);
      cry.castShadow = true;
      oreGroup.add(cry);
      crystals.push(cry);
    });

    oreGroup.position.set(wx, wy - 0.2, wz);
    game.scene.add(oreGroup);
    world.oreDeposits.push(oreGroup);
  });

  // 5. Distant Island with a Lighthouse
  const distIslandGroup = new THREE.Group();
  distIslandGroup.position.set(80, -5, -120); // All'orizzonte
  
  // Mountainous geometry
  const mGeom = new THREE.ConeGeometry(35, 40, 5);
  const mMat = new THREE.MeshStandardMaterial({ color: 0x47515c, roughness: 0.9, flatShading: true });
  const mountain = new THREE.Mesh(mGeom, mMat);
  mountain.position.y = 20;
  distIslandGroup.add(mountain);

  // Lighthouse Tower
  const lGeom = new THREE.CylinderGeometry(2, 3, 15, 6);
  const lMat = new THREE.MeshStandardMaterial({ color: 0xb22222, roughness: 0.8, flatShading: true }); // Dark Red tower
  const tower = new THREE.Mesh(lGeom, lMat);
  tower.position.set(0, 42, 0);
  distIslandGroup.add(tower);

  // Lighthouse Top Glass Room
  const gGeom = new THREE.CylinderGeometry(1.5, 1.5, 2.5, 6);
  const gMat = new THREE.MeshStandardMaterial({ color: 0xffea00, emissive: 0xffea00, emissiveIntensity: 1.0, transparent: true, opacity: 0.6 });
  const glassRoom = new THREE.Mesh(gGeom, gMat);
  glassRoom.position.set(0, 50.75, 0);
  distIslandGroup.add(glassRoom);

  // Lighthouse Roof
  const rGeom = new THREE.ConeGeometry(2, 1.8, 6);
  const rMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9, flatShading: true });
  const roof = new THREE.Mesh(rGeom, rMat);
  roof.position.set(0, 52.9, 0);
  distIslandGroup.add(roof);

  // Lighthouse Light Beam
  // Represented by a long semi-transparent cone rotated horizontally
  const beamGeom = new THREE.ConeGeometry(8, 180, 8, 1, true); // open-ended cone
  beamGeom.rotateX(Math.PI / 2); // Point along Z
  beamGeom.translate(0, 0, 90); // Translate so rotation center is at tip
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff3a8,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
  world.lighthouseBeam = new THREE.Mesh(beamGeom, beamMat);
  world.lighthouseBeam.position.set(80, 50.75 - 5, -120); // Align with lighthouse glass room
  game.scene.add(world.lighthouseBeam);

  game.scene.add(distIslandGroup);
}

// Initialize World
export function initWorld() {
  generateDensityGrid();
  buildMarchingCubesMesh();
  spawnScenery();
}

// Update World Animation (e.g. lighthouse rotation)
export function updateWorld(delta) {
  // Rotate the lighthouse beam around Y axis
  if (world.lighthouseBeam) {
    world.lighthouseBeam.rotation.y += 0.8 * delta;
  }
}
