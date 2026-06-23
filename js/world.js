import * as THREE from 'three';
import { edgeTable, triTable } from './mctable.js';
import { game } from './game.js';
import { spawnDebris } from './interact.js';

// World Configuration
export const world = {
  sizeX: 120,
  sizeY: 16,
  sizeZ: 120,
  spacing: 1.6,
  density: null, // Flat Float32Array
  terrainMesh: null,
  waterMesh: null,
  lakeMesh: null, // 3D Mountain Lake Mesh
  waterActive: null, // 3D Uint8Array for connected water cells
  waterHeights: null, // 2D Float32Array for dynamic height filling
  oreDeposits: [], // Array of meshes representing ore nodes
  sceneryMeshes: [], // Trees, rocks, etc.
  trees: [], // Array of active tree groups for Axe chopping
  lighthouseBeam: null, // Rotating lighthouse beam
  feedbackBoard: null, // Feedback Board Mesh
  clouds: [], // Array of cloud meshes
  campfires: [], // Array of placed campfire groups
  canes: [], // Array of active cane plant groups
  seabedMesh: null // 3D Seabed Mesh
};

// Water grid limits and cell counts
export const WATER_START_X = -20.8;
export const WATER_START_Z = -20.8;
export const WATER_CELLS_X = 146;
export const WATER_CELLS_Z = 146;

export function isWaterActiveAt(vx, vz) {
  const spacing = world.spacing;
  const gx = Math.floor(vx / spacing);
  const gz = Math.floor(vz / spacing);
  if (gx < 0 || gx >= world.sizeX || gz < 0 || gz >= world.sizeZ) {
    return true; // Open ocean is always active
  }
  const idx = gx * world.sizeY * world.sizeZ + 2 * world.sizeZ + gz;
  return world.waterActive && world.waterActive[idx] === 1;
}

export function isCellActive(cx, cz) {
  const spacing = world.spacing;
  if (cx < 0 || cx >= WATER_CELLS_X || cz < 0 || cz >= WATER_CELLS_Z) {
    return true;
  }
  const vx = WATER_START_X + (cx + 0.5) * spacing;
  const vz = WATER_START_Z + (cz + 0.5) * spacing;
  return isWaterActiveAt(vx, vz);
}

export function isVertexActive(gx, gz) {
  for (let dx = -1; dx <= 0; dx++) {
    for (let dz = -1; dz <= 0; dz++) {
      if (isCellActive(gx + dx, gz + dz)) {
        return true;
      }
    }
  }
  return false;
}

export function getWaterHeightAt(vx, vz) {
  // Check if near mountain lake: center at (19.2, 19.2), radius = 24.0
  const lakeCenterX = 19.2;
  const lakeCenterZ = 19.2;
  const lakeRadius = 24.0;
  const dx = vx - lakeCenterX;
  const dz = vz - lakeCenterZ;
  if (dx*dx + dz*dz < lakeRadius * lakeRadius) {
    return 15.68;
  }

  if (!world.waterHeights) return 4.0;
  const spacing = world.spacing;
  const gx = Math.round((vx - WATER_START_X) / spacing);
  const gz = Math.round((vz - WATER_START_Z) / spacing);
  if (gx < 0 || gx > WATER_CELLS_X || gz < 0 || gz > WATER_CELLS_Z) {
    return 4.0;
  }
  const idx = gx * (WATER_CELLS_Z + 1) + gz;
  return world.waterHeights[idx] !== undefined ? world.waterHeights[idx] : 4.0;
}

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

const lerp = (a, b, t) => a + t * (b - a);

// Centralized helper to calculate procedural starting island voxel height
function calculateIslandHeightVoxel(x, z) {
  const cx = world.sizeX / 2;
  const cz = world.sizeZ / 2;

  // Distance from center of the island (radial falloff)
  const dx = x - cx;
  const dz = z - cz;
  const dist = Math.sqrt(dx*dx + dz*dz);
  const maxDist = world.sizeX * 0.48;
  const radialFactor = Math.max(0, 1.0 - dist / maxDist);
  
  // Calculate base land height using noise
  const noiseVal = fbmNoise2D(x * 0.1, z * 0.1);
  let islandHeight = (noiseVal * 8.0 + 2.0) * Math.pow(radialFactor, 1.2);

  // 1. CARVE THE BAY (opens to the east)
  // Scale offset and radius from the 40x40 equivalent: center is 60, offset is 54, radius is 48
  const bayX = cx + 54;
  const bayZ = cz;
  const bayRadius = 48;
  const bayDx = x - bayX;
  const bayDz = z - bayZ;
  const bayDist = Math.sqrt(bayDx*bayDx + bayDz*bayDz);

  if (bayDist < bayRadius) {
    const t = bayDist / bayRadius;
    const smoothT = Math.sin(t * Math.PI / 2);
    // Interpolate island height down to sea level/seabed (voxel height 1.2, which is 1.92 meters)
    const targetBayHeight = 1.2;
    islandHeight = lerp(targetBayHeight, islandHeight, smoothT);
  }

  // 2. ADD THE HILL WITH A LAKE (in the northwest quadrant)
  // Hill center is at (cx - 48, cz - 48) = (12, 12), radius is 42
  const hillX = cx - 48;
  const hillZ = cz - 48;
  const hillRadius = 42;
  const hillDx = x - hillX;
  const hillDz = z - hillZ;
  const hillDist = Math.sqrt(hillDx*hillDx + hillDz*hillDz);

  if (hillDist < hillRadius) {
    // Lake basin radius: 15 voxels (24m)
    const lakeRadius = 15;
    const t = hillDist / hillRadius;
    
    // Hill base elevation: +6.5 voxels at the summit, 0 at the foot
    const hillElevation = 6.5 * Math.cos(t * Math.PI / 2);

    if (hillDist < lakeRadius) {
      // Inside the lake basin: crater/depression down to 8.5 voxel height (13.6m)
      const lakeT = hillDist / lakeRadius;
      const hillHeightAtLakeEdge = islandHeight + 6.5 * Math.cos((lakeRadius / hillRadius) * Math.PI / 2);
      const lakeBottomHeight = 8.5;
      
      const lakeProfile = lerp(lakeBottomHeight, hillHeightAtLakeEdge, lakeT * lakeT);
      islandHeight = lakeProfile;
    } else {
      // Outside the lake basin, on the hill slope
      islandHeight += hillElevation;
    }
  }

  // Safety ceiling check: prevent terrain from reaching sizeY - 1
  return Math.min(world.sizeY - 2.5, islandHeight);
}

