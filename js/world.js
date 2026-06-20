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
  waterActive: null, // 3D Uint8Array for connected water cells
  oreDeposits: [], // Array of meshes representing ore nodes
  sceneryMeshes: [], // Trees, rocks, etc.
  trees: [], // Array of active tree groups for Axe chopping
  lighthouseBeam: null, // Rotating lighthouse beam
  feedbackBoard: null, // Feedback Board Mesh
  clouds: [] // Array of cloud meshes
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

// Calculate original uncarved terrain height at coordinates (vx, vz)
export function getOriginalHeight(vx, vz) {
  const spacing = world.spacing;
  const gx = vx / spacing;
  const gz = vz / spacing;

  const cx = world.sizeX / 2;
  const cz = world.sizeZ / 2;

  // Radial falloff math (identical to island generation)
  const dx = gx - cx;
  const dz = gz - cz;
  const dist = Math.sqrt(dx*dx + dz*dz);
  const maxDist = world.sizeX * 0.48;
  const radialFactor = Math.max(0, 1.0 - dist / maxDist);
  
  const noiseVal = fbmNoise2D(gx * 0.1, gz * 0.1);
  return (noiseVal * 8.0 + 2.0) * Math.pow(radialFactor, 1.2) * spacing;
}

// Compute dynamic vertex color based on depth from original surface
function getVertexColorForDepth(vx, vy, vz) {
  const H = getOriginalHeight(vx, vz);
  const depth = H - vy;
  
  // Interpolation factor (0 at surface, 1 at 0.5 meters depth)
  const t = Math.max(0, Math.min(1.0, depth / 0.5));
  
  // Sandy peach-gold: #dfb48c -> (0.87, 0.70, 0.55)
  // Dark earth/clay: #3d2f25 -> (0.24, 0.18, 0.14)
  const r = 0.87 + t * (0.24 - 0.87);
  const g = 0.70 + t * (0.18 - 0.70);
  const b = 0.55 + t * (0.14 - 0.55);
  return [r, g, b];
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
  const colors = [];
  
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

        const edges = edgeTable[cubeIndex];
        if (edges === 0) continue;

        const triRow = triTable[cubeIndex];

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
        for (let i = 0; i < triRow.length; i += 3) {
          const e0 = triRow[i + 0];
          const e1 = triRow[i + 1];
          const e2 = triRow[i + 2];

          if (e0 === undefined || e1 === undefined || e2 === undefined) break;
          if (e0 < 0 || e0 >= 12 || e1 < 0 || e1 >= 12 || e2 < 0 || e2 >= 12) break;

          const v0x = vertList[e0 * 3 + 0];
          const v0y = vertList[e0 * 3 + 1];
          const v0z = vertList[e0 * 3 + 2];

          const v1x = vertList[e1 * 3 + 0];
          const v1y = vertList[e1 * 3 + 1];
          const v1z = vertList[e1 * 3 + 2];

          const v2x = vertList[e2 * 3 + 0];
          const v2y = vertList[e2 * 3 + 1];
          const v2z = vertList[e2 * 3 + 2];

          // Check for safety against NaNs
          if (Number.isNaN(v0x) || Number.isNaN(v0y) || Number.isNaN(v0z) ||
              Number.isNaN(v1x) || Number.isNaN(v1y) || Number.isNaN(v1z) ||
              Number.isNaN(v2x) || Number.isNaN(v2y) || Number.isNaN(v2z)) {
            continue;
          }

          positions.push(v0x, v0y, v0z);
          positions.push(v1x, v1y, v1z);
          positions.push(v2x, v2y, v2z);

          const c0 = getVertexColorForDepth(v0x, v0y, v0z);
          const c1 = getVertexColorForDepth(v1x, v1y, v1z);
          const c2 = getVertexColorForDepth(v2x, v2y, v2z);

          colors.push(c0[0], c0[1], c0[2]);
          colors.push(c1[0], c1[1], c1[2]);
          colors.push(c2[0], c2[1], c2[2]);
        }
      }
    }
  }

  // Create BufferGeometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  if (world.terrainMesh) {
    const oldGeometry = world.terrainMesh.geometry;
    world.terrainMesh.geometry = geometry;
    oldGeometry.dispose();
  } else {
    // Material details: stylized peach-sandy-gold rock
    // Set color to white to multiply with vertex colors, using FrontSide to prevent self-intersection and visual overlapping.
    world.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.05,
      flatShading: true, // Flat shading gives the low-poly look!
      vertexColors: true, // Enable vertex colors!
      side: THREE.FrontSide
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
          if (y === 0) continue; // Bedrock is indestructible!
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
    updateWaterGrid();
    if (world.waterMesh) {
      const newWaterGeom = buildWaterGeometry();
      const oldWaterGeom = world.waterMesh.geometry;
      world.waterMesh.geometry = newWaterGeom;
      oldWaterGeom.dispose();
    }
  }
}

