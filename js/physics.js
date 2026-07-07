import { world, getSeabedHeight, LAKE_CENTER_X, LAKE_CENTER_Z } from './world.js';

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
  const spacing = world.spacing;
  const gx = px / spacing;
  const gz = pz / spacing;
  
  // Under the island grid footprint below bedrock level (Y < 0.2), treat it as solid earth!
  if (py < 0.2 && gx >= 0 && gx < world.sizeX && gz >= 0 && gz < world.sizeZ) {
    return true;
  }
  
  // If mountain lake is frozen, make the ice plane Y=17.6 solid!
  if (world.lakeFrozen) {
    const dx = px - LAKE_CENTER_X;
    const dz = pz - LAKE_CENTER_Z;
    if (dx*dx + dz*dz < 24.0 * 24.0) {
      if (py <= 17.65 && py >= 17.5) {
        return true;
      }
    }
  }
  
  return getDensityInterpolated(px, py, pz) > 0.15; // Return true if solid
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

  // If mountain lake is frozen, return Y=17.6 height when above/near it
  if (world.lakeFrozen) {
    const dx = px - LAKE_CENTER_X;
    const dz = pz - LAKE_CENTER_Z;
    if (dx*dx + dz*dz < 24.0 * 24.0) {
      if (py >= 17.4) {
        return 17.6;
      }
    }
  }

  const sHeight = getSeabedHeight(px, pz);

  const spacing = world.spacing;
  const gx = px / spacing;
  let gy = py / spacing;
  // If py is 15.0 or higher (which was the old sky level query), treat it as scanning from the sky (25.0)
  if (py >= 15.0) {
    gy = 25.0 / spacing;
  }
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