// Calculate original uncarved terrain height at coordinates (vx, vz)
export function getOriginalHeight(vx, vz) {
  const spacing = world.spacing;
  const gx = vx / spacing;
  const gz = vz / spacing;
  return calculateIslandHeightVoxel(gx, gz) * spacing;
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
      const islandHeight = calculateIslandHeightVoxel(x, z);

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
        if (distToTunnelAxis < tunnelRadius && z > (cz - 30) && z < (cz + 30)) {
          const carveAmount = (1.0 - distToTunnelAxis / tunnelRadius) * 2.5;
          dens -= carveAmount;
        }

        // Taper density smoothly to air at the grid borders to avoid 90-degree cliff drops under the water
        const borderDist = Math.min(x, Math.min(world.sizeX - 1 - x, Math.min(z, world.sizeZ - 1 - z)));
        if (borderDist < 5) {
          const factor = borderDist / 5.0; // 0.0 at border, 1.0 at 5 cells away
          dens = (dens + 2.0) * factor - 2.0; // Smoothly pull down to strictly negative air value (-2.0)
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

  const startX = WATER_START_X;
  const endX = WATER_START_X + WATER_CELLS_X * spacing;
  const startZ = WATER_START_Z;
  const endZ = WATER_START_Z + WATER_CELLS_Z * spacing;

  const cellCountX = WATER_CELLS_X;
  const cellCountZ = WATER_CELLS_Z;


  function addQuad(x1, z1, x2, z2, ix, iz, isOuter) {
    const verts = [
      { x: x1, z: z1, gx: ix, gz: iz },
      { x: x1, z: z2, gx: ix, gz: iz + 1 },
      { x: x2, z: z1, gx: ix + 1, gz: iz },
      { x: x2, z: z1, gx: ix + 1, gz: iz },
      { x: x1, z: z2, gx: ix, gz: iz + 1 },
      { x: x2, z: z2, gx: ix + 1, gz: iz + 1 }
    ];

    for (let i = 0; i < 6; i++) {
      const vx = verts[i].x;
      const vz = verts[i].z;
      const vgx = verts[i].gx;
      const vgz = verts[i].gz;
      
      // Push directly in world X-Z coordinates (Y is height, initially 0, modified by waves)
      positions.push(vx, 0, vz);

      // 1. Calculate procedural seabed noise color for the entire ocean (both inner and outer)
      const nv = fbmNoise2D(vx * 0.003, vz * 0.003); // Large-scale patterns
      const detailNoise = fbmNoise2D(vx * 0.02, vz * 0.02) * 0.2; // Small-scale coral noise
      const val = nv + detailNoise;
      
      // Define three curated tropical ocean colors:
      const colorSand = new THREE.Color(0x05edd0);   // Bright luminous beach sand under water
      const colorReef = new THREE.Color(0x0c545b);   // Darker teal/grey representing shallow coral reefs
      const colorAbyss = new THREE.Color(0x072d47);  // Deep ocean abyss blue
      
      const noiseColor = new THREE.Color();
      if (val < 0.55) {
        // Transition from shallow sand to reef
        const t = val / 0.55;
        noiseColor.copy(colorSand).lerp(colorReef, t);
      } else if (val < 0.95) {
        // Transition from reef to deep ocean abyss
        const t = (val - 0.55) / 0.40;
        noiseColor.copy(colorReef).lerp(colorAbyss, t);
      } else {
        // Deep ocean abyss
        noiseColor.copy(colorAbyss);
      }

      let depth = 4.0;
      if (!isOuter) {
        if (isVertexActive(vgx, vgz)) {
          const groundY = getSurfaceHeightNear(vx, 5.0, vz);
          depth = Math.max(0, 4.0 - groundY);
        } else {
          depth = 0;
        }
        
        // Inner ocean: smoothly blend from colorShallow (beach teal) near shores to noiseColor in deep water
        const t = Math.min(1.0, depth / 4.0); // 0.0 at shore, 1.0 in deep water
        tempColor.copy(colorShallow).lerp(noiseColor, t);
      } else {
        // Outer ocean: use pure procedural noise color directly
        tempColor.copy(noiseColor);
        depth = 4.0; // Outer ocean has standard depth for wave amplitude calculations
      }

      colors.push(tempColor.r, tempColor.g, tempColor.b);
      depths.push(depth);
    }
  }

  function addSegmentedSector(x1, z1, x2, z2, isOuter) {
    const stepX = isOuter ? 200.0 : 8.0;
    const stepZ = isOuter ? 200.0 : 8.0;
    for (let x = x1; x < x2; x += stepX) {
      const nextX = Math.min(x2, x + stepX);
      for (let z = z1; z < z2; z += stepZ) {
        const nextZ = Math.min(z2, z + stepZ);
        addQuad(x, z, nextX, nextZ, 0, 0, isOuter);
      }
    }
  }

  // 1. Outer Ocean (Segmented Sectors to match waves)
  // Left and Right sectors
  addSegmentedSector(-11000, startZ, startX, endZ, true);
  addSegmentedSector(endX, startZ, 11000, endZ, true);

  // Top sectors (split into Left, Middle, Right to align boundary vertices)
  addSegmentedSector(-11000, endZ, startX, 11000, true);
  addSegmentedSector(startX, endZ, endX, 11000, true);
  addSegmentedSector(endX, endZ, 11000, 11000, true);

  // Bottom sectors (split into Left, Middle, Right to align boundary vertices)
  addSegmentedSector(-11000, -11000, startX, startZ, true);
  addSegmentedSector(startX, -11000, endX, startZ, true);
  addSegmentedSector(endX, -11000, 11000, startZ, true);

  // 2. Inner Ocean cells
  for (let ix = 0; ix < cellCountX; ix++) {
    const x1 = startX + ix * spacing;
    const x2 = x1 + spacing;
    for (let iz = 0; iz < cellCountZ; iz++) {
      const z1 = startZ + iz * spacing;
      const z2 = z1 + spacing;
      
      // Render the cell if water is active at its center, or if any of its 8 neighbors is active
      let shouldRender = false;
      if (isCellActive(ix, iz)) {
        shouldRender = true;
      } else {
        // Check 8 neighbors
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            if (dx === 0 && dz === 0) continue;
            if (isCellActive(ix + dx, iz + dz)) {
              shouldRender = true;
              break;
            }
          }
          if (shouldRender) break;
        }
      }

      if (shouldRender) {
        addQuad(x1, z1, x2, z2, ix, iz, false);
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
  // Check if player is in the mountain lake
  const lakeCenterX = 19.2;
  const lakeCenterZ = 19.2;
  const lakeRadius = 24.0;
  const dx = px - lakeCenterX;
  const dz = pz - lakeCenterZ;
  if (dx*dx + dz*dz < lakeRadius * lakeRadius) {
    if (py < 15.68 && py > 13.0) {
      return true;
    }
  }

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
  // If coordinates are out of grid bounds, treat it as air (-1.0)
  if (gx < 0 || gx >= world.sizeX || gz < 0 || gz >= world.sizeZ) {
    return -1.0;
  }

  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);

  const x1 = Math.min(x0 + 1, world.sizeX - 1);
  const z1 = Math.min(z0 + 1, world.sizeZ - 1);

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
  // Check if near Lighthouse Island
  const ldx = px - 1500;
  const ldz = pz - (-2000);
  const ldist = Math.sqrt(ldx * ldx + ldz * ldz);
  if (ldist < 140) {
    let coneHeight = -5.0 + 40.0 * Math.max(0, 1.0 - ldist / 110.0);
    if (ldist < 30) {
      return 22.0; // Summit plateau
    }
    // Spiral path ramp winding around lighthouse cone
    const theta = Math.atan2(ldz, ldx) + Math.PI; // [0, 2*Math.PI]
    const r_path = 110.0 - 70.0 * (theta / (Math.PI * 2));
    const pathHeight = 4.2 + (22.0 - 4.2) * (theta / (Math.PI * 2));
    if (Math.abs(ldist - r_path) < 6.0) {
      return pathHeight;
    }
    return Math.max(0.1, coneHeight);
  }

  // Check if near Volcanic Island
  const vdx = px - (-1800);
  const vdz = pz - 1500;
  const vdist = Math.sqrt(vdx * vdx + vdz * vdz);
  if (vdist < 180) {
    if (vdist >= 60) {
      // Outer slope: Shore Y=4.2 to Rim Y=22
      const t = Math.max(0, Math.min(1, (160 - vdist) / 100));
      return 4.2 + (22.0 - 4.2) * t;
    } else if (vdist >= 40) {
      // Inner slope: Rim Y=22 to Crater Floor Y=6
      const t = Math.max(0, Math.min(1, (vdist - 40) / 20));
      return 6.0 + (22.0 - 6.0) * t;
    } else {
      // Crater caldera center (flat lava surface at Y=6.2)
      return 6.2;
    }
  }

  const sHeight = getSeabedHeight(px, pz);

  const spacing = world.spacing;
  const gx = px / spacing;
  const gy = py / spacing;
  const gz = pz / spacing;

  if (gx < 0 || gx >= world.sizeX || gz < 0 || gz >= world.sizeZ) {
    return sHeight; // Return procedural seabed height outside main island grid
  }

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
      return (y + t) * spacing; // Return actual terrain height if solid starting island terrain exists
    }
  }
  return sHeight; // Return seabed height if no solid starting island terrain is found under coordinates
}