// 3D BFS to flood fill water cells connected to the map boundaries
export function updateWaterGrid() {
  const size = world.sizeX * world.sizeY * world.sizeZ;
  if (!world.waterActive) {
    world.waterActive = new Uint8Array(size);
  } else {
    world.waterActive.fill(0);
  }

  const queue = [];
  const visited = world.waterActive;

  function getIdx(x, y, z) {
    return x * world.sizeY * world.sizeZ + y * world.sizeZ + z;
  }

  const maxWaterY = 2; // Water level 4.0m corresponds to grid index y = 2 (up to 4.8m)

  // 1. Add all border air voxels at y <= maxWaterY to the queue
  for (let y = 0; y <= maxWaterY; y++) {
    for (let x = 0; x < world.sizeX; x++) {
      for (let z of [0, world.sizeZ - 1]) {
        if (getDensity(x, y, z) <= 0.15) {
          const idx = getIdx(x, y, z);
          visited[idx] = 1;
          queue.push(x, y, z);
        }
      }
    }
    for (let z = 1; z < world.sizeZ - 1; z++) {
      for (let x of [0, world.sizeX - 1]) {
        if (getDensity(x, y, z) <= 0.15) {
          const idx = getIdx(x, y, z);
          visited[idx] = 1;
          queue.push(x, y, z);
        }
      }
    }
  }

  // 2. BFS Traversal
  let head = 0;
  const dirs = [
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1]
  ];

  while (head < queue.length) {
    const cx = queue[head++];
    const cy = queue[head++];
    const cz = queue[head++];

    for (let i = 0; i < dirs.length; i++) {
      const nx = cx + dirs[i][0];
      const ny = cy + dirs[i][1];
      const nz = cz + dirs[i][2];

      if (nx >= 0 && nx < world.sizeX &&
          ny >= 0 && ny <= maxWaterY &&
          nz >= 0 && nz < world.sizeZ) {
        
        const nIdx = getIdx(nx, ny, nz);
        if (visited[nIdx] === 0 && getDensity(nx, ny, nz) <= 0.15) {
          visited[nIdx] = 1;
          queue.push(nx, ny, nz);
        }
      }
    }
  }
}

