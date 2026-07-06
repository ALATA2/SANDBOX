import { world } from './world.js';
import { game } from './game.js';

// Update wind swaying on foliage (trees, canes, berry bushes, crops)
export function updateFoliageWind(delta) {
  if (!world.sceneryMeshes || !game.windSwayEnabled) return;

  world.windTime = (world.windTime || 0.0) + delta * 1.5;
  const playerPos = (game.controls && game.controls.getObject) ? game.controls.getObject().position : null;

  world.sceneryMeshes.forEach(item => {
    if (item.type === 'tree' || item.type === 'cane' || item.type === 'berry_bush' || item.type === 'crop') {
      const mesh = item.mesh;
      if (!mesh) return;

      // Skip falling trees
      if (item.type === 'tree' && mesh.userData && mesh.userData.falling) {
        return;
      }

      // Distance culling check (45m squared = 2025)
      if (playerPos) {
        const distSq = mesh.position.distanceToSquared(playerPos);
        if (distSq > 2025) {
          if (mesh.userData.initRotX !== undefined) {
            mesh.rotation.x = mesh.userData.initRotX;
            mesh.rotation.z = mesh.userData.initRotZ;
          }
          return;
        }
      }

      // Calculate coordinate-based phase offset to randomize sway patterns
      const phase = (mesh.position.x * 0.15) + (mesh.position.z * 0.25);
      const t = world.windTime + phase;

      // Wind calculations
      const baseSway = Math.sin(t) * 0.022;
      const gustSway = Math.cos(t * 0.4) * Math.sin(t * 1.6) * 0.012;
      let totalSway = baseSway + gustSway;

      if (item.type === 'cane') {
        totalSway *= 2.4; // Canes are very flexible
      } else if (item.type === 'berry_bush' || item.type === 'crop') {
        totalSway *= 0.6; // Stiff/short plants
      }

      if (mesh.userData.initRotX === undefined) {
        mesh.userData.initRotX = mesh.rotation.x;
        mesh.userData.initRotZ = mesh.rotation.z;
      }

      mesh.rotation.x = mesh.userData.initRotX + totalSway;
      mesh.rotation.z = mesh.userData.initRotZ + totalSway * 0.65;
    }
  });
}