// Get smooth interpolated density at any world coordinate (Trilinear)
export function getDensityInterpolated(px, py, pz) {
  const spacing = world.spacing;
  const gx = px / spacing;
  const gy = py / spacing;
  const gz = pz / spacing;

  // If coordinates are out of grid bounds, treat it as air (-1.0)
  if (gx < 0 || gx >= world.sizeX || 
      gy < 0 || gy >= world.sizeY || 
      gz < 0 || gz >= world.sizeZ) {
    return -1.0;
  }

  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const z0 = Math.floor(gz);

  const x1 = Math.min(x0 + 1, world.sizeX - 1);
  const y1 = Math.min(y0 + 1, world.sizeY - 1);
  const z1 = Math.min(z0 + 1, world.sizeZ - 1);

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

  // Initialize waterHeights Float32Array to default target heights
  const size = (WATER_CELLS_X + 1) * (WATER_CELLS_Z + 1);
  world.waterHeights = new Float32Array(size);
  for (let gx = 0; gx <= WATER_CELLS_X; gx++) {
    const vx = WATER_START_X + gx * spacing;
    for (let gz = 0; gz <= WATER_CELLS_Z; gz++) {
      const vz = WATER_START_Z + gz * spacing;
      const idx = gx * (WATER_CELLS_Z + 1) + gz;
      const active = isVertexActive(gx, gz);
      const groundY = getSurfaceHeightNear(vx, 5.0, vz);
      world.waterHeights[idx] = active ? 4.0 : Math.min(4.0, groundY);
    }
  }

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
  world.waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
  world.waterMesh.position.set(0, 4.0, 0); // Directly at coordinate origin, Y=4.0 height (no rotation needed)
  game.scene.add(world.waterMesh);

  // 1b. Mountain Lake Plane
  const lakeGeometry = new THREE.CircleGeometry(24.0, 32);
  lakeGeometry.rotateX(-Math.PI / 2);
  const lakeMaterial = new THREE.MeshStandardMaterial({
    color: 0x00c3df,
    roughness: 0.15,
    metalness: 0.1,
    transparent: true,
    opacity: 0.85,
    flatShading: true,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(0x041a24)
  });
  world.lakeMesh = new THREE.Mesh(lakeGeometry, lakeMaterial);
  world.lakeMesh.position.set(19.2, 15.68, 19.2); // center (12*1.6, 9.8*1.6, 12*1.6)
  game.scene.add(world.lakeMesh);

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

  // Spawn trees randomly on the island surface (mix of Palm and Pine trees) - Increased count for 120x120
  for (let i = 0; i < 200; i++) {
    const rx = Math.random() * (world.sizeX - 10) + 5;
    const rz = Math.random() * (world.sizeZ - 10) + 5;
    
    // Find terrain height
    const wx = rx * spacing;
    const wz = rz * spacing;
    const wy = getSurfaceHeightNear(wx, 15, wz);

    // Only spawn trees on land above water and NOT inside the lake
    const lakeDist = Math.sqrt((wx - 19.2)*(wx - 19.2) + (wz - 19.2)*(wz - 19.2));
    if (wy > 4.1 && lakeDist > 25.0) {
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

  // 3. Low-Poly Rock formations - Increased count for 120x120
  for (let i = 0; i < 80; i++) {
    const rx = Math.random() * (world.sizeX - 6) + 3;
    const rz = Math.random() * (world.sizeZ - 6) + 3;
    
    const wx = rx * spacing;
    const wz = rz * spacing;
    const wy = getSurfaceHeightNear(wx, 15, wz);

    const lakeDist = Math.sqrt((wx - 19.2)*(wx - 19.2) + (wz - 19.2)*(wz - 19.2));
    if (wy > 3.0 && lakeDist > 25.0) {
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

  // 3b. Marine Rocks (rocks emerging from the sea) - Increased count for 120x120
  const marineRockMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x5a6363, // Darker wet rock
    roughness: 0.6,  // Slightly glossy/wet appearance
    flatShading: true 
  });
  
  for (let i = 0; i < 40; i++) {
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

  // 3c. 3D Low-Poly Starfish on the shoreline - Increased count for 120x120
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

  for (let i = 0; i < 30; i++) {
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
  // Scaled coordinates by 3, Node 2 adjusted to (70, 82) to avoid the bay
  const locations = [
    { x: 54, z: 36 },
    { x: 70, z: 82 },
    { x: 36, z: 84 },
    { x: 66, z: 45 },
    { x: 78, z: 30 },
    { x: 42, z: 66 }
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

  // 5. Wooden Pier / Dock (near player spawn) - Position scaled by 3
  const dockGroup = new THREE.Group();
  const plankMaterial = new THREE.MeshStandardMaterial({ color: 0x6e4e37, roughness: 0.95, flatShading: true });
  const pierX = 51.0 * spacing; // aligned with beach at 3x scale (originally 17.0)
  
  for (let z = 54.0; z <= 84.0; z += 0.8) { // scaled from 18.0 to 28.0
    const plankGeom = new THREE.BoxGeometry(1.4, 0.06, 0.6);
    const plank = new THREE.Mesh(plankGeom, plankMaterial);
    plank.position.set(pierX, 4.12, z * spacing);
    plank.castShadow = true;
    plank.receiveShadow = true;
    dockGroup.add(plank);
  }
  
  const postGeom = new THREE.CylinderGeometry(0.08, 0.08, 3.5, 5);
  const postLocations = [
    { x: pierX - 0.6, z: 18.5 * 3 * spacing },
    { x: pierX + 0.6, z: 18.5 * 3 * spacing },
    { x: pierX - 0.6, z: 27.5 * 3 * spacing },
    { x: pierX + 0.6, z: 27.5 * 3 * spacing }
  ];
  
  postLocations.forEach(pos => {
    const post = new THREE.Mesh(postGeom, plankMaterial);
    post.position.set(pos.x, 2.5, pos.z);
    post.castShadow = true;
    post.receiveShadow = true;
    dockGroup.add(post);
  });
  
  game.scene.add(dockGroup);
  
  // 6. Floating Log Raft (Constructible with blueprint) - Position scaled by 3
  const raftGroup = new THREE.Group();
  const raftMaterial = new THREE.MeshStandardMaterial({ color: 0x553d2d, roughness: 0.9, flatShading: true });
  for (let i = 0; i < 4; i++) {
    const logGeom = new THREE.CylinderGeometry(0.12, 0.12, 1.8, 5);
    logGeom.rotateX(Math.PI / 2);
    const log = new THREE.Mesh(logGeom, raftMaterial);
    log.position.set(pierX - 2.0 + i * 0.28, 4.05, 26.5 * 3 * spacing);
    log.castShadow = true;
    log.receiveShadow = true;
    raftGroup.add(log);
  }
  world.raftMesh = raftGroup;
  world.raftMesh.visible = false; // Initially invisible (must be constructed)
  game.scene.add(raftGroup);

  // Raft Blueprint Overlay (Wireframe blue logs)
  const blueprintGroup = new THREE.Group();
  const blueprintMaterial = new THREE.MeshBasicMaterial({
    color: 0x00aaff,
    transparent: true,
    opacity: 0.4,
    wireframe: true
  });
  for (let i = 0; i < 4; i++) {
    const logGeom = new THREE.CylinderGeometry(0.12, 0.12, 1.8, 5);
    logGeom.rotateX(Math.PI / 2);
    const log = new THREE.Mesh(logGeom, blueprintMaterial);
    log.position.set(pierX - 2.0 + i * 0.28, 4.05, 26.5 * 3 * spacing);
    blueprintGroup.add(log);
  }
  world.raftBlueprint = blueprintGroup;
  game.scene.add(blueprintGroup);

  // 7. Lit Beach Torches - Position scaled by 3
  const torchPositions = [
    { x: 22.0 * 3 * spacing, z: 23.0 * 3 * spacing },
    { x: pierX + 1.2, z: 19.0 * 3 * spacing },
    { x: pierX + 1.2, z: 27.5 * 3 * spacing },
    { x: 12.0 * 3 * spacing, z: 21.0 * 3 * spacing }
  ];
  
  torchPositions.forEach(pos => {
    const torch = createTorch();
    const ty = getSurfaceHeightNear(pos.x, 15.0, pos.z);
    torch.position.set(pos.x, ty, pos.z);
    game.scene.add(torch);
    world.sceneryMeshes.push({ mesh: torch, type: 'torch' });
  });

  // 8. Distant Island with a Lighthouse (Relocated and detailed)
  const distIslandGroup = new THREE.Group();
  distIslandGroup.position.set(1500, -5, -2000); // Expanded and relocated
  
  // Base mountain
  const mtGeom = new THREE.ConeGeometry(90, 180, 5);
  const mtMaterial = new THREE.MeshStandardMaterial({ color: 0x5a5040, roughness: 0.9, flatShading: true });
  const mountain = new THREE.Mesh(mtGeom, mtMaterial);
  mountain.position.y = 80;
  mountain.castShadow = true;
  mountain.receiveShadow = true;
  distIslandGroup.add(mountain);

  // Relocated and expanded Nest stairs climbing the mountain side
  const nestMaterial = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.95, flatShading: true });
  const stepsCount = 18;
  for (let i = 0; i < stepsCount; i++) {
    const stepGeom = new THREE.BoxGeometry(7, 3, 7);
    const stepMesh = new THREE.Mesh(stepGeom, nestMaterial);
    
    // Position stairs spiraling up
    const angle = (i / stepsCount) * Math.PI * 1.3 - 0.2;
    const radius = 68 - i * 1.5;
    const sx = Math.cos(angle) * radius;
    const sz = Math.sin(angle) * radius;
    const sy = i * 4.8 + 2;
    
    stepMesh.position.set(sx, sy, sz);
    stepMesh.rotation.y = -angle + Math.PI / 2;
    stepMesh.castShadow = true;
    stepMesh.receiveShadow = true;
    distIslandGroup.add(stepMesh);
  }

  // Giant Bird Nest at the top of the stairs (summit ledge)
  const nestGroup = new THREE.Group();
  nestGroup.position.set(-20, 85, 20); // Summit Ledge
  
  const nestRingGeom = new THREE.TorusGeometry(8, 2.2, 5, 12);
  const nestRing = new THREE.Mesh(nestRingGeom, nestMaterial);
  nestRing.rotation.x = Math.PI / 2;
  nestRing.castShadow = true;
  nestRing.receiveShadow = true;
  nestGroup.add(nestRing);
  
  // Shiny Golden Egg inside the nest
  const eggGeom = new THREE.SphereGeometry(1.9, 8, 8);
  eggGeom.scale(1.0, 1.45, 1.0); // Make it egg-shaped
  const egg = new THREE.Mesh(eggGeom, goldMaterial);
  egg.position.set(0.5, 0.8, -0.5);
  egg.rotation.set(0.3, 0.2, -0.4);
  egg.castShadow = true;
  nestGroup.add(egg);
  
  distIslandGroup.add(nestGroup);

  // The Lighthouse Tower
  const towerGeom = new THREE.CylinderGeometry(4.5, 6.5, 45, 6);
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.7, flatShading: true });
  const tower = new THREE.Mesh(towerGeom, towerMat);
  tower.position.set(0, 110, 0); // Nestled on the summit
  tower.castShadow = true;
  tower.receiveShadow = true;
  distIslandGroup.add(tower);

  // Glass Room at the top
  const glassGeom = new THREE.CylinderGeometry(4.0, 4.0, 7, 6);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, roughness: 0.1, transparent: true, opacity: 0.45, flatShading: true });
  const glassRoom = new THREE.Mesh(glassGeom, glassMat);
  glassRoom.position.set(0, 134, 0);
  distIslandGroup.add(glassRoom);

  // Red Roof
  const roofGeom = new THREE.ConeGeometry(5.2, 6, 6);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xb22222, roughness: 0.6, flatShading: true });
  const roof = new THREE.Mesh(roofGeom, roofMat);
  roof.position.set(0, 139, 0);
  roof.castShadow = true;
  distIslandGroup.add(roof);

  // Rotating light beam helper
  const beamGroup = new THREE.Group();
  beamGroup.position.set(0, 134, 0);
  
  const beamGeom = new THREE.ConeGeometry(24, 250, 6, 1, true); // Open cone
  beamGeom.rotateX(Math.PI / 2); // align forward Z
  beamGeom.translate(0, 0, 125); // offset center to rotation pivot
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfffcd0,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const beamMesh = new THREE.Mesh(beamGeom, beamMat);
  beamGroup.add(beamMesh);
  distIslandGroup.add(beamGroup);
  world.lighthouseBeam = beamGroup; // link for animation updates

  game.scene.add(distIslandGroup);

  // 8b. Distant Volcanic Island
  const volcIslandGroup = new THREE.Group();
  volcIslandGroup.position.set(-1800, -5, 1500); // Relocated in opposite quadrant
  
  // Volcano cone base
  const volcBaseGeom = new THREE.ConeGeometry(120, 95, 5);
  const volcBaseMat = new THREE.MeshStandardMaterial({ color: 0x2b2825, roughness: 0.95, flatShading: true });
  const volcBase = new THREE.Mesh(volcBaseGeom, volcBaseMat);
  volcBase.position.y = 40;
  volcBase.castShadow = true;
  volcBase.receiveShadow = true;
  volcIslandGroup.add(volcBase);

  // Red Glowing Lava Lake inside crater
  const lavaGeom = new THREE.CylinderGeometry(20, 20, 2, 5);
  const lavaMat = new THREE.MeshStandardMaterial({
    color: 0xff3300,
    roughness: 0.8,
    emissive: 0xff2200,
    emissiveIntensity: 1.5,
    toneMapped: false,
    flatShading: true
  });
  const lavaLake = new THREE.Mesh(lavaGeom, lavaMat);
  lavaLake.position.set(0, 83.5, 0); // Crater rim height
  volcIslandGroup.add(lavaLake);

  // Scatter a few burnt dead trees on the volcanic slopes
  const deadTrunkGeom = new THREE.CylinderGeometry(0.4, 0.7, 9, 4);
  const deadTrunkMat = new THREE.MeshStandardMaterial({ color: 0x1f1a17, roughness: 0.95, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2;
    const r = 58.0 + Math.random() * 20.0;
    const tx = Math.cos(angle) * r;
    const tz = Math.sin(angle) * r;
    
    // Calculate volcanic slope height
    const ty = 40.0 * (1.0 - r / 120.0) + 2.0; 
    
    const treeGroup = new THREE.Group();
    treeGroup.position.set(tx, ty, tz);
    
    const trunk = new THREE.Mesh(deadTrunkGeom, deadTrunkMat);
    trunk.position.y = 4.5;
    trunk.rotation.set(0.1, 0, (Math.random() - 0.5) * 0.4);
    trunk.castShadow = true;
    treeGroup.add(trunk);

    volcIslandGroup.add(treeGroup);
  }

  // Place 4 Gold Ore deposits on the volcano side (rich but dangerous!)
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + 0.5;
    const r = 62.0;
    const ox = Math.cos(angle) * r;
    const oz = Math.sin(angle) * r;
    const oy = 40.0 * (1.0 - r / 120.0) + 1.2;
    
    const volcOre = new THREE.Group();
    volcOre.position.set(ox, oy, oz);
    
    const baseRock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 0), deadTrunkMat);
    baseRock.castShadow = true;
    volcOre.add(baseRock);
    
    const crystals = new THREE.Mesh(new THREE.DodecahedronGeometry(0.65, 0), goldMaterial);
    crystals.position.set(0.2, 0.9, 0.2);
    crystals.castShadow = true;
    volcOre.add(crystals);

    volcIslandGroup.add(volcOre);
  }

  game.scene.add(volcIslandGroup);

  // 9. Floating seagull visual helper orbit setup
  // Done in main animation loop in game.js

  // 10. Spawn Shoreline Cane Plants (marshy shoreline spot) - Position scaled by 3
  world.canes = [];
  const caneSpotX = 12 * 3 * spacing;
  const caneSpotZ = 28 * 3 * spacing;
  for (let i = 0; i < 5; i++) {
    const rx = caneSpotX + (Math.random() - 0.5) * 5.0;
    const rz = caneSpotZ + (Math.random() - 0.5) * 5.0;
    const ry = getSurfaceHeightNear(rx, 15, rz);
    
    // Shore beach checks
    if (ry >= 3.7 && ry <= 5.5) {
      const plant = createCanePlant();
      plant.position.set(rx, ry, rz);
      plant.scale.setScalar(0.75 + Math.random() * 0.3);
      plant.userData = {
        health: 2,
        maxHealth: 2,
        broken: false
      };
      game.scene.add(plant);
      world.sceneryMeshes.push({ mesh: plant, type: 'cane' });
      world.canes.push(plant);
    }
  }

  // 11. Spawn Starting Ground items (Sticks, Fallen Logs, Lianas) near spawn point - Position scaled by 3
  const startingItems = [
    // 3 original Sticks
    { pos: new THREE.Vector3(23.5 * 3 * spacing, 0, 26.5 * 3 * spacing), type: 'stick' },
    { pos: new THREE.Vector3(26.5 * 3 * spacing, 0, 23.5 * 3 * spacing), type: 'stick' },
    { pos: new THREE.Vector3(27.0 * 3 * spacing, 0, 27.0 * 3 * spacing), type: 'stick' },
    // 2 additional Sticks washed up on the beach
    { pos: new THREE.Vector3(14.0 * 3 * spacing, 0, 25.0 * 3 * spacing), type: 'stick' },
    { pos: new THREE.Vector3(30.0 * 3 * spacing, 0, 14.0 * 3 * spacing), type: 'stick' },
    
    // 4 Fallen Logs (Fallen trees)
    { pos: new THREE.Vector3(15.0 * 3 * spacing, 0, 20.0 * 3 * spacing), type: 'fallen_log' },
    { pos: new THREE.Vector3(35.0 * 3 * spacing, 0, 15.0 * 3 * spacing), type: 'fallen_log' },
    { pos: new THREE.Vector3(18.0 * 3 * spacing, 0, 32.0 * 3 * spacing), type: 'fallen_log' },
    { pos: new THREE.Vector3(28.0 * 3 * spacing, 0, 36.0 * 3 * spacing), type: 'fallen_log' },
    
    // 3 Lianas (vines to tie the logs)
    { pos: new THREE.Vector3(20.0 * 3 * spacing, 0, 18.0 * 3 * spacing), type: 'liana' },
    { pos: new THREE.Vector3(32.0 * 3 * spacing, 0, 28.0 * 3 * spacing), type: 'liana' },
    { pos: new THREE.Vector3(24.0 * 3 * spacing, 0, 33.0 * 3 * spacing), type: 'liana' }
  ];
  
  startingItems.forEach(item => {
    const groundY = getSurfaceHeightNear(item.pos.x, 15, item.pos.z);
    item.pos.y = groundY + 0.15;
    spawnDebris(item.pos, new THREE.Vector3(0, 1, 0), item.type);
  });
}