// Build a dynamic BufferGeometry for water, only rendering quads in active water columns
export function buildWaterGeometry() {
  const positions = [];
  const colors = [];
  const depths = [];

  const spacing = world.spacing;
  
  const colorShallow = new THREE.Color(0x00dfc0); // Luminous beach teal
  const colorDeep = new THREE.Color(0x093f60);    // Vibrant deep ocean blue
  const tempColor = new THREE.Color();

  function addQuad(x1, z1, x2, z2, isOuter) {
    const verts = [
      [x1, z1], [x1, z2], [x2, z1],
      [x2, z1], [x1, z2], [x2, z2]
    ];

    for (let i = 0; i < 6; i++) {
      const vx = verts[i][0];
      const vz = verts[i][1];
      
      // Push directly in world X-Z coordinates (Y is height, initially 0, modified by waves)
      positions.push(vx, 0, vz);

      let depth = 4.0;
      if (!isOuter) {
        const groundY = getSurfaceHeightNear(vx, 5.0, vz);
        depth = Math.max(0, 4.0 - groundY);
      }

      const t = Math.min(1.0, depth / 4.0);
      tempColor.copy(colorShallow).lerp(colorDeep, t);
      colors.push(tempColor.r, tempColor.g, tempColor.b);
      depths.push(depth);
    }
  }

  // 1. Outer Ocean (4 large quads)
  addQuad(-150, 64, 214, 150, true);
  addQuad(-150, -150, 214, 0, true);
  addQuad(-150, 0, 0, 64, true);
  addQuad(64, 0, 214, 64, true);

  // 2. Inner Ocean cells
  for (let x = 0; x < world.sizeX; x++) {
    for (let z = 0; z < world.sizeZ; z++) {
      const idx = x * world.sizeY * world.sizeZ + 2 * world.sizeZ + z;
      if (world.waterActive && world.waterActive[idx] === 1) {
        const x1 = x * spacing;
        const x2 = (x + 1) * spacing;
        const z1 = z * spacing;
        const z2 = (z + 1) * spacing;
        addQuad(x1, z1, x2, z2, false);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('depth', new THREE.Float32BufferAttribute(depths, 1));
  geometry.computeVertexNormals();

  return geometry;
}

// Check if a specific world coordinate (px, py, pz) is inside active water
export function checkInWater(px, py, pz) {
  const spacing = world.spacing;
  const gx = Math.floor(px / spacing);
  const gy = Math.floor(py / spacing);
  const gz = Math.floor(pz / spacing);
  
  // If coordinates are outside grid bounds, it's open ocean, check height
  if (gx < 0 || gx >= world.sizeX || gz < 0 || gz >= world.sizeZ) {
    return py < 4.0;
  }
  
  if (gy < 0) return true; // below bedrock
  if (gy >= world.sizeY) return false;
  
  const idx = gx * world.sizeY * world.sizeZ + gy * world.sizeZ + gz;
  return world.waterActive && world.waterActive[idx] === 1;
}

// Bilinear density interpolation at a specific grid height (y)
export function getDensity2DInterpolated(gx, y, gz) {
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);

  // If coordinates are out of grid bounds, treat it as air (-1.0)
  if (x0 < 0 || x0 >= world.sizeX - 1 || z0 < 0 || z0 >= world.sizeZ - 1) {
    return -1.0;
  }

  const x1 = x0 + 1;
  const z1 = z0 + 1;

  const tx = gx - x0;
  const tz = gz - z0;

  const d00 = world.density[x0 * world.sizeY * world.sizeZ + y * world.sizeZ + z0] || 0;
  const d10 = world.density[x1 * world.sizeY * world.sizeZ + y * world.sizeZ + z0] || 0;
  const d01 = world.density[x0 * world.sizeY * world.sizeZ + y * world.sizeZ + z1] || 0;
  const d11 = world.density[x1 * world.sizeY * world.sizeZ + y * world.sizeZ + z1] || 0;

  // Bilinear interpolation
  const d0 = d00 + tx * (d10 - d00);
  const d1 = d01 + tx * (d11 - d01);
  return d0 + tz * (d1 - d0);
}

// Height query helper for collision detection (smoothly interpolated, tunnels supported!)
export function getSurfaceHeightNear(px, py, pz) {
  const spacing = world.spacing;
  const gx = px / spacing;
  const gy = py / spacing;
  const gz = pz / spacing;

  // Start sweep slightly above player (e.g. gy + 1.5) to capture ground even if player sinks slightly
  const startY = Math.max(0, Math.min(Math.floor(gy + 1.5), world.sizeY - 1));

  // Scan downwards from the player's current y height to find solid terrain floor
  for (let y = startY; y >= 0; y--) {
    const dens = getDensity2DInterpolated(gx, y, gz);
    if (dens >= 0) {
      // Solid found! Interpolate height between y and y+1
      const densAbove = getDensity2DInterpolated(gx, y + 1, gz);
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

// Get smooth interpolated density at any world coordinate (Trilinear)
export function getDensityInterpolated(px, py, pz) {
  const spacing = world.spacing;
  const gx = px / spacing;
  const gy = py / spacing;
  const gz = pz / spacing;

  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const z0 = Math.floor(gz);

  // If coordinates are out of grid bounds, treat it as air (-1.0)
  if (x0 < 0 || x0 >= world.sizeX - 1 || 
      y0 < 0 || y0 >= world.sizeY - 1 || 
      z0 < 0 || z0 >= world.sizeZ - 1) {
    return -1.0;
  }

  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const z1 = z0 + 1;

  const tx = gx - x0;
  const ty = gy - y0;
  const tz = gz - z0;

  // Get densities at 8 corners using exact array indices
  const d000 = world.density[x0 * world.sizeY * world.sizeZ + y0 * world.sizeZ + z0] || 0;
  const d100 = world.density[x1 * world.sizeY * world.sizeZ + y0 * world.sizeZ + z0] || 0;
  const d010 = world.density[x0 * world.sizeY * world.sizeZ + y1 * world.sizeZ + z0] || 0;
  const d110 = world.density[x1 * world.sizeY * world.sizeZ + y1 * world.sizeZ + z0] || 0;
  const d001 = world.density[x0 * world.sizeY * world.sizeZ + y0 * world.sizeZ + z1] || 0;
  const d101 = world.density[x1 * world.sizeY * world.sizeZ + y0 * world.sizeZ + z1] || 0;
  const d011 = world.density[x0 * world.sizeY * world.sizeZ + y1 * world.sizeZ + z1] || 0;
  const d111 = world.density[x1 * world.sizeY * world.sizeZ + y1 * world.sizeZ + z1] || 0;

  // Trilinear interpolation
  const d00 = d000 + tx * (d100 - d000);
  const d10 = d010 + tx * (d110 - d010);
  const d01 = d001 + tx * (d101 - d001);
  const d11 = d011 + tx * (d111 - d011);

  const d0 = d00 + ty * (d10 - d00);
  const d1 = d01 + ty * (d11 - d01);

  return d0 + tz * (d1 - d0);
}

// Density check helper to detect wall collisions (using smooth trilinear density)
export function checkCollision(px, py, pz) {
  return getDensityInterpolated(px, py, pz) > 0.15; // Return true if solid
}

// Helper to create a curved low-poly palm tree mesh
function createPalmTree() {
  const palmGroup = new THREE.Group();
  
  // 1. Curved Trunk (Hierarchical nesting of segments to prevent gaps and create a smooth bezier-like tilt)
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x735135, roughness: 0.85, flatShading: true }); // Warm bark brown
  const segments = 9;
  const segmentHeight = 0.75;
  
  // Curvature: bend the tree slightly in a random horizontal direction
  const tiltAmount = 0.22 + Math.random() * 0.12; // bend in radians
  const tiltDir = Math.random() * Math.PI * 2;
  
  let parentNode = palmGroup;
  
  for (let i = 0; i < segments; i++) {
    const bottomRad = 0.28 - i * 0.015;
    const topRad = 0.26 - i * 0.015;
    const geom = new THREE.CylinderGeometry(topRad, bottomRad, segmentHeight, 5); // Pentagonal low-poly cylinder
    geom.translate(0, segmentHeight / 2, 0); // Pivot at the base
    
    const mesh = new THREE.Mesh(geom, trunkMaterial);
    
    if (i === 0) {
      mesh.position.set(0, 0, 0);
      // Give the base segment a slight tilt
      mesh.rotation.z = tiltAmount / segments;
      mesh.rotation.y = tiltDir;
    } else {
      mesh.position.set(0, segmentHeight * 0.88, 0); // Nest with overlap
      mesh.rotation.z = tiltAmount / segments; // Stack the curve
      mesh.rotation.y = 0.12; // Spiral twist
    }
    
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    parentNode.add(mesh);
    parentNode = mesh; // Nesting
  }
  
  // 2. Palm Leaves/Fronds (Drooping branches with side leaflets)
  const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x2d8a4e, roughness: 0.75, flatShading: true }); // Tropical green
  const leafCount = 8;
  
  for (let i = 0; i < leafCount; i++) {
    const leafGroup = new THREE.Group();
    // Position at the very top of the last trunk segment
    leafGroup.position.set(0, segmentHeight * 0.95, 0);
    // Radial distribution
    leafGroup.rotation.y = (i * Math.PI * 2) / leafCount;
    
    // Each frond is a drooping chain of 4 box segments
    let leafSegParent = leafGroup;
    const leafSegCount = 4;
    const leafSegLength = 0.65;
    
    for (let j = 0; j < leafSegCount; j++) {
      const w = 0.38 - j * 0.07; // Main leaf stem width
      const h = 0.02;
      const d = leafSegLength;
      
      const stemGeom = new THREE.BoxGeometry(w, h, d);
      stemGeom.translate(0, 0, d / 2); // Pivot at segment base (along Z)
      
      const stemMesh = new THREE.Mesh(stemGeom, leavesMaterial);
      if (j === 0) {
        stemMesh.position.set(0, 0, 0);
        stemMesh.rotation.x = -0.15; // Point slightly up first, then droop
      } else {
        stemMesh.position.set(0, 0, d * 0.95); // Chain together
        stemMesh.rotation.x = 0.25 + j * 0.05; // Droop more and more
      }
      
      stemMesh.castShadow = true;
      stemMesh.receiveShadow = true;
      
      // Add side leaflets (feathers) to this segment to make it look lush
      const leafletCount = 3;
      for (let k = 0; k < leafletCount; k++) {
        const t = (k + 0.5) / leafletCount; // spacing along the stem segment
        const leafletW = 0.12 - j * 0.02;
        const leafletL = 0.5 - j * 0.08 - t * 0.1;
        
        const leafletGeom = new THREE.BoxGeometry(leafletW, 0.01, leafletL);
        leafletGeom.translate(0, 0, leafletL / 2);
        
        // Left leaflet
        const leftLeaflet = new THREE.Mesh(leafletGeom, leavesMaterial);
        leftLeaflet.position.set(-w / 2, 0, t * d);
        leftLeaflet.rotation.y = -Math.PI / 3; // angle outwards
        leftLeaflet.rotation.x = 0.15; // droop
        leftLeaflet.castShadow = true;
        stemMesh.add(leftLeaflet);
        
        // Right leaflet
        const rightLeaflet = new THREE.Mesh(leafletGeom, leavesMaterial);
        rightLeaflet.position.set(w / 2, 0, t * d);
        rightLeaflet.rotation.y = Math.PI / 3; // angle outwards
        rightLeaflet.rotation.x = 0.15; // droop
        rightLeaflet.castShadow = true;
        stemMesh.add(rightLeaflet);
      }
      
      leafSegParent.add(stemMesh);
      leafSegParent = stemMesh;
    }
    
    parentNode.add(leafGroup);
  }
  
  return palmGroup;
}

// Helper to create a detailed low-poly Pine Tree
function createPineTree() {
  const pineGroup = new THREE.Group();

  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x543d2b, roughness: 0.9, flatShading: true });
  // Natural mossy greens matching reference image
  const foliageMaterial1 = new THREE.MeshStandardMaterial({ 
    color: 0x47783a, 
    roughness: 0.85, 
    flatShading: true, 
    side: THREE.DoubleSide 
  });
  const foliageMaterial2 = new THREE.MeshStandardMaterial({ 
    color: 0x5a904d, 
    roughness: 0.85, 
    flatShading: true, 
    side: THREE.DoubleSide 
  });

  // 1. Detailed trunk
  const trunkHeight = 5.2;
  const trunkGeom = new THREE.CylinderGeometry(0.1, 0.25, trunkHeight, 5);
  // Shift pivot to base of trunk
  trunkGeom.translate(0, trunkHeight / 2, 0);
  const trunk = new THREE.Mesh(trunkGeom, trunkMaterial);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  pineGroup.add(trunk);

  // 2. Small bare branch stubs at the trunk base (Y between 0.6 and 1.6)
  const stubCount = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < stubCount; i++) {
    const stubLength = 0.25 + Math.random() * 0.25;
    const stubGeom = new THREE.CylinderGeometry(0.02, 0.04, stubLength, 4);
    stubGeom.translate(0, stubLength / 2, 0);
    const stub = new THREE.Mesh(stubGeom, trunkMaterial);
    
    // Position along the trunk height
    const sy = 0.6 + (i / stubCount) * 0.8 + Math.random() * 0.15;
    stub.position.set(0, sy, 0);
    
    // Angle sticking outward and slightly downward
    const sAngle = Math.random() * Math.PI * 2;
    stub.rotation.y = sAngle;
    stub.rotation.z = 1.1 + Math.random() * 0.3; // point downward/outward
    stub.castShadow = true;
    pineGroup.add(stub);
  }

  // 3. Foliage: 11 layers of dense evergreen branches matching the reference
  const numLayers = 11;
  for (let i = 0; i < numLayers; i++) {
    const t = i / (numLayers - 1);
    // Non-linear power distribution clusters layers closer towards the top crown
    const yPos = 1.0 + Math.pow(t, 0.7) * 4.15; // distribute from Y=1.0 to 5.15
    
    // Calculate tapered size of branch at this layer
    const L = 1.95 * (1.0 - Math.pow(t, 0.85) * 0.78);        // Length of the branch outward
    const W = 0.75 * (1.0 - Math.pow(t, 0.85) * 0.68);        // Width of the branch base
    const H_inner = 0.22 * (1.0 - t * 0.7);                   // Height of the fold at the trunk
    const tipDroop = 0.65 * (1.0 - t * 0.78);                 // How much the tip droops below the base
    
    // Number of branches in this layer (more at bottom, fewer at top)
    const N = Math.round(10 - t * 5); 
    
    // Alternating stagger and some offset variation to break perfect radial alignment
    const stagger = (i % 2) * (Math.PI / N) + (i * 0.2);
    
    // Alternate color between layers to add visual depth
    const material = (i % 2 === 0) ? foliageMaterial1 : foliageMaterial2;
    
    // Dynamic trunk radius to position branches offset from trunk surface
    const trunkRadius = 0.25 - (yPos / trunkHeight) * 0.15;

    for (let k = 0; k < N; k++) {
      const angle = (k * Math.PI * 2) / N + stagger;
      
      const branchGeom = new THREE.BufferGeometry();
      
      // We model each branch as a 2-segment, 3-cross-section folded plate.
      // Cross-sections along local Z (outward from trunk):
      // 1. Inner (Z = baseZ)
      // 2. Middle (Z = midZ)
      // 3. Tip (Z = tipZ)
      const baseZ = -trunkRadius * 0.8;
      const midZ = baseZ + (L - baseZ) * 0.5;
      const tipZ = L;
      
      // Widths at each section
      const W_inner = W;
      const W_mid = W * 0.85;
      const W_tip = W * 0.40;
      
      // Vertical offsets (droop and fold crease)
      // Crease fold is highest in center and tapers down towards the outer edges
      const ySide_inner = 0;
      const yCenter_inner = H_inner;
      
      const ySide_mid = -tipDroop * 0.35;
      const yCenter_mid = ySide_mid + H_inner * 0.6;
      
      const ySide_tip = -tipDroop;
      const yCenter_tip = ySide_tip + H_inner * 0.2;
      
      // 8 triangles forming a curved, folded, shingled branch
      const vertices = new Float32Array([
        // Left side, Inner to Mid: InnerCenter, InnerLeft, MidLeft
        0, yCenter_inner, baseZ,
        -W_inner / 2, ySide_inner, baseZ,
        -W_mid / 2, ySide_mid, midZ,
        
        // Left side, Inner to Mid: InnerCenter, MidLeft, MidCenter
        0, yCenter_inner, baseZ,
        -W_mid / 2, ySide_mid, midZ,
        0, yCenter_mid, midZ,
        
        // Right side, Inner to Mid: InnerCenter, MidRight, InnerRight
        0, yCenter_inner, baseZ,
        W_mid / 2, ySide_mid, midZ,
        W_inner / 2, ySide_inner, baseZ,
        
        // Right side, Inner to Mid: InnerCenter, MidCenter, MidRight
        0, yCenter_inner, baseZ,
        0, yCenter_mid, midZ,
        W_mid / 2, ySide_mid, midZ,
        
        // Left side, Mid to Tip: MidCenter, MidLeft, TipLeft
        0, yCenter_mid, midZ,
        -W_mid / 2, ySide_mid, midZ,
        -W_tip / 2, ySide_tip, tipZ,
        
        // Left side, Mid to Tip: MidCenter, TipLeft, TipCenter
        0, yCenter_mid, midZ,
        -W_tip / 2, ySide_tip, tipZ,
        0, yCenter_tip, tipZ,
        
        // Right side, Mid to Tip: MidCenter, TipRight, MidRight
        0, yCenter_mid, midZ,
        W_tip / 2, ySide_tip, tipZ,
        W_mid / 2, ySide_mid, midZ,
        
        // Right side, Mid to Tip: MidCenter, TipCenter, TipRight
        0, yCenter_mid, midZ,
        0, yCenter_tip, tipZ,
        W_tip / 2, ySide_tip, tipZ
      ]);
      
      branchGeom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      branchGeom.computeVertexNormals();
      
      const branchMesh = new THREE.Mesh(branchGeom, material);
      branchMesh.position.set(0, yPos, 0);
      
      // Add slight random variation to each branch to make them look organic
      branchMesh.rotation.y = angle + (Math.random() - 0.5) * 0.12; 
      branchMesh.rotation.x = (Math.random() - 0.5) * 0.08; 
      branchMesh.rotation.z = (Math.random() - 0.5) * 0.08; 
      
      branchMesh.castShadow = true;
      branchMesh.receiveShadow = true;
      
      pineGroup.add(branchMesh);
    }
  }

  // 4. Add a vertical crown cone at the top of the trunk to cap the tree's tip cleanly
  const crownConeGeom = new THREE.ConeGeometry(0.24, 0.7, 5);
  crownConeGeom.translate(0, 0.35, 0);
  const crownCone = new THREE.Mesh(crownConeGeom, foliageMaterial1);
  crownCone.position.set(0, 5.15, 0); // Cap it right at the top
  crownCone.castShadow = true;
  crownCone.receiveShadow = true;
  pineGroup.add(crownCone);

  // Random rotation on the entire tree to make each instance unique
  pineGroup.rotation.y = Math.random() * Math.PI * 2;

  return pineGroup;
}

