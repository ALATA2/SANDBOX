import * as THREE from 'three';
import { game } from './game.js';
import { world, deformTerrainLowPoly, getSurfaceHeightNear, createCampfireMesh } from './world.js';
import { player, showHudMessage, selectSlot } from './player.js';
import { getTranslation } from './lang.js';
import { playWoodChop, playSelect, playSizzling } from './audio.js';

let raycaster;
const activeDebris = [];
let closestDebris = null;
export let nearFeedbackBoard = false;
let closestCampfireForCooking = null;
let campfireHologram = null;

// Initialize Raycasting and keyboard listeners for interaction
export function initInteraction() {
  raycaster = new THREE.Raycaster();

  // Listen for the "E" harvest key and Escape for campfire cancel
  document.addEventListener('keydown', (e) => {
    if (game.isPlacingCampfire && e.key === 'Escape') {
      cancelCampfirePlacement();
      return;
    }

    if (game.pointerLocked && e.code === 'KeyE') {
      if (nearFeedbackBoard) {
        if (typeof window.openFeedbackBoard === 'function') {
          window.openFeedbackBoard();
        }
      } else if (closestCampfireForCooking) {
        cookRawMeat();
      } else if (closestDebris) {
        harvestClosestDebris();
      }
    }
  });

  // Listen for placing/canceling campfires via mouse buttons
  document.addEventListener('mousedown', (e) => {
    if (game.isPlacingCampfire && game.pointerLocked) {
      if (e.button === 0) { // Left click
        placeCampfire();
      } else if (e.button === 2) { // Right click
        cancelCampfirePlacement();
      }
    }
  });
}

// Triggered when left clicking to mine / chop
export function updateInteraction(delta) {
  // Update physics for all active debris pieces
  updateDebrisPhysics(delta);

  // Check if any debris is near the player to show the "PRESS E" prompt
  checkHarvestablePrompt();

  // Update campfire placement hologram positioning
  if (game.isPlacingCampfire && campfireHologram) {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), game.camera);
    const targets = [];
    if (world.terrainMesh) targets.push(world.terrainMesh);
    const intersections = raycaster.intersectObjects(targets);
    if (intersections.length > 0 && intersections[0].distance < 6.0) {
      campfireHologram.position.copy(intersections[0].point);
      campfireHologram.visible = true;
    } else {
      const dir = new THREE.Vector3();
      game.camera.getWorldDirection(dir);
      dir.y = 0;
      dir.normalize();
      
      const playerPos = game.controls.getObject().position;
      const targetPos = playerPos.clone().addScaledVector(dir, 3.0);
      const groundY = getSurfaceHeightNear(targetPos.x, 15, targetPos.z);
      targetPos.y = groundY;
      
      campfireHologram.position.copy(targetPos);
      campfireHologram.visible = true;
    }
  }

  // If the player is swinging a tool, check for hit at the peak of the swing
  // The swing duration is 0.25s. We cast a ray near the start (e.g. when swinging is active)
  if (player.swinging && player.swingTimer > 0.1 && player.swingTimer < 0.15) {
    // Perform hit detection once per click
    if (!player.hasHitThisSwing) {
      performToolsRaycast();
      player.hasHitThisSwing = true;
    }
  }

  if (!player.swinging) {
    player.hasHitThisSwing = false;
  }

  // Animate falling trees
  for (let i = world.trees.length - 1; i >= 0; i--) {
    const treeGroup = world.trees[i];
    if (treeGroup.userData && treeGroup.userData.falling) {
      treeGroup.userData.fallTimer += delta;
      
      const fallDuration = 1.5;
      const progress = Math.min(1.0, treeGroup.userData.fallTimer / fallDuration);
      
      const rotationAxis = new THREE.Vector3(0, 1, 0)
        .cross(treeGroup.userData.fallDirection)
        .normalize();
        
      const targetAngle = progress * (Math.PI / 2);
      const prevAngle = (Math.max(0, treeGroup.userData.fallTimer - delta) / fallDuration) * (Math.PI / 2);
      const deltaAngle = targetAngle - prevAngle;
      
      treeGroup.rotateOnWorldAxis(rotationAxis, deltaAngle);
      
      // When tree finishes falling, clean up and spawn 3 wood debris logs
      if (progress >= 1.0) {
        game.scene.remove(treeGroup);
        
        // Remove from world.sceneryMeshes
        const scenIdx = world.sceneryMeshes.findIndex(item => item.mesh === treeGroup);
        if (scenIdx > -1) world.sceneryMeshes.splice(scenIdx, 1);
        
        // Remove from world.trees
        world.trees.splice(i, 1);
        
        // Spawn 3 collectible wood logs
        for (let j = 0; j < 3; j++) {
          const spawnPos = treeGroup.position.clone();
          spawnPos.x += (Math.random() - 0.5) * 1.5;
          spawnPos.z += (Math.random() - 0.5) * 1.5;
          const groundY = getSurfaceHeightNear(spawnPos.x, 15, spawnPos.z);
          spawnPos.y = groundY + 0.15;
          
          spawnDebris(spawnPos, new THREE.Vector3(0, 1, 0), 'wood');
        }
      }
    }
  }
}

