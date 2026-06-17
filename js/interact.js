import * as THREE from 'three';
import { game } from './game.js';
import { world, deformTerrainLowPoly, getSurfaceHeightNear } from './world.js';
import { player, showHudMessage, selectSlot } from './player.js';
import { getTranslation } from './lang.js';

let raycaster;
const activeDebris = [];
let closestDebris = null;
export let nearFeedbackBoard = false;

// Initialize Raycasting and keyboard listeners for interaction
export function initInteraction() {
  raycaster = new THREE.Raycaster();

  // Listen for the "E" harvest key
  document.addEventListener('keydown', (e) => {
    if (game.pointerLocked && e.code === 'KeyE') {
      if (nearFeedbackBoard) {
        if (typeof window.openFeedbackBoard === 'function') {
          window.openFeedbackBoard();
        }
      } else if (closestDebris) {
        harvestClosestDebris();
      }
    }
  });
}

// Triggered when left clicking to mine
export function updateInteraction(delta) {
  // Update physics for all active debris pieces
  updateDebrisPhysics(delta);

  // Check if any debris is near the player to show the "PRESS E" prompt
  checkHarvestablePrompt();

  // If the player is swinging the pickaxe, check for hit at the peak of the swing
  // The swing duration is 0.25s. We cast a ray near the start (e.g. when swinging is active)
  if (player.swinging && player.swingTimer > 0.1 && player.swingTimer < 0.15) {
    // Perform hit detection once per click
    if (!player.hasHitThisSwing) {
      performMiningRaycast();
      player.hasHitThisSwing = true;
    }
  }

  if (!player.swinging) {
    player.hasHitThisSwing = false;
  }
}

// Perform raycast from camera center to detect terrain or ore deposit hits
function performMiningRaycast() {
  // We only mine if pickaxe is selected (Slot 7, index 6)
  if (player.selectedSlot !== 6) return;

  // Set raycaster from center of the screen
  raycaster.setFromCamera(new THREE.Vector2(0, 0), game.camera);

  // Targets: terrain and ore deposits
  const targets = [];
  if (world.terrainMesh) targets.push(world.terrainMesh);
  
  // Flatten ore groups to test their children meshes
  const oreMeshes = [];
  world.oreDeposits.forEach(group => {
    group.children.forEach(child => {
      oreMeshes.push(child);
    });
  });

  // Test terrain intersection
  const terrainIntersections = raycaster.intersectObjects(targets);
  // Test ore intersection
  const oreIntersections = raycaster.intersectObjects(oreMeshes);

  let hitObject = null;
  let hitPoint = null;
  let hitNormal = null;
  let hitDistance = Infinity;
  let isOreHit = false;
  let oreGroupRef = null;

  // Check if we hit an ore deposit first (since they overlap the terrain)
  if (oreIntersections.length > 0 && oreIntersections[0].distance < 4.0) {
    const hit = oreIntersections[0];
    hitObject = hit.object;
    hitPoint = hit.point;
    hitNormal = hit.face.normal.clone().applyQuaternion(hitObject.getWorldQuaternion(new THREE.Quaternion()));
    hitDistance = hit.distance;
    isOreHit = true;
    
    // Find parent group of this crystal
    let parent = hitObject.parent;
    while (parent && !parent.name.startsWith('ore_')) {
      parent = parent.parent;
    }
    oreGroupRef = parent;
  }

  // Check if terrain hit is closer
  if (terrainIntersections.length > 0 && terrainIntersections[0].distance < 4.0) {
    const hit = terrainIntersections[0];
    if (hit.distance < hitDistance) {
      hitObject = hit.object;
      hitPoint = hit.point;
      hitNormal = hit.face.normal;
      hitDistance = hit.distance;
      isOreHit = false;
      oreGroupRef = null;
    }
  }

  // If hit was successful and in range
  if (hitPoint && hitDistance < 4.0) {
    if (isOreHit && oreGroupRef) {
      // 1. Spawns shiny gold ore debris
      spawnDebris(hitPoint, hitNormal, true);
      showHudMessage(getTranslation('msg_mined'));
      
      // Shrink the gold crystals slightly to show decay
      oreGroupRef.scale.subScalar(0.12);
      
      // If shrunk too small, destroy the deposit
      if (oreGroupRef.scale.x < 0.5) {
        // Explode into extra debris
        for (let i = 0; i < 4; i++) {
          spawnDebris(hitPoint, hitNormal, true);
        }
        game.scene.remove(oreGroupRef);
        // Remove from world array
        const idx = world.oreDeposits.indexOf(oreGroupRef);
        if (idx > -1) world.oreDeposits.splice(idx, 1);
        
        showHudMessage(getTranslation('msg_depleted'));
      }
    } else {
      // 2. Generic terrain hits: deform (carve crater) and spawn stone debris
      deformTerrainLowPoly(hitPoint, 1.8, 1.2);
      spawnDebris(hitPoint, hitNormal, false);
    }
  }
}