// Spawns a 3D wooden bulletin feedback board on the island - Position scaled by 3
function spawnFeedbackBoard() {
  const wx = 66.0;
  const wz = 66.0;
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

  // Frame Border
  const frameT = 0.08;
  const frameD = 0.12;
  const topBorder = new THREE.Mesh(new THREE.BoxGeometry(2.2 + frameT, frameT, frameD), frameMaterial);
  topBorder.position.set(0, 2.65, 0);
  topBorder.castShadow = true;
  boardGroup.add(topBorder);

  const bottomBorder = new THREE.Mesh(new THREE.BoxGeometry(2.2 + frameT, frameT, frameD), frameMaterial);
  bottomBorder.position.set(0, 1.15, 0);
  bottomBorder.castShadow = true;
  boardGroup.add(bottomBorder);

  const leftBorder = new THREE.Mesh(new THREE.BoxGeometry(frameT, 1.5, frameD), frameMaterial);
  leftBorder.position.set(-1.1, 1.9, 0);
  leftBorder.castShadow = true;
  boardGroup.add(leftBorder);

  const rightBorder = new THREE.Mesh(new THREE.BoxGeometry(frameT, 1.5, frameD), frameMaterial);
  rightBorder.position.set(1.1, 1.9, 0);
  rightBorder.castShadow = true;
  boardGroup.add(rightBorder);

  // Gabled Slate Roof to protect notices from tropical rain
  const roofGeom = new THREE.ConeGeometry(1.6, 0.6, 4);
  roofGeom.rotateY(Math.PI / 4); // Align square cone
  roofGeom.scale(1.7, 1.0, 0.35); // Flatten and stretch
  const roof = new THREE.Mesh(roofGeom, roofMaterial);
  roof.position.set(0, 2.85, 0);
  roof.castShadow = true;
  boardGroup.add(roof);

  // Add 4 static mock Feedback Notices (paper meshes stuck on corkboard)
  const notesData = [
    { x: -0.6, y: 2.1, w: 0.45, h: 0.55, rot: 0.1, color: paperColors[0], pin: pinColors[0] },
    { x: -0.1, y: 2.0, w: 0.48, h: 0.62, rot: -0.06, color: paperColors[1], pin: pinColors[1] },
    { x: 0.5, y: 2.2, w: 0.50, h: 0.48, rot: 0.15, color: paperColors[2], pin: pinColors[2] },
    { x: 0.3, y: 1.5, w: 0.52, h: 0.52, rot: -0.12, color: paperColors[3], pin: pinColors[3] }
  ];

  notesData.forEach(nd => {
    const noteGeom = new THREE.PlaneGeometry(nd.w, nd.h);
    const noteMat = new THREE.MeshStandardMaterial({
      color: nd.color,
      roughness: 0.95,
      side: THREE.DoubleSide,
      flatShading: true
    });
    const note = new THREE.Mesh(noteGeom, noteMat);
    note.position.set(nd.x, nd.y, 0.06);
    note.rotation.z = nd.rot;
    note.castShadow = true;
    note.receiveShadow = true;
    boardGroup.add(note);

    // Decorative Pin head on each note
    const pinGeom = new THREE.SphereGeometry(0.024, 6, 6);
    const pinMat = new THREE.MeshStandardMaterial({ color: nd.pin, roughness: 0.3, metalness: 0.5 });
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
  boardGroup.rotation.y = Math.PI / 4; // Face the starting spawn point

  game.scene.add(boardGroup);
  world.feedbackBoard = boardGroup;
// Initialize World
export function initWorld() {
  generateDensityGrid();
  buildMarchingCubesMesh();
  spawnScenery();
  spawnFeedbackBoard();
  spawnSeabed();
}

// Update World Animation (e.g. lighthouse rotation, dynamic gravity snap for trees/rocks)
export function updateWorld(delta) {
  // Rotate the lighthouse beam around Y axis
  if (world.lighthouseBeam) {
    world.lighthouseBeam.rotation.y += 0.8 * delta;
  }

  // Update dynamic water level filling
  updateWaterHeights(delta);

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
    } else if (item.type === 'cane') {
      item.mesh.position.y = groundY;
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

  // Snap and animate campfire flickers
  if (world.campfires) {
    world.campfires.forEach(campfire => {
      const pos = campfire.position;
      const groundY = getSurfaceHeightNear(pos.x, 15, pos.z);
      campfire.position.y = groundY;

      if (campfire.userData) {
        // Decrease burn time
        if (campfire.userData.burnTime > 0) {
          campfire.userData.burnTime = Math.max(0, campfire.userData.burnTime - delta);
        }

        const isBurning = campfire.userData.burnTime > 0;
        
        // Calculate scale multiplier based on fuel (range: 0.5 to 1.8)
        const scaleMult = isBurning ? Math.min(1.8, 0.5 + (campfire.userData.burnTime / 90.0)) : 0.0;

        if (campfire.userData.flame) {
          campfire.userData.flame.visible = isBurning;
          if (isBurning) {
            campfire.userData.flickerTime += delta * 12;
            const flickerScale = 0.9 + Math.sin(campfire.userData.flickerTime) * 0.15 + (Math.random() - 0.5) * 0.08;
            const finalScale = scaleMult * flickerScale;
            campfire.userData.flame.scale.set(finalScale, finalScale * 1.2, finalScale);
          }
        }

        if (campfire.userData.light) {
          campfire.userData.light.visible = isBurning;
          if (isBurning) {
            const flickerLight = 1.2 + Math.sin(campfire.userData.flickerTime * 1.5) * 0.3 + (Math.random() - 0.5) * 0.15;
            campfire.userData.light.intensity = scaleMult * flickerLight;
            campfire.userData.light.distance = 8.0 * scaleMult;
          } else {
            campfire.userData.light.intensity = 0;
          }
        }
      }
    });
  }
}

// Builds a low-poly 3D campfire model with crossed wooden log cylinders and a central conical flame
export function createCampfireMesh(isHologram) {
  const campfireGroup = new THREE.Group();
  campfireGroup.name = "campfire";

  let logMaterial, flameMaterial;
  if (isHologram) {
    logMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      wireframe: true,
      transparent: true,
      opacity: 0.4
    });
    flameMaterial = logMaterial;
  } else {
    logMaterial = new THREE.MeshStandardMaterial({
      color: 0x5c3d24,
      roughness: 0.9,
      flatShading: true
    });
    flameMaterial = new THREE.MeshStandardMaterial({
      color: 0xff5500,
      emissive: 0xffaa00,
      emissiveIntensity: 0.8,
      flatShading: true
    });
  }

  // 3 logs crossing each other
  const logGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.6, 5);
  logGeom.rotateZ(Math.PI / 2);

  const log1 = new THREE.Mesh(logGeom, logMaterial);
  log1.position.y = 0.02;
  log1.rotation.y = 0;
  log1.rotation.z = 0.15;
  log1.castShadow = !isHologram;
  log1.receiveShadow = !isHologram;
  campfireGroup.add(log1);

  const log2 = new THREE.Mesh(logGeom, logMaterial);
  log2.position.y = 0.02;
  log2.rotation.y = Math.PI / 3;
  log2.rotation.z = -0.15;
  log2.castShadow = !isHologram;
  log2.receiveShadow = !isHologram;
  campfireGroup.add(log2);

  const log3 = new THREE.Mesh(logGeom, logMaterial);
  log3.position.y = 0.02;
  log3.rotation.y = -Math.PI / 3;
  log3.rotation.z = 0.1;
  log3.castShadow = !isHologram;
  log3.receiveShadow = !isHologram;
  campfireGroup.add(log3);

  // Flame cone
  const flameGeom = new THREE.ConeGeometry(0.18, 0.35, 5);
  flameGeom.translate(0, 0.175, 0); // pivot at base
  const flame = new THREE.Mesh(flameGeom, flameMaterial);
  flame.position.y = 0.03;
  flame.name = "flame";
  campfireGroup.add(flame);

  if (!isHologram) {
    // Flickering orange point light
    const light = new THREE.PointLight(0xff7700, 1.5, 8);
    light.position.set(0, 0.4, 0);
    light.castShadow = true;
    light.shadow.bias = -0.002;
    campfireGroup.add(light);
    
    // Add user data to animate flicker/flame scale and track fuel
    campfireGroup.userData = {
      light: light,
      flame: flame,
      flickerTime: 0,
      burnTime: 0.0, // starts unlit, requires ignition
      maxBurnTime: 300.0 // cap at 5 minutes
    };
  }

  return campfireGroup;
}