// Route raycast based on held tool (Spear vs Axe vs Pickaxe)
function performToolsRaycast() {
  if (player.selectedSlot === 0) {
    performSpearRaycast();
  } else if (player.selectedSlot === 6) {
    performMiningRaycast();
  } else if (player.selectedSlot === 1) {
    performWoodcuttingRaycast();
  }
}

// Raycast for hunting crabs/fishes when holding the Spear
function performSpearRaycast() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), game.camera);

  const faunaMeshes = [];
  const meshToGroupMap = new Map();

  game.crabs.forEach(group => {
    group.traverse(child => {
      if (child.isMesh) {
        faunaMeshes.push(child);
        meshToGroupMap.set(child, { type: 'crab', group: group });
      }
    });
  });

  game.fishes.forEach(group => {
    group.traverse(child => {
      if (child.isMesh) {
        faunaMeshes.push(child);
        meshToGroupMap.set(child, { type: 'fish', group: group });
      }
    });
  });

  const intersections = raycaster.intersectObjects(faunaMeshes);

  if (intersections.length > 0 && intersections[0].distance < 4.0) {
    const hit = intersections[0];
    const hitMesh = hit.object;
    const hitInfo = meshToGroupMap.get(hitMesh);

    if (hitInfo) {
      playWoodChop(); // reuse sharp wood chop sound as general hit impact
      const targetGroup = hitInfo.group;
      const hitNormal = hit.face.normal.clone().applyQuaternion(hitMesh.getWorldQuaternion(new THREE.Quaternion()));

      game.scene.remove(targetGroup);

      if (hitInfo.type === 'crab') {
        const idx = game.crabs.indexOf(targetGroup);
        if (idx > -1) game.crabs.splice(idx, 1);
        spawnDebris(hit.point, hitNormal, 'raw_crab');
        showHudMessage(getTranslation('msg_hunted_crab') || 'Hunted crab!');
      } else {
        const idx = game.fishes.indexOf(targetGroup);
        if (idx > -1) game.fishes.splice(idx, 1);
        spawnDebris(hit.point, hitNormal, 'raw_fish');
        showHudMessage(getTranslation('msg_hunted_fish') || 'Hunted fish!');
      }
    }
  }
}

// Raycast for tree felling when holding the Axe
function performWoodcuttingRaycast() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), game.camera);

  const treeMeshes = [];
  const meshToGroupMap = new Map();

  world.trees.forEach(group => {
    if (group.userData && !group.userData.falling) {
      group.traverse(child => {
        if (child.isMesh) {
          treeMeshes.push(child);
          meshToGroupMap.set(child, group);
        }
      });
    }
  });

  const intersections = raycaster.intersectObjects(treeMeshes);

  if (intersections.length > 0 && intersections[0].distance < 4.0) {
    const hit = intersections[0];
    const hitMesh = hit.object;
    const treeGroup = meshToGroupMap.get(hitMesh);

    if (treeGroup && treeGroup.userData) {
      playWoodChop();

      const hitNormal = hit.face.normal.clone().applyQuaternion(hitMesh.getWorldQuaternion(new THREE.Quaternion()));
      spawnDebris(hit.point, hitNormal, 'wood');

      treeGroup.userData.health -= 1;
      showHudMessage(getTranslation('msg_chopped') || 'Chop!');

      if (treeGroup.userData.health <= 0) {
        treeGroup.userData.falling = true;
        treeGroup.userData.fallTimer = 0;
        
        const playerPos = game.controls.getObject().position.clone();
        playerPos.y = treeGroup.position.y;
        const fallDirection = treeGroup.position.clone().sub(playerPos).normalize();
        treeGroup.userData.fallDirection = fallDirection;

        showHudMessage(getTranslation('msg_tree_felled') || 'Tree felled!');
      }
    }
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
      spawnDebris(hitPoint, hitNormal, 'ore');
      showHudMessage(getTranslation('msg_mined'));
      
      // Shrink the gold crystals slightly to show decay
      oreGroupRef.scale.subScalar(0.12);
      
      // If shrunk too small, destroy the deposit
      if (oreGroupRef.scale.x < 0.5) {
        // Explode into extra debris
        for (let i = 0; i < 4; i++) {
          spawnDebris(hitPoint, hitNormal, 'ore');
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
      spawnDebris(hitPoint, hitNormal, 'stone');
    }
  }
}

