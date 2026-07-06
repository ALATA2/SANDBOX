import { world, getWaterHeightAt, WATER_CELLS_X, WATER_CELLS_Z } from './world.js';
import { game } from './game.js';

export function updateWaterHeights(delta) {
  if (!world.waterHeights || !world.waterGroundHeights || !world.waterActiveVertices) return;
  for (let gx = 0; gx <= WATER_CELLS_X; gx++) {
    const idxOffset = gx * (WATER_CELLS_Z + 1);
    for (let gz = 0; gz <= WATER_CELLS_Z; gz++) {
      const idx = idxOffset + gz;
      
      const active = world.waterActiveVertices[idx] === 1;
      const groundY = world.waterGroundHeights[idx];
      
      const targetY = active ? 4.0 : Math.min(4.0, groundY);
      const currentY = world.waterHeights[idx];
      
      // Interpolate water height towards target with a fill rate of 3.0 (fills in ~1.5s)
      world.waterHeights[idx] = currentY + (targetY - currentY) * 3.0 * delta;
    }
  }
}

export function updateOceanWaves(delta, wasSubmerged) {
  if (!world.waterMesh || game.paused || wasSubmerged) return;

  const time = game.time;
  const positionAttribute = world.waterMesh.geometry.attributes.position;
  const depthAttribute = world.waterMesh.geometry.attributes.depth;
  const posArray = positionAttribute.array;
  const depthArray = depthAttribute ? depthAttribute.array : null;
  const count = positionAttribute.count;
  const playerPos = (game.controls && game.controls.getObject) ? game.controls.getObject().position : null;
  
  // Precompute boundary wave heights outside the loop (saves N * 4 trig calls!)
  const h00 = Math.sin(-20.8 * 0.12 + time * 1.6) * 0.18 + Math.cos(-20.8 * 0.12 + time * 1.2) * 0.18;
  const h10 = Math.sin(212.8 * 0.12 + time * 1.6) * 0.18 + Math.cos(-20.8 * 0.12 + time * 1.2) * 0.18;
  const h01 = Math.sin(-20.8 * 0.12 + time * 1.6) * 0.18 + Math.cos(212.8 * 0.12 + time * 1.2) * 0.18;
  const h11 = Math.sin(212.8 * 0.12 + time * 1.6) * 0.18 + Math.cos(212.8 * 0.12 + time * 1.2) * 0.18;
  
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const vx = posArray[i3];
    const vz = posArray[i3 + 2]; // Read world Z directly (geometry is not rotated)
    
    const baseHeight = getWaterHeightAt(vx, vz);
    
    // Stitch boundary vertices: do NOT cull vertices near the boundary (within 12m) to prevent cracks!
    const isInner = (vx >= -20.801 && vx <= 212.801 && vz >= -20.801 && vz <= 212.801);
    let isBoundary = !isInner;
    if (isInner) {
      const distToLeft = vx - (-20.8);
      const distToRight = 212.8 - vx;
      const distToBottom = vz - (-20.8);
      const distToTop = 212.8 - vz;
      const dMin = Math.min(distToLeft, distToRight, distToBottom, distToTop);
      if (dMin < 12.0) {
        isBoundary = true;
      }
    }
    
    // Distance culling check (70m limit squared = 4900): only apply to interior (non-boundary) vertices
    if (!isBoundary && playerPos) {
      const dx = vx - playerPos.x;
      const dz = vz - playerPos.z;
      if (dx * dx + dz * dz > 4900) {
        posArray[i3 + 1] = baseHeight - 4.0;
        continue;
      }
    }
    
    const maxDepth = depthArray ? depthArray[i] : 4.0;
    const groundY = 4.0 - maxDepth;
    
    const currentDepth = Math.max(0, baseHeight - groundY);
    const relativeBaseHeight = baseHeight - 4.0;
    
    let yVal = relativeBaseHeight; // Local Y is height relative to the mesh position of Y=4.0
    
    // Calculate deep water wave (smooth rolling waves)
    const deepWave = Math.sin(vx * 0.12 + time * 1.6) * 0.18 + 
                     Math.cos(vz * 0.12 + time * 1.2) * 0.18;
    
    let localWave = deepWave;
    if (currentDepth < 2.0) {
      // Near the shore (shallow depth): fade in fast, tight ripples (increspature)
      const rippleFactor = (2.0 - currentDepth) / 2.0; // 1.0 at shore, 0.0 at 2m depth
      
      // Fast, high-frequency shore ripples
      const shoreRipple = Math.sin(vx * 0.45 + time * 3.5) * 0.05 + 
                          Math.cos(vz * 0.45 + time * 2.8) * 0.05;
                          
      // Blend between large waves and small ripples near the shore
      // Scale down the final amplitude slightly close to the sand to avoid harsh clipping
      const amplitudeFactor = 0.4 + 0.6 * (currentDepth / 2.0); // go down to 40% height right at the shore
      
      localWave = (deepWave * (1.0 - rippleFactor) + shoreRipple * rippleFactor) * amplitudeFactor;
    }
    
    // Stitch boundary vertices between high-resolution inner ocean and low-resolution outer ocean
    if (isInner) {
      const distToLeft = vx - (-20.8);
      const distToRight = 212.8 - vx;
      const distToBottom = vz - (-20.8);
      const distToTop = 212.8 - vz;
      const dMin = Math.min(distToLeft, distToRight, distToBottom, distToTop);
      
      if (dMin < 12.0) {
        // Bilinear interpolation between the four corners of the inner ocean boundary
        const tx = Math.max(0, Math.min(1, (vx - (-20.8)) / 233.6));
        const tz = Math.max(0, Math.min(1, (vz - (-20.8)) / 233.6));
        
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