// Helper to create a lit beach torch on a post
function createTorch() {
  const torchGroup = new THREE.Group();
  const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9, flatShading: true });
  const metalMaterial = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.8 });
  const fireMaterial = new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.1, emissive: 0xff7700 });
  
  // The pole
  const poleGeom = new THREE.CylinderGeometry(0.04, 0.04, 1.4, 5);
  const pole = new THREE.Mesh(poleGeom, woodMaterial);
  pole.position.y = 0.7;
  pole.castShadow = true;
  pole.receiveShadow = true;
  torchGroup.add(pole);
  
  // The metal cup/holder
  const cupGeom = new THREE.CylinderGeometry(0.08, 0.06, 0.15, 5);
  const cup = new THREE.Mesh(cupGeom, metalMaterial);
  cup.position.y = 1.45;
  cup.castShadow = true;
  torchGroup.add(cup);
  
  // The fire flame (yellow low-poly octahedron)
  const flameGeom = new THREE.OctahedronGeometry(0.12);
  const flame = new THREE.Mesh(flameGeom, fireMaterial);
  flame.position.y = 1.6;
  torchGroup.add(flame);
  
  // Add a warm point light
  const light = new THREE.PointLight(0xff7722, 2.0, 10);
  light.position.set(0, 1.8, 0);
  light.castShadow = true;
  light.shadow.bias = -0.002;
  torchGroup.add(light);
  
  return torchGroup;
}