// Spawns a physical low-poly debris chunk that falls and bounces
export function spawnDebris(position, normal, type) {
  let geom, mat;
  if (type === 'wood') {
    geom = new THREE.CylinderGeometry(0.06, 0.06, 0.35, 5); // horizontal low-poly log
    geom.rotateZ(Math.PI / 2);
    mat = new THREE.MeshStandardMaterial({ color: 0x825a3c, roughness: 0.9, flatShading: true });
  } else if (type === 'ore') {
    geom = new THREE.DodecahedronGeometry(0.12, 0);
    mat = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.2, metalness: 0.9, emissive: 0xffa500, emissiveIntensity: 0.2, flatShading: true });
  } else if (type === 'raw_crab') {
    geom = new THREE.BoxGeometry(0.15, 0.08, 0.15);
    mat = new THREE.MeshStandardMaterial({ color: 0xe05544, roughness: 0.8, flatShading: true });
  } else if (type === 'raw_fish') {
    geom = new THREE.ConeGeometry(0.08, 0.25, 4);
    geom.rotateX(Math.PI / 2);
    mat = new THREE.MeshStandardMaterial({ color: 0xa8b7c0, roughness: 0.5, flatShading: true });
  } else if (type === 'cooked_meat') {
    geom = new THREE.BoxGeometry(0.16, 0.1, 0.1);
    mat = new THREE.MeshStandardMaterial({ color: 0x5c2e16, roughness: 0.9, flatShading: true });
  } else {
    geom = new THREE.DodecahedronGeometry(0.12, 0);
    mat = new THREE.MeshStandardMaterial({ color: 0x8a7f76, roughness: 0.9, flatShading: true });
  }

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
    type: type,
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

// Detect if any collectible debris or campfire is close to display E prompt
function checkHarvestablePrompt() {
  if (!game.controls) return;

  const playerPos = game.controls.getObject().position;
  let foundCloseDebris = null;
  let minDist = 2.2; // Maximum collection distance

  activeDebris.forEach(debris => {
    if (debris.type === 'ore' || debris.type === 'wood' || debris.type === 'raw_crab' || debris.type === 'raw_fish' || debris.type === 'cooked_meat') {
      const dist = playerPos.distanceTo(debris.mesh.position);
      if (dist < minDist) {
        minDist = dist;
        foundCloseDebris = debris;
      }
    }
  });

  closestDebris = foundCloseDebris;

  // Proximity to campfires for cooking
  closestCampfireForCooking = null;
  if (world.campfires) {
    let minCampfireDist = 2.5;
    world.campfires.forEach(campfire => {
      const dist = playerPos.distanceTo(campfire.position);
      if (dist < minCampfireDist) {
        // Only trigger prompt if the player actually has something to cook
        if (player.inventory.raw_crab > 0 || player.inventory.raw_fish > 0) {
          minCampfireDist = dist;
          closestCampfireForCooking = campfire;
        }
      }
    });
  }

  // Check proximity to feedback board
  nearFeedbackBoard = false;
  if (world.feedbackBoard) {
    const distToBoard = playerPos.distanceTo(world.feedbackBoard.position);
    if (distToBoard < 3.0) {
      nearFeedbackBoard = true;
    }
  }

  const prompt = document.getElementById('interaction-prompt');
  if (closestCampfireForCooking) {
    const rawPrompt = getTranslation('interact_cook') || 'PRESS E TO COOK MEAT';
    prompt.innerHTML = rawPrompt.replace('E', '<span style="color: #ffd700; font-weight:800;">E</span>');
    prompt.classList.add('visible');
  } else if (closestDebris) {
    let rawPrompt = '';
    if (closestDebris.type === 'wood') {
      rawPrompt = getTranslation('interact_harvest_wood') || 'PRESS E TO HARVEST WOOD';
    } else if (closestDebris.type === 'ore') {
      rawPrompt = getTranslation('interact_harvest') || 'PRESS E TO HARVEST ORE';
    } else if (closestDebris.type === 'raw_crab') {
      rawPrompt = getTranslation('interact_harvest_crab') || 'PRESS E TO HARVEST RAW CRAB';
    } else if (closestDebris.type === 'raw_fish') {
      rawPrompt = getTranslation('interact_harvest_fish') || 'PRESS E TO HARVEST RAW FISH';
    } else if (closestDebris.type === 'cooked_meat') {
      rawPrompt = getTranslation('interact_harvest_cooked') || 'PRESS E TO HARVEST COOKED MEAT';
    } else {
      rawPrompt = 'PRESS E TO HARVEST';
    }
    prompt.innerHTML = rawPrompt.replace('E', '<span style="color: #ffd700; font-weight:800;">E</span>');
    prompt.classList.add('visible');
  } else if (nearFeedbackBoard) {
    prompt.innerHTML = getTranslation('interact_board').replace('E', '<span style="color: #ffd700; font-weight:800;">E</span>');
    prompt.classList.add('visible');
  } else {
    prompt.classList.remove('visible');
  }
}

