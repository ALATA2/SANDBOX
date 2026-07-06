import * as THREE from 'three';
import { game } from './game.js';
import { world } from './world.js';
import { getSurfaceHeightNear } from './physics.js';

const tempFishVec1 = new THREE.Vector3();
const tempSwimDir = new THREE.Vector3();

export function updateFaunaAI(delta) {
  const time = game.time;
  if (!game.controls || !game.controls.getObject) return;
  const playerPos = game.controls.getObject().position;
  const spacing = world.spacing;
  const mapWidth = world.sizeX * spacing;
  const mapLength = world.sizeZ * spacing;

  // 1. Shore Crabs (wander or scuttle away from player)
  if (game.crabs) {
    game.crabs.forEach(crab => {
      const distToPlayer = crab.position.distanceTo(playerPos);
      if (distToPlayer > 60.0) {
        return; // Distance culling
      }
      
      crab.timer -= delta;
      const isFleeing = distToPlayer < 5.0;
      
      if (isFleeing) {
        crab.state = 'fleeing';
        const dir = crab.position.clone().sub(playerPos);
        dir.y = 0;
        dir.normalize();
        
        const speed = 2.2;
        crab.position.addScaledVector(dir, speed * delta);
        
        const targetAngle = Math.atan2(dir.x, dir.z);
        crab.rotation.y = targetAngle;
        
        if (crab.legs) {
          crab.legs.forEach((leg, idx) => {
            const phase = idx % 2 === 0 ? 1 : -1;
            leg.rotation.y = (idx % 2 === 0 ? 0.3 : Math.PI - 0.3) + Math.sin(time * 30.0) * 0.45 * phase;
          });
        }
        
        crab.position.x = Math.max(3, Math.min(mapWidth - 3, crab.position.x));
        crab.position.z = Math.max(3, Math.min(mapLength - 3, crab.position.z));
        crab.position.y = getSurfaceHeightNear(crab.position.x, 15, crab.position.z);
        
        if (crab.position.y < 4.0 || crab.position.y > 6.0) {
          const toCenter = new THREE.Vector3(mapWidth / 2, 4.2, mapLength / 2).sub(crab.position);
          toCenter.y = 0;
          toCenter.normalize();
          crab.position.addScaledVector(toCenter, speed * delta);
          crab.position.y = getSurfaceHeightNear(crab.position.x, 15, crab.position.z);
        }
      } else {
        if (crab.state === 'fleeing') {
          crab.state = 'idle';
          crab.timer = 1.0 + Math.random() * 2.0;
        }
        
        if (crab.state === 'idle') {
          if (crab.legs) {
            crab.legs.forEach((leg, idx) => {
              leg.rotation.y = (idx % 2 === 0 ? 0.3 : Math.PI - 0.3);
            });
          }
          
          if (crab.timer <= 0) {
            crab.state = 'walking';
            crab.timer = 4.0 + Math.random() * 4.0;
            
            let attempts = 0;
            let tx = crab.position.x;
            let tz = crab.position.z;
            let ty = crab.position.y;
            while (attempts < 15) {
              const angle = Math.random() * Math.PI * 2;
              const dist = 2.0 + Math.random() * 4.0;
              tx = crab.position.x + Math.cos(angle) * dist;
              tz = crab.position.z + Math.sin(angle) * dist;
              
              tx = Math.max(3, Math.min(mapWidth - 3, tx));
              tz = Math.max(3, Math.min(mapLength - 3, tz));
              ty = getSurfaceHeightNear(tx, 15, tz);
              if (ty >= 4.05 && ty <= 5.8) break;
              attempts++;
            }
            crab.target.set(tx, ty, tz);
          }
        } else if (crab.state === 'walking') {
          const dir = crab.target.clone().sub(crab.position);
          dir.y = 0;
          const dist = dir.length();
          
          if (dist < 0.15 || crab.timer <= 0) {
            crab.state = 'idle';
            crab.timer = 1.5 + Math.random() * 3.0;
          } else {
            dir.normalize();
            const speed = 0.6;
            crab.position.addScaledVector(dir, speed * delta);
            crab.position.y = getSurfaceHeightNear(crab.position.x, 15, crab.position.z);
            
            const targetAngle = Math.atan2(dir.x, dir.z);
            crab.rotation.y = targetAngle;
            
            if (crab.legs) {
              crab.legs.forEach((leg, idx) => {
                const phase = idx % 2 === 0 ? 1 : -1;
                leg.rotation.y = (idx % 2 === 0 ? 0.3 : Math.PI - 0.3) + Math.sin(time * 12.0) * 0.3 * phase;
              });
            }
          }
        }
      }
    });
  }

  // 2. Submerged Fish (steer in water, wiggle tails)
  if (game.fishes) {
    game.fishes.forEach(fish => {
      const distToPlayer = fish.position.distanceTo(playerPos);
      if (distToPlayer > 60.0) {
        return; // Distance culling
      }
      
      fish.swimTimer -= delta;
      
      if (fish.swimTimer <= 0) {
        fish.swimTimer = 2.0 + Math.random() * 3.0;
        fish.velocity.set(
          (Math.random() - 0.5) * 1.5,
          (Math.random() - 0.5) * 0.3,
          (Math.random() - 0.5) * 1.5
        );
        if (fish.isLakeFish) {
          fish.targetY = 12.0 + Math.random() * 1.8;
        } else {
          fish.targetY = 1.3 + Math.random() * 2.0;
        }
      }
      
      fish.position.addScaledVector(fish.velocity, delta);
      fish.position.y += (fish.targetY - fish.position.y) * delta * 1.5;
      
      if (fish.isLakeFish) {
        // Stay within lake circle (center 41.6, 41.6, radius 24m)
        const dx = fish.position.x - 41.6;
        const dz = fish.position.z - 41.6;
        const dist = Math.sqrt(dx*dx + dz*dz);
        if (dist > 20.0) {
          const toLakeCenter = tempFishVec1.set(41.6, fish.position.y, 41.6).sub(fish.position);
          toLakeCenter.y = 0;
          toLakeCenter.normalize();
          fish.velocity.copy(toLakeCenter).multiplyScalar(1.2);
          fish.swimTimer = 2.0;
        }
      } else {
        const terrainY = getSurfaceHeightNear(fish.position.x, 15, fish.position.z);
        if (terrainY > 3.8 || fish.position.x < 2 || fish.position.x > mapWidth - 2 || fish.position.z < 2 || fish.position.z > mapLength - 2) {
          const toCenter = tempFishVec1.set(mapWidth / 2, fish.position.y, mapLength / 2).sub(fish.position);
          toCenter.y = 0;
          toCenter.normalize();
          
          if (terrainY > 3.8) {
            fish.velocity.copy(toCenter).negate().multiplyScalar(1.2);
          } else {
            fish.velocity.copy(toCenter).multiplyScalar(1.2);
          }
          fish.swimTimer = 2.0;
        }
      }
      
      const swimDir = tempSwimDir.copy(fish.velocity);
      swimDir.y = 0;
      if (swimDir.lengthSq() > 0.001) {
        swimDir.normalize();
        const targetAngle = Math.atan2(swimDir.x, swimDir.z);
        fish.rotation.y = targetAngle;
      }
      
      if (fish.tail) {
        fish.tail.rotation.y = Math.sin(time * 14.0) * 0.45;
      }
    });
  }

  // 2b. Wiggling worms near the dead seagull
  if (game.worms) {
    game.worms.forEach(worm => {
      if (worm.segments && worm.segments.length >= 2) {
        const wiggleSpeed = worm.wiggleSpeed || 8.0;
        const offset = worm.wiggleOffset || 0;
        worm.segments[0].rotation.y = Math.sin(time * wiggleSpeed + offset) * 0.25;
        worm.segments[1].rotation.y = Math.sin(time * wiggleSpeed + offset + 1.2) * 0.25;
      }
    });
  }

  // 3. Flying Seagulls (circular orbit, flap wings)
  if (game.seagulls) {
    game.seagulls.forEach(gull => {
      const distToPlayer = gull.position.distanceTo(playerPos);
      if (distToPlayer > 60.0) {
        return; // Distance culling
      }
      
      const orb = gull.orbit;
      orb.angle += orb.speed * delta;
      
      const targetX = orb.cx + Math.cos(orb.angle) * orb.radius;
      const targetZ = orb.cz + Math.sin(orb.angle) * orb.radius;
      
      gull.position.set(targetX, orb.height, targetZ);
      
      const tx = -Math.sin(orb.angle);
      const tz = Math.cos(orb.angle);
      gull.rotation.y = Math.atan2(tx, tz);
      
      if (gull.leftWing && gull.rightWing) {
        gull.leftWing.rotation.z = Math.sin(time * 8.5) * 0.48;
        gull.rightWing.rotation.z = -Math.sin(time * 8.5) * 0.48;
      }
    });
  }
}