// Helper to spawn 3D drifting clouds in the sky
function spawnClouds() {
  const cloudMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0.0,
    flatShading: true
  });
  
  for (let i = 0; i < 22; i++) {
    const cloudGroup = new THREE.Group();
    
    // Choose base radius for this cloud cluster
    const baseR = Math.random() * 3 + 5; // 5 to 8 meters
    
    // Define relative offsets and scale multipliers for the spheres in a cluster
    // This creates a natural elongated puffy cloud shape tapering at both ends
    const spheres = [
      { x: 0, y: 0, z: 0, r: 1.0 },                           // Center puff
      { x: -baseR * 0.7, y: -baseR * 0.1, z: 0, r: 0.75 },     // Left puff
      { x: baseR * 0.7, y: -baseR * 0.1, z: 0, r: 0.75 },      // Right puff
      { x: -baseR * 1.3, y: -baseR * 0.25, z: 0, r: 0.5 },     // Outer left puff
      { x: baseR * 1.3, y: -baseR * 0.25, z: 0, r: 0.5 },      // Outer right puff
      { x: -baseR * 0.35, y: 0, z: baseR * 0.35, r: 0.7 },     // Front-left puff
      { x: baseR * 0.35, y: 0, z: -baseR * 0.35, r: 0.7 }      // Back-right puff
    ];
    
    spheres.forEach(s => {
      const r = baseR * s.r;
      const geom = new THREE.IcosahedronGeometry(r, 1);
      
      // Apply vertex colors for vertical gradient (pink to white)
      const position = geom.attributes.position;
      const count = position.count;
      const colors = [];
      const colorBottom = new THREE.Color(0xfc8c82); // Warm sunset pink
      const colorTop = new THREE.Color(0xffffff);    // Pure white
      
      for (let k = 0; k < count; k++) {
        const y = position.getY(k);
        // Normalize Y from [-r, r] to [0, 1]
        const factor = (y + r) / (2 * r);
        const c = new THREE.Color().copy(colorBottom).lerp(colorTop, factor);
        colors.push(c.r, c.g, c.b);
      }
      geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      
      const mesh = new THREE.Mesh(geom, cloudMaterial);
      mesh.position.set(s.x, s.y, s.z);
      cloudGroup.add(mesh);
    });
    
    // Position cloud high in the sky
    const cx = Math.random() * 400 - 200 + 80;
    const cy = Math.random() * 20 + 55; // 55 to 75 meters high
    const cz = Math.random() * 400 - 200 + 80;
    
    cloudGroup.position.set(cx, cy, cz);
    game.scene.add(cloudGroup);
    world.clouds.push(cloudGroup);
  }
}