function updateWaterHeights(delta) {
  if (!world.waterHeights) return;
  const spacing = world.spacing;
  for (let gx = 0; gx <= WATER_CELLS_X; gx++) {
    const vx = WATER_START_X + gx * spacing;
    for (let gz = 0; gz <= WATER_CELLS_Z; gz++) {
      const vz = WATER_START_Z + gz * spacing;
      const idx = gx * (WATER_CELLS_Z + 1) + gz;
      
      const active = isVertexActive(gx, gz);
      const groundY = getSurfaceHeightNear(vx, 5.0, vz);
      
      const targetY = active ? 4.0 : Math.min(4.0, groundY);
      const currentY = world.waterHeights[idx];
      
      // Interpolate water height towards target with a fill rate of 3.0 (fills in ~1.5s)
      world.waterHeights[idx] = currentY + (targetY - currentY) * 3.0 * delta;
    }
  }
}

// Builds a 3D low-poly cane cluster containing 4-5 green segmented stalks made of cylinders
export function createCanePlant() {
  const caneGroup = new THREE.Group();
  caneGroup.name = "cane_plant";
  
  const caneMaterial = new THREE.MeshStandardMaterial({ color: 0x6b8e23, roughness: 0.8, flatShading: true });
  
  // Create 4-5 tall stalks angled slightly outwards
  const stalkCount = 4 + Math.floor(Math.random() * 2);
  for (let i = 0; i < stalkCount; i++) {
    const stalk = new THREE.Group();
    
    // Position radially
    const angle = (i * Math.PI * 2) / stalkCount;
    const radius = 0.12 + Math.random() * 0.08;
    stalk.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    
    // Stalk height
    const height = 1.4 + Math.random() * 0.7;
    const segments = 4;
    const segHeight = height / segments;
    
    let parent = stalk;
    for (let j = 0; j < segments; j++) {
      const bottomR = 0.035 - j * 0.003;
      const topR = 0.031 - j * 0.003;
      const geom = new THREE.CylinderGeometry(topR, bottomR, segHeight, 5);
      geom.translate(0, segHeight / 2, 0); // pivot at base of segment
      const mesh = new THREE.Mesh(geom, caneMaterial);
      
      if (j === 0) {
        // base segment tilt
        mesh.rotation.z = (Math.random() - 0.5) * 0.15;
        mesh.rotation.x = (Math.random() - 0.5) * 0.15;
      } else {
        // stack segment tilt
        mesh.position.y = segHeight * 0.95;
        mesh.rotation.z = (Math.random() - 0.5) * 0.08;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      
      parent.add(mesh);
      parent = mesh;
    }
    
    caneGroup.add(stalk);
  }
  
  return caneGroup;
}

// Calculate the depth/height of the seabed mathematically (deeper far from islands)
export function getSeabedHeight(x, z) {
  // Distance to Starting Island
  const dStart = Math.sqrt((x - 32) * (x - 32) + (z - 32) * (z - 32));
  
  // Distance to Lighthouse Island
  const dLight = Math.sqrt((x - 1500) * (x - 1500) + (z - (-2000)) * (z - (-2000)));
  
  // Distance to Volcanic Island
  const dVolc = Math.sqrt((x - (-1800)) * (x - (-1800)) + (z - 1500) * (z - 1500));
  
  // Base deep ocean floor Y height (deeper far from islands, e.g. -70m)
  const baseFloor = -70.0;
  
  // Influence factors (smoothly interpolation from 1 near center to 0 far away)
  // Starting island: slopes down to -70m over ~120 meters distance
  const wStart = Math.exp(-Math.pow(dStart / 120.0, 2));
  const hStart = 2.0; // Starting island base height (just below water surface Y=4.0)
  
  // Lighthouse Island: slopes down to -70m over ~400 meters
  const wLight = Math.exp(-Math.pow(dLight / 400.0, 2));
  const hLight = -5.0; // Matches lighthouse base Y=-5
  
  // Volcanic Island: slopes down to -70m over ~500 meters
  const wVolc = Math.exp(-Math.pow(dVolc / 500.0, 2));
  const hVolc = -5.0; // Matches volcano base Y=-5
  
  // Total blended height
  let height = baseFloor;
  
  // Blend start island
  height = THREE.MathUtils.lerp(height, hStart, wStart);
  
  // Blend lighthouse
  height = THREE.MathUtils.lerp(height, hLight, wLight);
  
  // Blend volcano
  height = THREE.MathUtils.lerp(height, hVolc, wVolc);
  
  // Add procedural ocean floor ridges and valleys (large-scale low-poly terrain detail)
  const floorNoise = fbmNoise2D(x * 0.001, z * 0.001) * 20.0 - 10.0; // +/- 10 meters variation
  
  // Scale noise down near the islands so the transitions are clean
  const noiseScale = (1.0 - wStart) * (1.0 - wLight) * (1.0 - wVolc);
  height += floorNoise * noiseScale;
  
  return height;
}

// Spawn the large-scale low-poly seabed mesh that covers the active world
function spawnSeabed() {
  const geom = new THREE.PlaneGeometry(8000, 8000, 160, 160);
  geom.rotateX(-Math.PI / 2); // Rotate to face upwards (horizontal plane)
  
  const pos = geom.attributes.position;
  const colors = [];
  const colorShallow = new THREE.Color(0xbfa38a); // Sandy beach color
  const colorDeep = new THREE.Color(0x1a2e35);    // Dark grey-blue ocean floor
  const tempColor = new THREE.Color();
  
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vz = pos.getZ(i);
    
    // Calculate height mathematically
    const vy = getSeabedHeight(vx, vz);
    pos.setY(i, vy);
    
    // Coloring: shallower parts are sandier, deeper parts are darker
    // vy ranges from -70 (deep floor) to +2 (shoreline)
    const t = Math.max(0, Math.min(1.0, (vy - (-70.0)) / 72.0));
    tempColor.copy(colorDeep).lerp(colorShallow, t);
    colors.push(tempColor.r, tempColor.g, tempColor.b);
  }
  
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geom.computeVertexNormals();

  const seabedMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.02,
    flatShading: true,
    vertexColors: true,
    side: THREE.FrontSide
  });

  const mesh = new THREE.Mesh(geom, seabedMaterial);
  mesh.receiveShadow = true;
  mesh.position.set(0, 0, 0);

  game.scene.add(mesh);
  world.seabedMesh = mesh;
}