// Harvest nearest item
export function harvestClosestDebris() {
  if (!closestDebris) return;

  // Remove mesh
  game.scene.remove(closestDebris.mesh);
  
  // Remove from active list
  const index = activeDebris.indexOf(closestDebris);
  if (index > -1) {
    activeDebris.splice(index, 1);
  }

  if (closestDebris.type === 'wood') {
    // Update player inventory for wood
    player.inventory.wood += 1;
    showHudMessage(getTranslation('msg_collected_wood') || '+1 Wood');

    // Sync to HUD Hotbar Slot 6 (Wood is data-slot="5")
    const slot6 = document.querySelector('.hotbar-slot[data-slot="5"]');
    if (slot6) {
      const count = slot6.querySelector('.slot-count');
      if (count) count.innerText = `x${player.inventory.wood}`;
    }
  } else if (closestDebris.type === 'ore') {
    // Update player inventory for gold ore
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
  } else if (closestDebris.type === 'raw_crab') {
    player.inventory.raw_crab += 1;
    showHudMessage(getTranslation('msg_collected_raw_crab') || '+1 Raw Crab');
  } else if (closestDebris.type === 'raw_fish') {
    player.inventory.raw_fish += 1;
    showHudMessage(getTranslation('msg_collected_raw_fish') || '+1 Raw Fish');
  } else if (closestDebris.type === 'cooked_meat') {
    player.inventory.cooked_meat += 1;
    showHudMessage(getTranslation('msg_collected_cooked') || '+1 Cooked Meat');
  }

  closestDebris = null;
}

// Cook raw meat at a nearby campfire
function cookRawMeat() {
  if (!closestCampfireForCooking) return;

  if (player.inventory.raw_crab > 0) {
    player.inventory.raw_crab--;
    // Spawn cooked meat debris at the campfire's position
    const spawnPos = closestCampfireForCooking.position.clone();
    spawnPos.y += 0.25;
    spawnDebris(spawnPos, new THREE.Vector3(0, 1, 0), 'cooked_meat');
    playSizzling();
    showHudMessage(getTranslation('msg_cooked_crab') || 'Cooked Crab Meat!');
  } else if (player.inventory.raw_fish > 0) {
    player.inventory.raw_fish--;
    const spawnPos = closestCampfireForCooking.position.clone();
    spawnPos.y += 0.25;
    spawnDebris(spawnPos, new THREE.Vector3(0, 1, 0), 'cooked_meat');
    playSizzling();
    showHudMessage(getTranslation('msg_cooked_fish') || 'Cooked Fish Meat!');
  }
}

// Start campfire holographic placement mode
export function startCampfirePlacement() {
  if (!player.inventory.campfire || player.inventory.campfire <= 0) return;

  if (campfireHologram) {
    cancelCampfirePlacement();
  }

  game.isPlacingCampfire = true;
  campfireHologram = createCampfireMesh(true);
  game.scene.add(campfireHologram);
}

// Cancel holographic placement mode
export function cancelCampfirePlacement() {
  if (campfireHologram) {
    game.scene.remove(campfireHologram);
    campfireHologram = null;
  }
  game.isPlacingCampfire = false;
}

// Place the real campfire on the ground
function placeCampfire() {
  if (!campfireHologram || !player.inventory.campfire || player.inventory.campfire <= 0) return;

  const realCampfire = createCampfireMesh(false);
  realCampfire.position.copy(campfireHologram.position);
  realCampfire.rotation.copy(campfireHologram.rotation);

  game.scene.add(realCampfire);
  world.campfires.push(realCampfire);

  // Deduct campfire from inventory
  player.inventory.campfire--;

  playSelect();
  showHudMessage(getTranslation('msg_placed_campfire') || 'Placed campfire!');

  cancelCampfirePlacement();
}