// Spawns static low-poly island assets
function spawnScenery() {
  const spacing = world.spacing;
  const cx = world.sizeX / 2;
  const cz = world.sizeZ / 2;

  // 1. Crystal Water Plane with Depth Color Gradients
  updateWaterGrid();
  const waterGeometry = buildWaterGeometry();
  
  const waterMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true, // Enable vertex colors!
    roughness: 0.25,
    metalness: 0.05,
    transparent: true,
    opacity: 0.90,
    flatShading: true,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(0x09202e) // Subtle glow so the water looks luminous and alive
  });
  world.waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
  world.waterMesh.position.set(0, 4.0, 0); // Directly at coordinate origin, Y=4.0 height (no rotation needed)
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

  // Spawn trees randomly on the island surface (mix of Palm and Pine trees)
  for (let i = 0; i < 45; i++) {
    const rx = Math.random() * (world.sizeX - 10) + 5;
    const rz = Math.random() * (world.sizeZ - 10) + 5;
    
    // Find terrain height
    const wx = rx * spacing;
    const wz = rz * spacing;
    const wy = getSurfaceHeightNear(wx, 15, wz);

    // Only spawn trees on land above water
    if (wy > 4.1) {
      let treeGroup;
      const isPalm = wy <= 6.2;
      
      if (isPalm) {
        treeGroup = createPalmTree();
        treeGroup.position.set(wx, wy - 0.1, wz);
        treeGroup.scale.setScalar(0.75 + Math.random() * 0.3);
      } else {
        treeGroup = createPineTree();
        treeGroup.position.set(wx, wy, wz);
        treeGroup.scale.setScalar(0.8 + Math.random() * 0.4);
      }

      // Initialize health and falling state for woodcutting in userData
      treeGroup.userData = {
        health: 3,
        maxHealth: 3,
        falling: false,
        fallTimer: 0,
        type: isPalm ? 'palm' : 'pine'
      };
      
      game.scene.add(treeGroup);
      world.sceneryMeshes.push({ mesh: treeGroup, type: 'tree' });
      world.trees.push(treeGroup);
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
      world.sceneryMeshes.push({ mesh: rock, type: 'rock' });
    }
  }

  // 3b. Marine Rocks (rocks emerging from the sea)
  const marineRockMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x5a6363, // Darker wet rock
    roughness: 0.6,  // Slightly glossy/wet appearance
    flatShading: true 
  });
  
  for (let i = 0; i < 15; i++) {
    const rx = Math.random() * (world.sizeX - 10) + 5;
    const rz = Math.random() * (world.sizeZ - 10) + 5;
    
    const wx = rx * spacing;
    const wz = rz * spacing;
    const wy = getSurfaceHeightNear(wx, 15, wz);

    // Only spawn in shallow water (between Y=1.2 and 3.9)
    if (wy >= 1.2 && wy < 3.9) {
      // Large rocks (radius 1.5 to 3.0) to ensure they emerge from the 4.0 water level
      const rockRadius = 1.5 + Math.random() * 1.5;
      const rockGeom = new THREE.DodecahedronGeometry(rockRadius, 0);
      const rock = new THREE.Mesh(rockGeom, marineRockMaterial);
      
      rock.position.set(wx, wy - 0.5, wz);
      rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      rock.castShadow = true;
      rock.receiveShadow = true;
      game.scene.add(rock);
      world.sceneryMeshes.push({ mesh: rock, type: 'rock' });
    }
  }

  // 3c. 3D Low-Poly Starfish on the shoreline
  const starfishMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xff5722, // Luminous orange
    roughness: 0.8, 
    flatShading: true 
  });

  // Create a 2D 5-pointed star shape
  const starShape = new THREE.Shape();
  const outerR = 0.22;
  const innerR = 0.09;
  for (let idx = 0; idx < 10; idx++) {
    const angle = (idx * Math.PI) / 5;
    const r = (idx % 2 === 0) ? outerR : innerR;
    const sx = Math.cos(angle) * r;
    const sz = Math.sin(angle) * r;
    if (idx === 0) {
      starShape.moveTo(sx, sz);
    } else {
      starShape.lineTo(sx, sz);
    }
  }
  starShape.closePath();

  // Extrude 2D shape into 3D
  const starfishGeom = new THREE.ExtrudeGeometry(starShape, {
    depth: 0.04,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.01,
    bevelSegments: 1
  });
  starfishGeom.center();
  // Rotate so it lies flat on the horizontal XZ plane
  starfishGeom.rotateX(-Math.PI / 2);

  for (let i = 0; i < 12; i++) {
    const rx = Math.random() * (world.sizeX - 10) + 5;
    const rz = Math.random() * (world.sizeZ - 10) + 5;
    
    const wx = rx * spacing;
    const wz = rz * spacing;
    const wy = getSurfaceHeightNear(wx, 15, wz);

    // Spawn on the sandy shoreline (Y between 4.05 and 4.8)
    if (wy >= 4.05 && wy <= 4.8) {
      const starfish = new THREE.Mesh(starfishGeom, starfishMaterial);
      starfish.position.set(wx, wy + 0.01, wz);
      starfish.rotation.y = Math.random() * Math.PI * 2;
      starfish.castShadow = true;
      starfish.receiveShadow = true;
      game.scene.add(starfish);
      world.sceneryMeshes.push({ mesh: starfish, type: 'starfish' });
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

  // 5. Wooden Pier / Dock (near player spawn)
  const dockGroup = new THREE.Group();
  const plankMaterial = new THREE.MeshStandardMaterial({ color: 0x6e4e37, roughness: 0.95, flatShading: true });
  const pierX = 17.0 * spacing; // aligned with beach
  
  for (let z = 18.0; z <= 28.0; z += 0.8) {
    const plankGeom = new THREE.BoxGeometry(1.4, 0.06, 0.6);
    const plank = new THREE.Mesh(plankGeom, plankMaterial);
    plank.position.set(pierX, 4.12, z * spacing);
    plank.castShadow = true;
    plank.receiveShadow = true;
    dockGroup.add(plank);
  }
  
  const postGeom = new THREE.CylinderGeometry(0.08, 0.08, 3.5, 5);
  const postLocations = [
    { x: pierX - 0.6, z: 18.5 * spacing },
    { x: pierX + 0.6, z: 18.5 * spacing },
    { x: pierX - 0.6, z: 27.5 * spacing },
    { x: pierX + 0.6, z: 27.5 * spacing }
  ];
  
  postLocations.forEach(pos => {
    const post = new THREE.Mesh(postGeom, plankMaterial);
    post.position.set(pos.x, 2.5, pos.z);
    post.castShadow = true;
    post.receiveShadow = true;
    dockGroup.add(post);
  });
  
  game.scene.add(dockGroup);
  
  // 6. Floating Log Raft
  const raftGroup = new THREE.Group();
  const raftMaterial = new THREE.MeshStandardMaterial({ color: 0x553d2d, roughness: 0.9, flatShading: true });
  for (let i = 0; i < 4; i++) {
    const logGeom = new THREE.CylinderGeometry(0.12, 0.12, 1.8, 5);
    logGeom.rotateX(Math.PI / 2);
    const log = new THREE.Mesh(logGeom, raftMaterial);
    log.position.set(pierX - 2.0 + i * 0.28, 4.05, 26.5 * spacing);
    log.castShadow = true;
    log.receiveShadow = true;
    raftGroup.add(log);
  }
  game.scene.add(raftGroup);

  // 7. Lit Beach Torches
  const torchPositions = [
    { x: 22.0 * spacing, z: 23.0 * spacing },
    { x: pierX + 1.2, z: 19.0 * spacing },
    { x: pierX + 1.2, z: 27.5 * spacing },
    { x: 12.0 * spacing, z: 21.0 * spacing }
  ];
  
  torchPositions.forEach(pos => {
    const torch = createTorch();
    const ty = getSurfaceHeightNear(pos.x, 15.0, pos.z);
    torch.position.set(pos.x, ty, pos.z);
    game.scene.add(torch);
  });

  // 8. Distant Island with a Lighthouse
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

  // 9. Spawn Sky Clouds
  spawnClouds();
}

// Spawns a 3D wooden bulletin feedback board on the island
function spawnFeedbackBoard() {
  const wx = 22.0;
  const wz = 22.0;
  const wy = getSurfaceHeightNear(wx, 15, wz);

  const boardGroup = new THREE.Group();
  boardGroup.name = "feedback_board";

  // Materials
  const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x473322, roughness: 0.9, flatShading: true }); // Darker rustic wood
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x302115, roughness: 0.9, flatShading: true }); // Very dark frame wood
  const corkMaterial = new THREE.MeshStandardMaterial({ color: 0xb58a63, roughness: 0.9, flatShading: true }); // Cork board texture color
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x3d3025, roughness: 0.9, flatShading: true }); // Dark slate roof
  
  const paperColors = [0xfbf9f1, 0xf7f5eb, 0xfffde8, 0xfff0f5]; // Warm tones for papers
  const pinColors = [0xff4444, 0x4444ff, 0x44ff44, 0xffcc00]; // Accent pin colors

  // Left post
  const leftPostGeom = new THREE.CylinderGeometry(0.08, 0.08, 2.8, 6);
  const leftPost = new THREE.Mesh(leftPostGeom, woodMaterial);
  leftPost.position.set(-1.1, 1.4, 0);
  leftPost.castShadow = true;
  leftPost.receiveShadow = true;
  boardGroup.add(leftPost);

  // Right post
  const rightPostGeom = new THREE.CylinderGeometry(0.08, 0.08, 2.8, 6);
  const rightPost = new THREE.Mesh(rightPostGeom, woodMaterial);
  rightPost.position.set(1.1, 1.4, 0);
  rightPost.castShadow = true;
  rightPost.receiveShadow = true;
  boardGroup.add(rightPost);

  // Cork Backboard
  const backboardGeom = new THREE.BoxGeometry(2.2, 1.5, 0.1);
  const backboard = new THREE.Mesh(backboardGeom, corkMaterial);
  backboard.position.set(0, 1.9, 0);
  backboard.castShadow = true;
  backboard.receiveShadow = true;
  boardGroup.add(backboard);

  // Frames (top, bottom, left, right)
  const topFrameGeom = new THREE.BoxGeometry(2.36, 0.1, 0.14);
  const topFrame = new THREE.Mesh(topFrameGeom, frameMaterial);
  topFrame.position.set(0, 2.65, 0);
  topFrame.castShadow = true;
  boardGroup.add(topFrame);

  const bottomFrameGeom = new THREE.BoxGeometry(2.36, 0.1, 0.14);
  const bottomFrame = new THREE.Mesh(bottomFrameGeom, frameMaterial);
  bottomFrame.position.set(0, 1.15, 0);
  bottomFrame.castShadow = true;
  boardGroup.add(bottomFrame);

  const leftFrameGeom = new THREE.BoxGeometry(0.1, 1.6, 0.14);
  const leftFrame = new THREE.Mesh(leftFrameGeom, frameMaterial);
  leftFrame.position.set(-1.1, 1.9, 0);
  leftFrame.castShadow = true;
  boardGroup.add(leftFrame);

  const rightFrameGeom = new THREE.BoxGeometry(0.1, 1.6, 0.14);
  const rightFrame = new THREE.Mesh(rightFrameGeom, frameMaterial);
  rightFrame.position.set(1.1, 1.9, 0);
  rightFrame.castShadow = true;
  boardGroup.add(rightFrame);

  // Roof (Gabled structure on top)
  const roofLeftGeom = new THREE.BoxGeometry(1.3, 0.06, 0.4);
  const roofLeft = new THREE.Mesh(roofLeftGeom, roofMaterial);
  roofLeft.position.set(-0.55, 2.8, 0);
  roofLeft.rotation.z = 0.25;
  roofLeft.castShadow = true;
  boardGroup.add(roofLeft);

  const roofRightGeom = new THREE.BoxGeometry(1.3, 0.06, 0.4);
  const roofRight = new THREE.Mesh(roofRightGeom, roofMaterial);
  roofRight.position.set(0.55, 2.8, 0);
  roofRight.rotation.z = -0.25;
  roofRight.castShadow = true;
  boardGroup.add(roofRight);

  // Multiple note sheets pinned to the board
  const notesData = [
    { w: 0.6, h: 0.7, x: -0.6, y: 2.15, rot: 0.08, col: paperColors[0] },
    { w: 0.7, h: 0.65, x: 0.1, y: 1.65, rot: -0.06, col: paperColors[1] },
    { w: 0.65, h: 0.5, x: 0.6, y: 2.1, rot: 0.12, col: paperColors[2] },
    { w: 0.55, h: 0.6, x: -0.45, y: 1.5, rot: -0.03, col: paperColors[3] }
  ];

  notesData.forEach((nd, idx) => {
    const noteGeom = new THREE.BoxGeometry(nd.w, nd.h, 0.02);
    const noteMat = new THREE.MeshStandardMaterial({ color: nd.col, roughness: 0.8, flatShading: true });
    const note = new THREE.Mesh(noteGeom, noteMat);
    note.position.set(nd.x, nd.y, 0.06);
    note.rotation.z = nd.rot;
    note.castShadow = true;
    note.receiveShadow = true;
    boardGroup.add(note);

    // Pin/Tack
    const pinGeom = new THREE.CylinderGeometry(0.018, 0.01, 0.05, 5);
    pinGeom.rotateX(Math.PI / 2);
    const pinMat = new THREE.MeshStandardMaterial({ color: pinColors[idx % pinColors.length], roughness: 0.3, metalness: 0.5 });
    const pin = new THREE.Mesh(pinGeom, pinMat);
    
    // Position pin slightly above the top edge of each note
    const pinYOffset = nd.h / 2 - 0.03;
    const pinX = nd.x - Math.sin(nd.rot) * pinYOffset;
    const pinY = nd.y + Math.cos(nd.rot) * pinYOffset;
    pin.position.set(pinX, pinY, 0.08);
    pin.castShadow = true;
    boardGroup.add(pin);
  });

  boardGroup.position.set(wx, wy, wz);
  boardGroup.rotation.y = Math.PI / 4; // Face the starting spawn point (25, 25)

  game.scene.add(boardGroup);
  world.feedbackBoard = boardGroup;
}

