import { world, getWaterHeightAt, WATER_CELLS_X, WATER_CELLS_Z } from './world.js';
import { game } from './game.js';

let waterUpdateTimer = 0;
export function updateWaterHeights(delta) {
  if (!world.waterHeights || !world.waterGroundHeights || !world.waterActiveVertices) return;
  
  waterUpdateTimer += delta;
  if (waterUpdateTimer < 0.1) return;
  waterUpdateTimer = 0;

  for (let gx = 0; gx <= WATER_CELLS_X; gx++) {
    const idxOffset = gx * (WATER_CELLS_Z + 1);
    for (let gz = 0; gz <= WATER_CELLS_Z; gz++) {
      const idx = idxOffset + gz;
      
      const active = world.waterActiveVertices[idx] === 1;
      const groundY = world.waterGroundHeights[idx];
      
      const targetY = active ? 4.0 : Math.min(4.0, groundY - 0.5);
      const currentY = world.waterHeights[idx];
      
      // Interpolate water height towards target
      world.waterHeights[idx] = currentY + (targetY - currentY) * 0.3;
    }
  }
}

let waveFrameCount = 0;
export function updateOceanWaves(delta, wasSubmerged) {
  if (!world.waterMesh || game.paused || wasSubmerged) return;

  waveFrameCount++;
  if (waveFrameCount % 2 !== 0) return; // Run at 30Hz instead of 60Hz to halve CPU/GPU data transfer overhead!

  const time = game.time;
  const positionAttribute = world.waterMesh.geometry.attributes.position;
  const depthAttribute = world.waterMesh.geometry.attributes.depth;
  const posArray = positionAttribute.array;
  const depthArray = depthAttribute ? depthAttribute.array : null;
  const count = positionAttribute.count;
  const playerPos = (game.controls && game.controls.getObject) ? game.controls.getObject().position : null;
  
// Precompute boundary wave heights outside the loop using absolute coordinates
  const absLeft = (world.gridOffsetX || 0) * 1.6;
  const absRight = absLeft + 256.0;
  const absBottom = (world.gridOffsetZ || 0) * 1.6;
  const absTop = absBottom + 256.0;

  const h00 = Math.sin(absLeft * 0.12 + time * 1.6) * 0.18 + Math.cos(absBottom * 0.12 + time * 1.2) * 0.18;
  const h10 = Math.sin(absRight * 0.12 + time * 1.6) * 0.18 + Math.cos(absBottom * 0.12 + time * 1.2) * 0.18;
  const h01 = Math.sin(absLeft * 0.12 + time * 1.6) * 0.18 + Math.cos(absTop * 0.12 + time * 1.2) * 0.18;
  const h11 = Math.sin(absRight * 0.12 + time * 1.6) * 0.18 + Math.cos(absTop * 0.12 + time * 1.2) * 0.18;
  
  const relSeaLevel = (world.seaLevel !== undefined ? world.seaLevel : 4.0) - 4.0;

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const vx = posArray[i3];
    const vz = posArray[i3 + 2]; // Read world Z directly (geometry is not rotated)
    
    // Convert local vertex to absolute coordinate to check distance culling
    const absVx = vx + absLeft;
    const absVz = vz + absBottom;

    // Fast distance culling: if far from player and not close to grid boundary (within 12m), keep flat and skip calculations
    if (playerPos) {
      const dx = absVx - playerPos.x;
      const dz = absVz - playerPos.z;
      if (dx * dx + dz * dz > 4900) { // 70 meters squared
        if (vx >= 12.0 && vx <= 244.0 && vz >= 12.0 && vz <= 244.0) {
          posArray[i3 + 1] = relSeaLevel;
          continue;
        }
      }
    }

    const baseHeight = getWaterHeightAt(vx, vz);
    
    // Stitch boundary vertices: do NOT cull vertices near the boundary (within 12m) to prevent cracks!
    const isInner = (vx >= -0.001 && vx <= 256.001 && vz >= -0.001 && vz <= 256.001);
    let isBoundary = !isInner;
    if (isInner) {
      const distToLeft = vx - 0;
      const distToRight = 256.0 - vx;
      const distToBottom = vz - 0;
      const distToTop = 256.0 - vz;
      const dMin = Math.min(distToLeft, distToRight, distToBottom, distToTop);
      if (dMin < 12.0) {
        isBoundary = true;
      }
    }
    
    const maxDepth = depthArray ? depthArray[i] : 4.0;
    const groundY = 4.0 - maxDepth;
    
    const currentDepth = Math.max(0, baseHeight - groundY);
    const relativeBaseHeight = baseHeight - 4.0;
    
    let yVal = relativeBaseHeight; // Local Y is height relative to the mesh position of Y=4.0
    
    // Calculate deep water wave using absolute coordinates for coherent waves across shifts
    const deepWave = Math.sin(absVx * 0.12 + time * 1.6) * 0.18 + 
                     Math.cos(absVz * 0.12 + time * 1.2) * 0.18;
    
    let localWave = deepWave;
    if (currentDepth < 2.0) {
      // Near the shore (shallow depth): fade in fast, tight ripples (increspature)
      const rippleFactor = (2.0 - currentDepth) / 2.0; // 1.0 at shore, 0.0 at 2m depth
      
      // Fast, high-frequency shore ripples using absolute coordinates
      const shoreRipple = Math.sin(absVx * 0.45 + time * 3.5) * 0.05 + 
                          Math.cos(absVz * 0.45 + time * 2.8) * 0.05;
                           
      // Blend between large waves and small ripples near the shore
      // Scale down the final amplitude slightly close to the sand to avoid harsh clipping
      const amplitudeFactor = 0.4 + 0.6 * (currentDepth / 2.0); // go down to 40% height right at the shore
      
      localWave = (deepWave * (1.0 - rippleFactor) + shoreRipple * rippleFactor) * amplitudeFactor;
    }
    
    // Stitch boundary vertices between high-resolution inner ocean and low-resolution outer ocean
    if (isInner) {
      const distToLeft = vx - 0;
      const distToRight = 256.0 - vx;
      const distToBottom = vz - 0;
      const distToTop = 256.0 - vz;
      const dMin = Math.min(distToLeft, distToRight, distToBottom, distToTop);
      
      if (dMin < 12.0) {
        // Bilinear interpolation between the four corners of the inner ocean boundary
        const tx = Math.max(0, Math.min(1, vx / 256.0));
        const tz = Math.max(0, Math.min(1, vz / 256.0));
        
        const y_boundary = (1 - tx) * (1 - tz) * h00 +
                           tx * (1 - tz) * h10 +
                           (1 - tx) * tz * h01 +
                           tx * tz * h11;
                           
        const blendFactor = dMin / 12.0; // 0.0 at boundary (use pure y_boundary), 1.0 at 12m inside
        yVal += y_boundary * (1.0 - blendFactor) + localWave * blendFactor;
      } else {
        yVal += localWave;
      }
    } else {
      yVal += localWave;
    }
    
    posArray[i3 + 1] = yVal; // Direct set in Float32Array
  }
  positionAttribute.needsUpdate = true;
}