// Spawns a physical low-poly debris chunk that falls and bounces
function spawnDebris(position, normal, isOre) {
  // Low-poly geometry (small angular shapes)
  const geom = new THREE.DodecahedronGeometry(0.12, 0);
  
  // Materials
  const mat = isOre 
    ? new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.2, metalness: 0.9, emissive: 0xffa500, emissiveIntensity: 0.2, flatShading: true })
    : new THREE.MeshStandardMaterial({ color: 0x8a7f76, roughness: 0.9, flatShading: true });

  const mesh = new THREE.Mesh(geom, mat);
  
  // Shift position slightly outward from surface
  mesh.position.copy(position).addScaledVector(normal, 0.1);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  
  // Set physical trajectory
  // Add randomized dispersion based on hit normal + upward thrust
  const velocity = normal.clone()
    .add(new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.6 + 0.4, (Math.random() - 0.5) * 0.8))
    .normalize()
    .multiplyScalar(3.0 + Math.random() * 2.0);

  const debrisObj = {
    mesh: mesh,
    velocity: velocity,
    isOre: isOre,
    onGround: false,
    lifeTime: 25.0 // Debris decays after 25s if not collected
  };

  game.scene.add(mesh);
  activeDebris.push(debrisObj);
}

// Simulates bouncing physics and ground snap for debris
function updateDebrisPhysics(delta) {
  const gravity = 9.8;
  const bounceDamp = 0.35;
  const friction = 2.0;

  for (let i = activeDebris.length - 1; i >= 0; i--) {
    const debris = activeDebris[i];
    
    // Apply lifetime decay
    debris.lifeTime -= delta;
    if (debris.lifeTime <= 0) {
      game.scene.remove(debris.mesh);
      activeDebris.splice(i, 1);
      continue;
    }

    if (!debris.onGround) {
      // Apply gravity
      debris.velocity.y -= gravity * delta;
      
      // Update position
      debris.mesh.position.addScaledVector(debris.velocity, delta);

      // Check ground collision
      const groundY = getSurfaceHeightNear(debris.mesh.position.x, debris.mesh.position.y, debris.mesh.position.z);
      
      if (debris.mesh.position.y <= groundY + 0.05) {
        // Collide! Snap to surface
        debris.mesh.position.y = groundY + 0.05;

        // Check if velocity is low enough to stop bouncing
        if (debris.velocity.y > -1.2) {
          debris.onGround = true;
          debris.velocity.set(0, 0, 0);
        } else {
          // Bounce
          debris.velocity.y = -debris.velocity.y * bounceDamp;
          debris.velocity.x *= 0.6;
          debris.velocity.z *= 0.6;
        }
      }
    } else {
      // Gently rotate on ground for styling
      debris.mesh.rotation.y += 0.5 * delta;
    }
  }
}

// Detect if any gold ore is close to display E prompt
function checkHarvestablePrompt() {
  if (!game.controls) return;

  const playerPos = game.controls.getObject().position;
  let foundCloseDebris = null;
  let minDist = 2.2; // Maximum collection distance

  activeDebris.forEach(debris => {
    // Only collect gold ore for objective
    if (debris.isOre) {
      const dist = playerPos.distanceTo(debris.mesh.position);
      if (dist < minDist) {
        minDist = dist;
        foundCloseDebris = debris;
      }
    }
  });

  closestDebris = foundCloseDebris;

  // Check proximity to feedback board
  nearFeedbackBoard = false;
  if (world.feedbackBoard) {
    const distToBoard = playerPos.distanceTo(world.feedbackBoard.position);
    if (distToBoard < 3.0) {
      nearFeedbackBoard = true;
    }
  }

  const prompt = document.getElementById('interaction-prompt');
  if (closestDebris) {
    prompt.innerHTML = getTranslation('interact_harvest').replace('E', '<span style="color: #ffd700; font-weight:800;">E</span>');
    prompt.classList.add('visible');
  } else if (nearFeedbackBoard) {
    prompt.innerHTML = getTranslation('interact_board').replace('E', '<span style="color: #ffd700; font-weight:800;">E</span>');
    prompt.classList.add('visible');
  } else {
    prompt.classList.remove('visible');
  }
}

// Harvest nearest item
function harvestClosestDebris() {
  if (!closestDebris) return;

  // Remove mesh
  game.scene.remove(closestDebris.mesh);
  
  // Remove from active list
  const index = activeDebris.indexOf(closestDebris);
  if (index > -1) {
    activeDebris.splice(index, 1);
  }

  // Update player inventory
  player.inventory.ore += 1;
  showHudMessage(getTranslation('msg_collected'));

  // Sync to HUD Hotbar Slot 8 (which we use for collected Gold Ore display)
  // Update Slot 8 text and count
  const slot8 = document.querySelector('.hotbar-slot[data-slot="7"]');
  if (slot8) {
    const label = slot8.querySelector('.slot-label');
    const count = slot8.querySelector('.slot-count');
    const icon = slot8.querySelector('.slot-icon');

    if (label) label.innerText = getTranslation('hotbar.ore');
    if (icon) icon.innerText = "🪙";
    if (count) count.innerText = `x${player.inventory.ore}`;
  }

  // Check objective update
  if (player.inventory.ore >= 5) {
    document.getElementById('objective-text').innerText = getTranslation('obj_complete');
    document.getElementById('objective-text').style.color = "#00ff88";
    showHudMessage(getTranslation('msg_goal_complete'));
  } else {
    document.getElementById('objective-text').innerText = getTranslation('obj_progress', { val: player.inventory.ore });
  }

  closestDebris = null;
}