// Initialize World
export function initWorld() {
  generateDensityGrid();
  buildMarchingCubesMesh();
  spawnScenery();
  spawnFeedbackBoard();
}

// Update World Animation (e.g. lighthouse rotation, dynamic gravity snap for trees/rocks)
export function updateWorld(delta) {
  // Rotate the lighthouse beam around Y axis
  if (world.lighthouseBeam) {
    world.lighthouseBeam.rotation.y += 0.8 * delta;
  }

  // Keep trees, rocks, and starfish snapped to the deformed terrain
  world.sceneryMeshes.forEach(item => {
    const pos = item.mesh.position;
    const groundY = getSurfaceHeightNear(pos.x, 15, pos.z);
    if (item.type === 'tree') {
      if (!item.mesh.userData || !item.mesh.userData.falling) {
        item.mesh.position.y = groundY;
      }
    } else if (item.type === 'rock') {
      item.mesh.position.y = groundY - 0.5;
    } else if (item.type === 'starfish') {
      item.mesh.position.y = groundY + 0.01;
    }
  });

  // Keep active ore deposits snapped to deformed terrain
  world.oreDeposits.forEach(oreGroup => {
    const pos = oreGroup.position;
    const groundY = getSurfaceHeightNear(pos.x, 15, pos.z);
    oreGroup.position.y = groundY - 0.2;
  });

  // Keep feedback board snapped to deformed terrain
  if (world.feedbackBoard) {
    const pos = world.feedbackBoard.position;
    const groundY = getSurfaceHeightNear(pos.x, 15, pos.z);
    world.feedbackBoard.position.y = groundY;
  }

  // Drift clouds slowly in the sky
  if (world.clouds) {
    world.clouds.forEach(cloud => {
      cloud.position.x += 1.0 * delta;
      if (cloud.position.x > 250) {
        cloud.position.x = -150;
      }
    });
  }
}
