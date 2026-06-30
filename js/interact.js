import * as THREE from 'three';
import { game } from './game.js';
import { world, deformTerrainLowPoly, getSurfaceHeightNear, createCampfireMesh, getVertexVirtualDepth, getWaterHeightAt, createFoundationMesh, createWallMesh, createRoofMesh, createDoorMesh } from './world.js';
import { player, showHudMessage, selectSlot, syncHotbarCounts, renderInventoryUI, cancelFishing, getActiveAxe, getActivePickaxe, getActiveSpear } from './player.js';
import { getTranslation, currentLang } from './lang.js';
import { playWoodChop, playSelect, playSizzling, playDrink, playSpark, playRowingSplash } from './audio.js';
import { getBlockChemicalComposition, analyzeBlockComposition, scanAndUnlock } from './chemistry.js';

let raycaster;
export const activeDebris = [];
let closestDebris = null;
export let nearFeedbackBoard = false;
let closestCampfire = null;
let closestBerryBush = null;
let structureHologram = null;
let closestWorkstation = null;
let closestDoor = null;

// Initialize Raycasting and keyboard listeners for interaction
export function initInteraction() {
  raycaster = new THREE.Raycaster();

  // Listen for the "E" harvest key and Escape / R for structure placement
  document.addEventListener('keydown', (e) => {
    if (game.isPlacingStructure) {
      if (e.key === 'Escape') {
        cancelStructurePlacement();
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        if (structureHologram) {
          structureHologram.userData.rotationOffset = (structureHologram.userData.rotationOffset || 0) + Math.PI / 2;
          playSelect();
        }
        return;
      }
    }

    if (game.pointerLocked && e.code === 'KeyE') {
      const playerPos = game.controls.getObject().position;

      // Handle doors interaction first
      if (closestDoor) {
        closestDoor.userData.isOpen = !closestDoor.userData.isOpen;
        closestDoor.userData.targetAngle = closestDoor.userData.isOpen ? Math.PI * 0.6 : 0;
        playSelect();
        return;
      }

      // 0. Prioritize Spectrometer scanning if held
      const holdingSpectrometer = player.equipped && player.equipped.right_hand === 'spectrometer';
      if (holdingSpectrometer && world.terrainMesh) {
        raycaster.setFromCamera(new THREE.Vector2(0, 0), game.camera);
        const intersects = raycaster.intersectObject(world.terrainMesh);
        if (intersects.length > 0 && intersects[0].distance < 4.0) {
          const hit = intersects[0];
          const virtualDepth = getVertexVirtualDepth(hit.point.x, hit.point.y, hit.point.z);

          // Unlock element knowledge
          const unlocked = scanAndUnlock(hit.point.x, virtualDepth, hit.point.z);
          if (unlocked.length > 0) {
            unlocked.forEach(el => {
              const elName = getTranslation(`inv.${el}`) || el;
              showHudMessage(`${currentLang === 'it' ? 'ELEMENTO SCOPERTO' : 'DISCOVERED ELEMENT'}: ${elName.toUpperCase()}!`);
            });
          }

          // Build report
          const report = analyzeBlockComposition(hit.point.x, virtualDepth, hit.point.z, currentLang);
          let reportStr = getTranslation('msg_scanned') || "Analyzed block composition!";
          if (report && report.length > 0) {
            const topLines = report.slice(0, 3).map(item => `${item.name}: ${item.pct.toFixed(1)}%`);
            reportStr += " | " + topLines.join(" | ");
          }
          showHudMessage(reportStr);
          playSelect();
          return;
        }
      }

      const raftPos = new THREE.Vector3(80.0, 4.05, 127.2);
      const distToRaft = playerPos.distanceTo(raftPos);
      if (distToRaft < 3.5) {
        if (!game.raftConstructed) {
          // Construct the raft!
          if ((player.inventory.wood || 0) >= 4 && (player.inventory.rope || 0) >= 2 && (player.inventory.stick || 0) >= 2) {
            player.inventory.wood -= 4;
            player.inventory.rope -= 2;
            player.inventory.stick -= 2;
            
            // Sync HUD Hotbar Slots counts
            const slot6 = document.querySelector('.hotbar-slot[data-slot="5"]');
            if (slot6) {
              const count = slot6.querySelector('.slot-count');
              if (count) count.innerText = `x${player.inventory.wood}`;
            }
            const slot5 = document.querySelector('.hotbar-slot[data-slot="4"]');
            if (slot5) {
              const count = slot5.querySelector('.slot-count');
              if (count) count.innerText = `x${player.inventory.rope}`;
            }
            
            if (typeof renderInventoryUI === 'function') {
              renderInventoryUI();
            }
            
            game.raftConstructed = true;
            if (world.raftMesh) world.raftMesh.visible = true;
            if (world.raftBlueprint) world.raftBlueprint.visible = false;
            
            playSpark(); // Wood assembly click effect
            showHudMessage(getTranslation('msg_raft_repaired') || "Raft Constructed! Ready to sail.");
            
            const objTextEl = document.getElementById('objective-text');
            if (objTextEl) {
              objTextEl.textContent = getTranslation('obj_sail_explore') || "Sail and explore other islands";
              objTextEl.style.color = "#ffd700";
            }
          } else {
            showHudMessage(getTranslation('msg_need_mats_raft') || "Needs 4 logs, 2 lianas, and 2 sticks!");
          }
        } else {
          // Toggle sailing mode
          if (game.raftState) {
            game.raftState.active = !game.raftState.active;
            if (game.raftState.active) {
              showHudMessage(getTranslation('msg_press_sail') || "Press E to Sail Raft");
            } else {
              showHudMessage(getTranslation('msg_press_disembark') || "Press E to Disembark");
              const playerObj = game.controls.getObject();
              // Teleport them slightly to the side of the raft so they aren't stuck inside it
              playerObj.position.x += 1.5;
            }
          }
        }
        return;
      }

      let nearRosita = false;
      if (game.henMesh) {
        const distToHen = playerPos.distanceTo(game.henMesh.position);
        if (distToHen < 2.5) {
          nearRosita = true;
        }
      }

      if (nearFeedbackBoard) {
        if (typeof window.openFeedbackBoard === 'function') {
          window.openFeedbackBoard();
        }
      } else if (nearRosita) {
        feedRosita();
      } else if (closestBerryBush) {
        gatherBerries();
      } else if (closestWorkstation && closestWorkstation.type === 'furnace') {
        const isSmelting = closestWorkstation.mesh.userData && closestWorkstation.mesh.userData.active;
        if (!isSmelting) {
          let oreType = null;
          let productType = null;
          let oreCost = 0;
          
          if ((player.inventory.raw_titanium || 0) >= 3) {
            oreType = 'raw_titanium';
            productType = 'titanium_plate';
            oreCost = 3;
          } else if ((player.inventory.raw_copper || 0) >= 2) {
            oreType = 'raw_copper';
            productType = 'copper_ingot';
            oreCost = 2;
          } else if ((player.inventory.raw_silicon || 0) >= 2) {
            oreType = 'raw_silicon';
            productType = 'glass';
            oreCost = 2;
          }

          if (oreType) {
            let fuelType = null;
            let fuelCost = 0;
            if ((player.inventory.wood || 0) >= 1) {
              fuelType = 'wood';
              fuelCost = 1;
            } else if ((player.inventory.leaves || 0) >= 2) {
              fuelType = 'leaves';
              fuelCost = 2;
            }

            if (fuelType) {
              player.inventory[oreType] -= oreCost;
              player.inventory[fuelType] -= fuelCost;

              closestWorkstation.mesh.userData.active = true;
              closestWorkstation.mesh.userData.smeltTimer = 5.0;
              closestWorkstation.mesh.userData.productType = productType;
              if (closestWorkstation.mesh.userData.light) {
                closestWorkstation.mesh.userData.light.intensity = 1.5;
              }
              if (closestWorkstation.mesh.userData.fireHole) {
                closestWorkstation.mesh.userData.fireHole.material.emissiveIntensity = 1.0;
              }

              playSizzling();
              showHudMessage(currentLang === 'it' ? "FUSIONE INIZIATA..." : "SMELTING INITIATED...");
              renderInventoryUI();
            } else {
              showHudMessage(currentLang === 'it' ? "Manca il combustibile!" : "Missing fuel!");
            }
          } else {
            showHudMessage(currentLang === 'it' ? "Nessun minerale da fondere!" : "No smeltable ores in inventory!");
          }
        }
      } else if (closestCampfire) {
        const isBurning = closestCampfire.userData && closestCampfire.userData.burnTime > 0;
        const hasCharcoal = closestCampfire.userData && closestCampfire.userData.hasCharcoal;
        if (isBurning) {
          cookRawMeat();
        } else if (hasCharcoal) {
          closestCampfire.userData.hasCharcoal = false;
          player.inventory.charcoal = (player.inventory.charcoal || 0) + 1;
          playSelect();
          showHudMessage(player.currentLang === 'it' ? "+1 Carbonella" : "+1 Charcoal");
          syncHotbarCounts();
          renderInventoryUI();
        } else {
          showHudMessage(getTranslation('msg_fire_is_out') || "The fire is out! Add fuel to light it.");
        }
      } else if (closestDebris) {
        harvestClosestDebris();
      }
    }

    if (game.pointerLocked && e.code === 'KeyF') {
      if (closestCampfire) {
        addFuelToCampfire();
      }
    }
  });

  // Listen for placing/canceling structures via mouse buttons
  document.addEventListener('mousedown', (e) => {
    if (game.isPlacingStructure && game.pointerLocked) {
      if (e.button === 0) { // Left click
        placeStructure();
      } else if (e.button === 2) { // Right click
        cancelStructurePlacement();
      }
    }
  });
}

// Triggered when left clicking to mine / chop
export function updateInteraction(delta) {
  // Update active fishing state
  if (player.isFishing) {
    player.fishingTimer += delta;

    if (player.bobberMesh) {
      const time = game.time;
      const baseHeight = player.fishingWaterY || 4.0;

      if (player.fishingState === 'cast') {
        // Bobber floats/wiggles gently
        player.bobberMesh.position.y = baseHeight - 0.02 + Math.sin(time * 4.0) * 0.015;
        player.bobberMesh.rotation.z = Math.sin(time * 2.0) * 0.05;

        // Check if a fish bites
        if (player.fishingTimer >= player.fishingBiteTime) {
          player.fishingState = 'bite';
          player.fishingBiteTimer = 1.5; // 1.5 seconds to react
          showHudMessage(getTranslation('msg_fishing_bite') || "A FISH IS BITING! CLICK TO REEL IN!");
          playRowingSplash();
        }
      } else if (player.fishingState === 'bite') {
        player.fishingBiteTimer -= delta;

        // Bobber vibrates/sinks aggressively
        player.bobberMesh.position.y = baseHeight - 0.08 + Math.sin(time * 30.0) * 0.02;

        if (player.fishingBiteTimer <= 0) {
          // Fish escaped!
          player.isFishing = false;
          player.fishingState = 'idle';
          if (player.bobberMesh) {
            game.scene.remove(player.bobberMesh);
            player.bobberMesh = null;
          }
          showHudMessage(getTranslation('msg_fishing_escaped') || "The fish got away!");
        }
      }

      // Proximity check: cancel if player walks too far
      const playerObj = game.controls.getObject();
      if (playerObj) {
        const dist = playerObj.position.distanceTo(player.bobberMesh.position);
        if (dist > 15.0) {
          cancelFishing();
        }
      }
    }
  }

  // Update physics for all active debris pieces
  updateDebrisPhysics(delta);

  // Check if any debris is near the player to show the "PRESS E" prompt
  checkHarvestablePrompt();

  // Update structure placement hologram positioning
  if (game.isPlacingStructure && structureHologram) {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), game.camera);
    const targets = [];
    if (world.terrainMesh) targets.push(world.terrainMesh);
    
    // Intersect placed structures to allow snapping
    const structureMeshes = [];
    if (world.placedStructures) {
      world.placedStructures.forEach(struct => {
        struct.traverse(child => {
          if (child.isMesh) structureMeshes.push(child);
        });
      });
    }

    const intersections = raycaster.intersectObjects([...targets, ...structureMeshes]);
    if (intersections.length > 0 && intersections[0].distance < 6.0) {
      const hitPoint = intersections[0].point;
      
      let snapped = false;
      const type = game.placingStructureType;
      
      let closestSnapDist = Infinity;
      const snapPos = new THREE.Vector3();
      let snapRotationY = 0;
      
      if (world.placedStructures && world.placedStructures.length > 0) {
        for (let i = 0; i < world.placedStructures.length; i++) {
          const other = world.placedStructures[i];
          const otherType = other.userData.type;
          const otherPos = other.position;
          
          const dx = hitPoint.x - otherPos.x;
          const dz = hitPoint.z - otherPos.z;
          const dist2D = Math.sqrt(dx * dx + dz * dz);
          
          if (dist2D < 4.0) {
            const otherRotY = other.rotation.y;
            
            if (otherType === 'foundation') {
              if (type === 'foundation') {
                const offsets = [
                  { x: 3.2, z: 0 },
                  { x: -3.2, z: 0 },
                  { x: 0, z: 3.2 },
                  { x: 0, z: -3.2 }
                ];
                for (const offset of offsets) {
                  const rotatedOffset = new THREE.Vector3(offset.x, 0, offset.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), otherRotY);
                  const p = otherPos.clone().add(rotatedOffset);
                  const d = hitPoint.distanceTo(p);
                  if (d < 1.5 && d < closestSnapDist) {
                    closestSnapDist = d;
                    snapPos.copy(p);
                    snapRotationY = otherRotY;
                    snapped = true;
                  }
                }
              } else if (type === 'wall' || type === 'door') {
                const offsets = [
                  { x: 1.6, z: 0, rot: Math.PI / 2 },
                  { x: -1.6, z: 0, rot: -Math.PI / 2 },
                  { x: 0, z: 1.6, rot: 0 },
                  { x: 0, z: -1.6, rot: Math.PI }
                ];
                for (const offset of offsets) {
                  const rotatedOffset = new THREE.Vector3(offset.x, 0, offset.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), otherRotY);
                  const p = otherPos.clone().add(rotatedOffset);
                  p.y += 0.1;
                  const d = hitPoint.distanceTo(p);
                  if (d < 1.5 && d < closestSnapDist) {
                    closestSnapDist = d;
                    snapPos.copy(p);
                    snapRotationY = otherRotY + offset.rot;
                    snapped = true;
                  }
                }
              }
            } else if (otherType === 'wall' || otherType === 'door') {
              if (type === 'roof' || type === 'primitive_roof' || type === 'wood_roof') {
                const p = otherPos.clone();
                p.y += 2.4;
                const d = hitPoint.distanceTo(p);
                if (d < 1.5 && d < closestSnapDist) {
                  closestSnapDist = d;
                  snapPos.copy(p);
                  snapRotationY = otherRotY;
                  snapped = true;
                }
              } else if (type === 'wall' || type === 'door') {
                const p = otherPos.clone();
                p.y += 2.4;
                const d = hitPoint.distanceTo(p);
                if (d < 1.5 && d < closestSnapDist) {
                  closestSnapDist = d;
                  snapPos.copy(p);
                  snapRotationY = otherRotY;
                  snapped = true;
                }
              }
            }
          }
        }
      }
      
      const rotationOffset = structureHologram.userData.rotationOffset || 0;
      
      if (snapped) {
        structureHologram.position.copy(snapPos);
        structureHologram.rotation.set(0, snapRotationY + rotationOffset, 0);
      } else {
        structureHologram.position.copy(hitPoint);
        if (type === 'foundation') {
          structureHologram.position.y = Math.floor(hitPoint.y * 5) / 5;
        }
        
        const dir = new THREE.Vector3();
        game.camera.getWorldDirection(dir);
        const yaw = Math.atan2(-dir.x, -dir.z);
        const snappedYaw = Math.round(yaw / (Math.PI / 4)) * (Math.PI / 4);
        structureHologram.rotation.set(0, snappedYaw + rotationOffset, 0);
      }
      structureHologram.visible = true;
    } else {
      const dir = new THREE.Vector3();
      game.camera.getWorldDirection(dir);
      dir.y = 0;
      dir.normalize();
      
      const playerPos = game.controls.getObject().position;
      const targetPos = playerPos.clone().addScaledVector(dir, 3.0);
      const groundY = getSurfaceHeightNear(targetPos.x, 15, targetPos.z);
      targetPos.y = groundY;
      
      const rotationOffset = structureHologram.userData.rotationOffset || 0;
      const yaw = Math.atan2(-dir.x, -dir.z);
      const snappedYaw = Math.round(yaw / (Math.PI / 4)) * (Math.PI / 4);
      
      structureHologram.position.copy(targetPos);
      structureHologram.rotation.set(0, snappedYaw + rotationOffset, 0);
      structureHologram.visible = true;
    }
  }

  // Update smelting timers on active furnaces
  if (world.placedWorkstations) {
    world.placedWorkstations.forEach(ws => {
      if (ws.type === 'furnace' && ws.mesh.userData && ws.mesh.userData.active) {
        ws.mesh.userData.smeltTimer -= delta;
        if (ws.mesh.userData.light) {
          ws.mesh.userData.light.intensity = 1.5 + Math.sin(game.time * 20.0) * 0.3;
        }
        if (ws.mesh.userData.smeltTimer <= 0) {
          ws.mesh.userData.active = false;
          ws.mesh.userData.smeltTimer = 0;
          if (ws.mesh.userData.light) ws.mesh.userData.light.intensity = 0.0;
          if (ws.mesh.userData.fireHole) ws.mesh.userData.fireHole.material.emissiveIntensity = 0.0;

          // Spawn smelting product
          const product = ws.mesh.userData.productType;
          const spawnPos = ws.position.clone();
          spawnPos.z += 0.35;
          spawnPos.y += 0.2;
          spawnDebris(spawnPos, new THREE.Vector3(0, 1, 0), product);
          showHudMessage(`${getTranslation(`inv.${product}`) || product.toUpperCase()} SMELTED!`);
        }
      }
    });
  }

  // Animate placed doors opening/closing
  if (world.placedStructures) {
    world.placedStructures.forEach(struct => {
      if (struct.userData.type === 'door') {
        const doorPanel = struct.getObjectByName('doorPanel');
        if (doorPanel) {
          const target = struct.userData.targetAngle || 0;
          const curr = doorPanel.rotation.y;
          doorPanel.rotation.y = THREE.MathUtils.lerp(curr, target, 10.0 * delta);
        }
      }
    });
  }

  // If the player is swinging a tool, check for hit at the peak of the swing
  if (player.swinging && player.swingTimer <= player.swingDuration * 0.6) {
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

// Route raycast based on held tool (Spear vs Axe vs Pickaxe, or custom stick/cane)
function performToolsRaycast() {
  if (player.activeCustomItem === 'fishing_rod') {
    handleFishingInteraction();
    return;
  }

  if (performCaneRaycast()) {
    return;
  }

  if (player.selectedSlot === 0 || player.activeCustomItem === 'stick' || player.activeCustomItem === 'cane') {
    performSpearRaycast();
  } else if (player.selectedSlot === 6) {
    performMiningRaycast();
  } else if (player.selectedSlot === 1) {
    performWoodcuttingRaycast();
    performSpearRaycast(); // Allow hunting with Axe!
  } else if (player.selectedSlot === 2) {
    drinkWater(); // Drink water on slot 3 selection click
  }
}

// Raycast for cane plants
function performCaneRaycast() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), game.camera);

  const caneMeshes = [];
  const meshToGroupMap = new Map();

  world.canes.forEach(group => {
    if (group.userData && !group.userData.broken) {
      group.traverse(child => {
        if (child.isMesh) {
          caneMeshes.push(child);
          meshToGroupMap.set(child, group);
        }
      });
    }
  });

  const intersections = raycaster.intersectObjects(caneMeshes);

  if (intersections.length > 0 && intersections[0].distance < 4.0) {
    const hit = intersections[0];
    const hitMesh = hit.object;
    const caneGroup = meshToGroupMap.get(hitMesh);

    if (caneGroup && caneGroup.userData) {
      playWoodChop();

      const hitNormal = hit.face.normal.clone().applyQuaternion(hitMesh.getWorldQuaternion(new THREE.Quaternion()));
      spawnDebris(hit.point, hitNormal, 'cane');

      caneGroup.userData.health -= 1;
      showHudMessage(getTranslation('msg_cane_hit') || 'Hit cane!');

      if (caneGroup.userData.health <= 0) {
        caneGroup.userData.broken = true;
        game.scene.remove(caneGroup);

        // Remove from world.sceneryMeshes
        const scenIdx = world.sceneryMeshes.findIndex(item => item.mesh === caneGroup);
        if (scenIdx > -1) world.sceneryMeshes.splice(scenIdx, 1);

        // Remove from world.canes
        const caneIdx = world.canes.indexOf(caneGroup);
        if (caneIdx > -1) world.canes.splice(caneIdx, 1);

        // Spawn 2 extra cane debris
        for (let i = 0; i < 2; i++) {
          const spawnPos = caneGroup.position.clone();
          spawnPos.x += (Math.random() - 0.5) * 1.0;
          spawnPos.z += (Math.random() - 0.5) * 1.0;
          const groundY = getSurfaceHeightNear(spawnPos.x, 15, spawnPos.z);
          spawnPos.y = groundY + 0.15;
          spawnDebris(spawnPos, new THREE.Vector3(0, 1, 0), 'cane');
        }

        showHudMessage(getTranslation('msg_cane_broken') || 'Cane broken!');
      }
      return true; // Hit handled
    }
  }
  return false;
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

      const activeAxe = getActiveAxe();
      let dmg = activeAxe === 'primitive_axe' ? 0.5 : 1.0;
      if (player.energy < 10) dmg *= 0.5; // low stamina reduces chopping power
      treeGroup.userData.health -= dmg;
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
      
      // Shrink the gold crystals slightly to show decay (slower if low stamina)
      const shrinkVal = player.energy < 10 ? 0.06 : 0.12;
      oreGroupRef.scale.subScalar(shrinkVal);
      
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
      // 2. Generic terrain hits: deform (carve crater) and spawn chemistry or stone debris
      const virtualDepth = getVertexVirtualDepth(hitPoint.x, hitPoint.y, hitPoint.z);
      const deformRadius = player.energy < 10 ? 0.9 : 1.8;
      const deformDepth = player.energy < 10 ? 0.6 : 1.2;
      deformTerrainLowPoly(hitPoint, deformRadius, deformDepth);

      const comp = getBlockChemicalComposition(hitPoint.x, virtualDepth, hitPoint.z);
      let spawned = false;
      const rand = Math.random() * 100;
      let accum = 0;

      // Priority list: check rare resources first
      const checkElements = ['Au', 'Ag', 'U', 'Nh', 'Ti', 'Cu', 'Si'];
      for (const el of checkElements) {
        const pct = comp[el] || 0;
        if (pct > 0.5) {
          accum += pct;
          if (rand < accum * 1.5) {
            let dropType = 'stone';
            if (el === 'Au') dropType = 'ore';
            else if (el === 'Si') dropType = 'raw_silicon';
            else if (el === 'Cu') dropType = 'raw_copper';
            else if (el === 'Ti') dropType = 'raw_titanium';
            else if (el === 'U') dropType = 'uranium';

            spawnDebris(hitPoint, hitNormal, dropType);
            spawned = true;
            break;
          }
        }
      }

      if (!spawned) {
        if (player.energy >= 10 || Math.random() > 0.5) {
          spawnDebris(hitPoint, hitNormal, 'stone');
        } else {
          showHudMessage(player.currentLang === 'it' ? "Troppo stanco per scavare pietre!" : "Too tired to harvest stone!");
        }
      }
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
  } else if (type === 'stick') {
    geom = new THREE.CylinderGeometry(0.015, 0.015, 0.4, 5);
    geom.rotateZ(Math.PI / 2);
    mat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9, flatShading: true });
  } else if (type === 'cane') {
    geom = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5);
    geom.rotateZ(Math.PI / 2);
    mat = new THREE.MeshStandardMaterial({ color: 0x556b2f, roughness: 0.8, flatShading: true });
  } else if (type === 'egg') {
    geom = new THREE.SphereGeometry(0.08, 8, 8);
    geom.scale(0.8, 1.25, 0.8);
    mat = new THREE.MeshStandardMaterial({ color: 0xfffcf0, roughness: 0.7, flatShading: true });
  } else if (type === 'silicon' || type === 'raw_silicon') {
    geom = new THREE.DodecahedronGeometry(0.1, 0);
    mat = new THREE.MeshStandardMaterial({ color: 0x99ccff, roughness: 0.8, flatShading: true });
  } else if (type === 'copper' || type === 'raw_copper') {
    geom = new THREE.DodecahedronGeometry(0.11, 0);
    mat = new THREE.MeshStandardMaterial({ color: 0xa0522d, roughness: 0.8, flatShading: true });
  } else if (type === 'copper_ingot') {
    geom = new THREE.BoxGeometry(0.18, 0.04, 0.06);
    mat = new THREE.MeshStandardMaterial({ color: 0xd87a50, roughness: 0.2, metalness: 0.9, flatShading: true });
  } else if (type === 'titanium' || type === 'raw_titanium') {
    geom = new THREE.DodecahedronGeometry(0.12, 0);
    mat = new THREE.MeshStandardMaterial({ color: 0x708090, roughness: 0.8, flatShading: true });
  } else if (type === 'titanium_plate') {
    geom = new THREE.BoxGeometry(0.16, 0.02, 0.16);
    mat = new THREE.MeshStandardMaterial({ color: 0xb0c4de, roughness: 0.2, metalness: 0.9, flatShading: true });
  } else if (type === 'sharp_stone') {
    geom = new THREE.DodecahedronGeometry(0.09, 0);
    mat = new THREE.MeshStandardMaterial({ color: 0x5a544f, roughness: 0.9, flatShading: true });
  } else if (type === 'plank') {
    geom = new THREE.BoxGeometry(0.25, 0.02, 0.08);
    mat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9, flatShading: true });
  } else if (type === 'stone_block') {
    geom = new THREE.BoxGeometry(0.16, 0.08, 0.08);
    mat = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.9, flatShading: true });
  } else if (type === 'glass') {
    geom = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.7, flatShading: true });
  } else if (type === 'uranium') {
    geom = new THREE.OctahedronGeometry(0.11, 0);
    mat = new THREE.MeshStandardMaterial({ color: 0x33cc33, roughness: 0.3, metalness: 0.5, emissive: 0x22aa22, emissiveIntensity: 0.3, flatShading: true });
  } else {
    geom = new THREE.DodecahedronGeometry(0.12, 0);
    mat = new THREE.MeshStandardMaterial({ color: 0x8a7f76, roughness: 0.9, flatShading: true });
  }

  let mesh;
  if (type === 'cooked_egg') {
    const eggGroup = new THREE.Group();
    const whiteGeom = new THREE.CylinderGeometry(0.12, 0.12, 0.015, 8);
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, flatShading: true });
    const whiteMesh = new THREE.Mesh(whiteGeom, whiteMat);
    eggGroup.add(whiteMesh);

    const yolkGeom = new THREE.SphereGeometry(0.04, 6, 6);
    yolkGeom.scale(1, 0.6, 1);
    const yolkMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.4, flatShading: true });
    const yolkMesh = new THREE.Mesh(yolkGeom, yolkMat);
    yolkMesh.position.y = 0.01;
    eggGroup.add(yolkMesh);

    mesh = eggGroup;
  } else {
    mesh = new THREE.Mesh(geom, mat);
  }
  
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

  const lifeTime = (type === 'stick' || type === 'cane') ? 999999 : 25.0;

  const debrisObj = {
    mesh: mesh,
    velocity: velocity,
    type: type,
    onGround: false,
    lifeTime: lifeTime
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
      // Gently rotate on ground for styling (except worms)
      if (debris.type !== 'worm') {
        debris.mesh.rotation.y += 0.5 * delta;
      }
    }
  }
}

// Detect if any collectible debris or campfire is close to display E prompt
function checkHarvestablePrompt() {
  if (!game.controls) return;

  const playerPos = game.controls.getObject().position;
  
  const prompt = document.getElementById('interaction-prompt');
  // 0. Spectrometer scanning prompt
  const holdingSpectrometer = player.equipped && player.equipped.right_hand === 'spectrometer';
  if (holdingSpectrometer && world.terrainMesh) {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), game.camera);
    const intersects = raycaster.intersectObject(world.terrainMesh);
    if (intersects.length > 0 && intersects[0].distance < 4.0) {
      const rawPrompt = getTranslation('interact_scan') || "PRESS E TO ANALYZE ELEMENTAL COMPOSITION";
      prompt.innerHTML = rawPrompt.replace('E', '<span style="color: #ffd700; font-weight:800;">E</span>');
      prompt.classList.add('visible');
      return;
    }
  }

  // Door raycast check
  closestDoor = null;
  if (world.placedStructures && world.placedStructures.length > 0) {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), game.camera);
    const doorMeshes = [];
    const meshToDoorMap = new Map();
    world.placedStructures.forEach(struct => {
      if (struct.userData.type === 'door') {
        struct.traverse(child => {
          if (child.isMesh) {
            doorMeshes.push(child);
            meshToDoorMap.set(child, struct);
          }
        });
      }
    });
    
    if (doorMeshes.length > 0) {
      const intersects = raycaster.intersectObjects(doorMeshes);
      if (intersects.length > 0 && intersects[0].distance < 3.5) {
        closestDoor = meshToDoorMap.get(intersects[0].object);
      }
    }
  }
  
  if (closestDoor) {
    const isOpen = closestDoor.userData.isOpen;
    const rawPrompt = isOpen ? 
      (player.currentLang === 'it' ? "PREMI E PER CHIUDERE LA PORTA" : "PRESS E TO CLOSE DOOR") : 
      (player.currentLang === 'it' ? "PREMI E PER APRIRE LA PORTA" : "PRESS E TO OPEN DOOR");
    prompt.innerHTML = rawPrompt.replace('E', '<span style="color: #ffd700; font-weight:800;">E</span>');
    prompt.classList.add('visible');
    return;
  }

  // Check proximity to raft
  const raftPos = new THREE.Vector3(80.0, 4.05, 127.2);
  const distToRaft = playerPos.distanceTo(raftPos);
  if (distToRaft < 3.5) {
    let rawPrompt = '';
    if (!game.raftConstructed) {
      const hasMats = (player.inventory.wood || 0) >= 4 && (player.inventory.rope || 0) >= 2 && (player.inventory.stick || 0) >= 2;
      if (hasMats) {
        rawPrompt = getTranslation('msg_press_construct') || "PRESS E TO CONSTRUCT RAFT";
      } else {
        rawPrompt = getTranslation('msg_need_mats_raft') || "CONSTRUCT RAFT (NEEDS 4 LOGS, 2 LIANAS, 2 STICKS)";
      }
    } else {
      if (game.raftState && game.raftState.active) {
        rawPrompt = getTranslation('msg_press_disembark') || "PRESS E TO DISEMBARK";
      } else {
        rawPrompt = getTranslation('msg_press_sail') || "PRESS E TO SAIL RAFT";
      }
    }
    prompt.innerHTML = rawPrompt.replace('E', '<span style="color: #ffd700; font-weight:800;">E</span>');
    prompt.classList.add('visible');
    return;
  }

  // Check proximity to placed workstations
  closestWorkstation = null;
  if (world.placedWorkstations) {
    let minWSDist = 2.2;
    world.placedWorkstations.forEach(ws => {
      const dist = playerPos.distanceTo(ws.position);
      if (dist < minWSDist) {
        minWSDist = dist;
        closestWorkstation = ws;
      }
    });
  }

  if (closestWorkstation) {
    if (closestWorkstation.type === 'furnace') {
      const isSmelting = closestWorkstation.mesh.userData && closestWorkstation.mesh.userData.active;
      if (isSmelting) {
        const rawPrompt = currentLang === 'it' ? 'FUSIONE IN CORSO...' : 'SMELTING IN PROGRESS...';
        prompt.innerText = rawPrompt;
        prompt.classList.add('visible');
        return;
      } else {
        const hasFuel = (player.inventory.wood || 0) >= 1 || (player.inventory.leaves || 0) >= 2;
        const hasOres = (player.inventory.raw_titanium || 0) >= 3 || (player.inventory.raw_copper || 0) >= 2 || (player.inventory.raw_silicon || 0) >= 2;
        
        let rawPrompt = '';
        if (hasOres && hasFuel) {
          rawPrompt = getTranslation('interact_smelt') || "PRESS E TO SMELT ORES";
        } else if (!hasOres) {
          rawPrompt = currentLang === 'it' ? "FORNACE (Richiede Rame/Silicio/Titanio grezzo)" : "FURNACE (Needs raw Copper/Silicon/Titanium)";
        } else {
          rawPrompt = currentLang === 'it' ? "FORNACE (Richiede Combustibile: 1 Legno o 2 Foglie)" : "FURNACE (Needs Fuel: 1 Wood or 2 Leaves)";
        }
        prompt.innerHTML = rawPrompt.replace('E', '<span style="color: #ffd700; font-weight:800;">E</span>');
        prompt.classList.add('visible');
        return;
      }
    } else if (closestWorkstation.type === 'workbench') {
      const rawPrompt = currentLang === 'it' ? "VICINO AL BANCO DA LAVORO" : "NEAR WORKBENCH";
      prompt.innerText = rawPrompt;
      prompt.classList.add('visible');
    } else if (closestWorkstation.type === 'lab_table') {
      const rawPrompt = currentLang === 'it' ? "VICINO AL TAVOLO DA LABORATORIO" : "NEAR LAB TABLE";
      prompt.innerText = rawPrompt;
      prompt.classList.add('visible');
    }
  }

  // Check proximity to Rosita the Hen
  let nearRosita = false;
  if (game.henMesh) {
    const distToHen = playerPos.distanceTo(game.henMesh.position);
    if (distToHen < 2.5) {
      nearRosita = true;
    }
  }
  
  if (nearRosita) {
    let rawPrompt = '';
    const hasWorm = (player.inventory.worm || 0) > 0;
    if (hasWorm) {
      rawPrompt = getTranslation('interact_feed_hen') || "PRESS E TO FEED ROSITA (1 Worm)";
    } else {
      rawPrompt = "ROSITA (Needs 1 Worm)";
    }
    prompt.innerHTML = rawPrompt.replace('E', '<span style="color: #ffd700; font-weight:800;">E</span>');
    prompt.classList.add('visible');
    return;
  }

  // Check proximity to wild berry bushes
  closestBerryBush = null;
  if (world.berryBushes) {
    let minBerryDist = 2.2;
    world.berryBushes.forEach(bush => {
      if (bush.userData && bush.userData.hasBerries) {
        const dist = playerPos.distanceTo(bush.position);
        if (dist < minBerryDist) {
          minBerryDist = dist;
          closestBerryBush = bush;
        }
      }
    });
  }

  if (closestBerryBush) {
    const rawPrompt = getTranslation('interact_harvest_berries') || "PRESS E TO GATHER BERRIES";
    prompt.innerHTML = rawPrompt.replace('E', '<span style="color: #ffd700; font-weight:800;">E</span>');
    prompt.classList.add('visible');
    return;
  }

  let foundCloseDebris = null;
  let minDist = 2.2; // Maximum collection distance

  activeDebris.forEach(debris => {
    if (debris.type) {
      const dist = playerPos.distanceTo(debris.mesh.position);
      if (dist < minDist) {
        minDist = dist;
        foundCloseDebris = debris;
      }
    }
  });

  closestDebris = foundCloseDebris;

  // Proximity to campfires
  closestCampfire = null;
  if (world.campfires) {
    let minCampfireDist = 2.5;
    world.campfires.forEach(campfire => {
      const dist = playerPos.distanceTo(campfire.position);
      if (dist < minCampfireDist) {
        minCampfireDist = dist;
        closestCampfire = campfire;
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

  const hasRawMeat = (player.inventory.raw_crab || 0) > 0 || (player.inventory.raw_fish || 0) > 0 || (player.inventory.egg || 0) > 0;

  if (closestCampfire) {
    const isBurning = closestCampfire.userData && closestCampfire.userData.burnTime > 0;
    const hasIgnition = (player.inventory.stone || 0) >= 2 && (player.inventory.leaves || 0) >= 1;
    
    let rawPrompt = '';
    const fuelVal = Math.round(closestCampfire.userData ? closestCampfire.userData.burnTime : 0);
    
    if (isBurning) {
      if (hasRawMeat) {
        rawPrompt = getTranslation('interact_cook_fuel', { fuel: fuelVal }) || `PRESS E TO COOK MEAT / PRESS F TO ADD FUEL (Fuel: ${fuelVal}s)`;
      } else {
        rawPrompt = getTranslation('interact_fuel_only', { fuel: fuelVal }) || `PRESS F TO ADD FUEL (Fuel: ${fuelVal}s)`;
      }
    } else {
      if (closestCampfire.userData && closestCampfire.userData.hasCharcoal) {
        rawPrompt = player.currentLang === 'it' ? `PREMI E PER RACCOGLIERE CARBONELLA` : `PRESS E TO COLLECT CHARCOAL`;
      } else if (hasIgnition) {
        rawPrompt = getTranslation('interact_relight') || `PRESS F TO LIGHT FIRE (2 Stones & 1 Leaf)`;
      } else {
        rawPrompt = getTranslation('msg_fire_out') || `FIRE IS OUT (Needs 2 Stones & 1 Leaf)`;
      }
    }
    
    let rendered = rawPrompt.replace('E', '<span style="color: #ffd700; font-weight:800;">E</span>');
    rendered = rendered.replace('F', '<span style="color: #ffd700; font-weight:800;">F</span>');
    prompt.innerHTML = rendered;
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
    } else if (closestDebris.type === 'worm') {
      rawPrompt = getTranslation('interact_harvest_worm') || 'PRESS E TO COLLECT WORM';
    } else if (closestDebris.type === 'egg') {
      rawPrompt = getTranslation('interact_harvest_egg') || 'PRESS E TO COLLECT EGG';
    } else if (closestDebris.type === 'cooked_egg') {
      rawPrompt = getTranslation('interact_harvest_cooked_egg') || 'PRESS E TO COLLECT COOKED EGG';
    } else if (closestDebris.type === 'stick') {
      rawPrompt = getTranslation('interact_harvest_stick') || 'PRESS E TO COLLECT STICK';
    } else if (closestDebris.type === 'cane') {
      rawPrompt = getTranslation('interact_harvest_cane') || 'PRESS E TO COLLECT CANE';
    } else if (closestDebris.type === 'fallen_log') {
      rawPrompt = getTranslation('interact_harvest_log') || 'PRESS E TO COLLECT FALLEN LOG';
    } else if (closestDebris.type === 'liana') {
      rawPrompt = getTranslation('interact_harvest_liana') || 'PRESS E TO COLLECT LIANA';
    } else {
      const displayName = getTranslation(`inv.${closestDebris.type}`) || closestDebris.type;
      const actText = currentLang === 'it' ? 'PREMI E PER RACCOGLIERE' : 'PRESS E TO COLLECT';
      rawPrompt = `${actText} ${displayName.toUpperCase()}`;
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
  } else if (closestDebris.type === 'fallen_log') {
    player.inventory.wood += 1;
    showHudMessage(getTranslation('msg_collected_log') || '+1 Wood (Fallen Log)');
    const slot6 = document.querySelector('.hotbar-slot[data-slot="5"]');
    if (slot6) {
      const count = slot6.querySelector('.slot-count');
      if (count) count.innerText = `x${player.inventory.wood}`;
    }
  } else if (closestDebris.type === 'liana') {
    player.inventory.rope += 1;
    showHudMessage(getTranslation('msg_collected_liana') || '+1 Rope (Liana)');
    const slot5 = document.querySelector('.hotbar-slot[data-slot="4"]');
    if (slot5) {
      const count = slot5.querySelector('.slot-count');
      if (count) count.innerText = `x${player.inventory.rope}`;
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
  } else if (closestDebris.type === 'stick') {
    player.inventory.stick += 1;
    showHudMessage(getTranslation('msg_collected_stick') || '+1 Stick');
  } else if (closestDebris.type === 'cane') {
    player.inventory.cane += 1;
    showHudMessage(getTranslation('msg_collected_cane') || '+1 Cane');
  } else if (closestDebris.type === 'worm') {
    player.inventory.worm = (player.inventory.worm || 0) + 1;
    showHudMessage(getTranslation('msg_collected_worm') || '+1 Worm');
    // Remove from game.worms array so it stops wiggling in updateWorld
    const wIdx = game.worms.indexOf(closestDebris.mesh);
    if (wIdx > -1) {
      game.worms.splice(wIdx, 1);
    }
  } else if (closestDebris.type === 'egg') {
    player.inventory.egg = (player.inventory.egg || 0) + 1;
    showHudMessage(getTranslation('msg_collected_egg') || '+1 Egg');
  } else if (closestDebris.type === 'cooked_egg') {
    player.inventory.cooked_egg = (player.inventory.cooked_egg || 0) + 1;
    showHudMessage(getTranslation('msg_collected_cooked_egg') || '+1 Cooked Egg');
  } else {
    // Dynamic fallback for all new chemistry items
    player.inventory[closestDebris.type] = (player.inventory[closestDebris.type] || 0) + 1;
    const name = getTranslation(`inv.${closestDebris.type}`) || closestDebris.type;
    showHudMessage(`+1 ${name}`);
  }

  closestDebris = null;
}

// Cook raw meat at a nearby campfire
function cookRawMeat() {
  if (!closestCampfire) return;

  if (player.inventory.raw_crab > 0) {
    player.inventory.raw_crab--;
    // Spawn cooked meat debris at the campfire's position
    const spawnPos = closestCampfire.position.clone();
    spawnPos.y += 0.25;
    spawnDebris(spawnPos, new THREE.Vector3(0, 1, 0), 'cooked_meat');
    playSizzling();
    showHudMessage(getTranslation('msg_cooked_crab') || 'Cooked Crab Meat!');
  } else if (player.inventory.raw_fish > 0) {
    player.inventory.raw_fish--;
    const spawnPos = closestCampfire.position.clone();
    spawnPos.y += 0.25;
    spawnDebris(spawnPos, new THREE.Vector3(0, 1, 0), 'cooked_meat');
    playSizzling();
    showHudMessage(getTranslation('msg_cooked_fish') || 'Cooked Fish Meat!');
  } else if (player.inventory.egg > 0) {
    player.inventory.egg--;
    const spawnPos = closestCampfire.position.clone();
    spawnPos.y += 0.25;
    spawnDebris(spawnPos, new THREE.Vector3(0, 1, 0), 'cooked_egg');
    playSizzling();
    showHudMessage(getTranslation('msg_cooked_egg') || 'Cooked Egg!');
  }
}

function feedRosita() {
  const hasWorm = (player.inventory.worm || 0) > 0;
  if (hasWorm && game.henMesh) {
    player.inventory.worm--;
    
    // Trigger hop animation in AI loop
    game.henMesh.userData.feedReaction = 1.5;
    
    // Spawn egg debris slightly behind the hen
    const spawnPos = game.henMesh.position.clone();
    const angle = game.henMesh.rotation.y;
    spawnPos.x -= Math.sin(angle) * 0.4;
    spawnPos.z -= Math.cos(angle) * 0.4;
    spawnPos.y += 0.1;
    
    spawnDebris(spawnPos, new THREE.Vector3(0, 1, 0), 'egg');
    
    playSelect();
    showHudMessage(getTranslation('msg_hen_laid_egg') || "Rosita laid an egg!");
    
    syncHotbarCounts();
    renderInventoryUI();
  }
}

function handleFishingInteraction() {
  if (player.isFishing) {
    // Reel in!
    if (player.fishingState === 'bite') {
      player.isFishing = false;
      player.fishingState = 'idle';
      
      if (player.bobberMesh) {
        game.scene.remove(player.bobberMesh);
        player.bobberMesh = null;
      }
      
      playRowingSplash();
      
      const rand = Math.random();
      if (rand < 0.9) {
        player.inventory.raw_fish = (player.inventory.raw_fish || 0) + 1;
        showHudMessage(getTranslation('msg_fishing_caught') || "Caught a fish!");
      } else {
        player.inventory.ore = (player.inventory.ore || 0) + 1;
        showHudMessage("+1 Gold Ore");
      }
      
      syncHotbarCounts();
      renderInventoryUI();
    } else {
      // Reeled in too early
      player.isFishing = false;
      player.fishingState = 'idle';
      if (player.bobberMesh) {
        game.scene.remove(player.bobberMesh);
        player.bobberMesh = null;
      }
      showHudMessage(getTranslation('msg_fishing_early') || "Reeled in too early!");
    }
  } else {
    // Cast rod!
    if (!player.inventory.worm || player.inventory.worm <= 0) {
      showHudMessage(getTranslation('msg_no_bait') || "Needs 1 Worm as bait! Collect them from the dead seagull.");
      return;
    }

    const playerObj = game.controls.getObject();
    if (!playerObj) return;
    const playerPos = playerObj.position.clone();
    const dir = new THREE.Vector3();
    game.camera.getWorldDirection(dir);

    const dx = playerPos.x - 41.6;
    const dz = playerPos.z - 41.6;
    const inLakeZone = (dx*dx + dz*dz < 24.0 * 24.0);
    const waterY = inLakeZone ? 14.4 : 4.0;

    if (dir.y < -0.05) {
      const t = (waterY - playerPos.y) / dir.y;
      if (t > 0 && t < 12.0) {
        const hitX = playerPos.x + t * dir.x;
        const hitZ = playerPos.z + t * dir.z;
        const terrainH = getSurfaceHeightNear(hitX, 15, hitZ);
        const isWater = inLakeZone || (terrainH < 4.0);

        if (isWater) {
          // Consume 1 worm as bait
          player.inventory.worm--;
          syncHotbarCounts();
          renderInventoryUI();

          // Spawn bobber mesh
          const bobberGeom = new THREE.SphereGeometry(0.06, 6, 6);
          const bobberMat = new THREE.MeshStandardMaterial({ color: 0xff3b30, roughness: 0.5, flatShading: true });
          const bobberMesh = new THREE.Mesh(bobberGeom, bobberMat);
          bobberMesh.position.set(hitX, waterY - 0.02, hitZ);
          game.scene.add(bobberMesh);

          player.bobberMesh = bobberMesh;
          player.isFishing = true;
          player.fishingState = 'cast';
          player.fishingTimer = 0;
          player.fishingBiteTime = 3.0 + Math.random() * 3.0; // 3 to 6 seconds
          player.fishingWaterY = waterY;

          playRowingSplash();
          showHudMessage(getTranslation('msg_fishing_wait') || "Fishing... wait for a bite!");
        } else {
          showHudMessage("Must cast into water!");
        }
      } else {
        showHudMessage("Too far to cast!");
      }
    } else {
      showHudMessage("Look down at the water to cast!");
    }
  }
}

// Generalized structure holographic placement mode
export function startStructurePlacement(type) {
  if (!player.inventory[type] || player.inventory[type] <= 0) return;

  if (structureHologram) {
    cancelStructurePlacement();
  }

  game.isPlacingStructure = true;
  game.placingStructureType = type;

  if (type === 'campfire') {
    structureHologram = createCampfireMesh(true);
  } else if (type === 'workbench') {
    structureHologram = createWorkbenchMesh(true);
  } else if (type === 'furnace') {
    structureHologram = createFurnaceMesh(true);
  } else if (type === 'lab_table') {
    structureHologram = createLabTableMesh(true);
  } else if (type === 'foundation') {
    structureHologram = createFoundationMesh(true);
  } else if (type === 'wall') {
    structureHologram = createWallMesh(true);
  } else if (type === 'primitive_roof') {
    structureHologram = createRoofMesh(true, true);
  } else if (type === 'wood_roof') {
    structureHologram = createRoofMesh(true, false);
  } else if (type === 'door') {
    structureHologram = createDoorMesh(true);
  }

  if (structureHologram) {
    game.scene.add(structureHologram);
  }
}

// Cancel holographic placement mode
export function cancelStructurePlacement() {
  if (structureHologram) {
    game.scene.remove(structureHologram);
    structureHologram = null;
  }
  game.isPlacingStructure = false;
  game.placingStructureType = null;
}

// Place the real structure on the ground
function placeStructure() {
  const type = game.placingStructureType;
  if (!structureHologram || !type || !player.inventory[type] || player.inventory[type] <= 0) return;

  let realMesh;
  if (type === 'campfire') {
    realMesh = createCampfireMesh(false);
    realMesh.position.copy(structureHologram.position);
    realMesh.rotation.copy(structureHologram.rotation);
    game.scene.add(realMesh);
    world.campfires.push(realMesh);
  } else if (type === 'workbench' || type === 'furnace' || type === 'lab_table') {
    if (type === 'workbench') {
      realMesh = createWorkbenchMesh(false);
    } else if (type === 'furnace') {
      realMesh = createFurnaceMesh(false);
    } else if (type === 'lab_table') {
      realMesh = createLabTableMesh(false);
    }
    realMesh.position.copy(structureHologram.position);
    realMesh.rotation.copy(structureHologram.rotation);
    game.scene.add(realMesh);
    world.placedWorkstations.push({
      type: type,
      position: realMesh.position.clone(),
      mesh: realMesh
    });
  } else {
    // Modular Building blocks (foundation, wall, primitive_roof, wood_roof, door)
    if (type === 'foundation') {
      realMesh = createFoundationMesh(false);
    } else if (type === 'wall') {
      realMesh = createWallMesh(false);
    } else if (type === 'primitive_roof') {
      realMesh = createRoofMesh(false, true);
    } else if (type === 'wood_roof') {
      realMesh = createRoofMesh(false, false);
    } else if (type === 'door') {
      realMesh = createDoorMesh(false);
    }
    
    realMesh.position.copy(structureHologram.position);
    realMesh.rotation.copy(structureHologram.rotation);
    game.scene.add(realMesh);
    
    // Add type and durability metadata
    realMesh.userData.type = type;
    realMesh.userData.durability = 100;
    
    world.placedStructures.push(realMesh);
  }

  player.inventory[type]--;

  playSelect();
  const displayName = getTranslation(`inv.${type}`) || type;
  showHudMessage(`${displayName.toUpperCase()} PLACED!`);
  cancelStructurePlacement();
  renderInventoryUI();
}

// Legacy wrappers for compatibility
export function startCampfirePlacement() {
  startStructurePlacement('campfire');
}

export function cancelCampfirePlacement() {
  cancelStructurePlacement();
}

// Drink water from slot 3 (Water)
function drinkWater() {
  const playerPos = game.controls.getObject().position;
  const waterHeight = getWaterHeightAt(playerPos.x, playerPos.z);
  
  // Check if near water source
  const isNearOcean = playerPos.y <= 5.5 && waterHeight === 4.0;
  const isNearLake = playerPos.y <= 15.5 && waterHeight === 14.4;
  
  if (!isNearOcean && !isNearLake) {
    showHudMessage(player.currentLang === 'it' ? "Non c'è acqua qui! Cerca il lago di montagna o fonti dolci." : "No water here! Look for the mountain lake or fresh water.");
    return;
  }
  
  if (isNearOcean) {
    // Saltwater penalty!
    player.hydration = Math.max(0, player.hydration - 15);
    player.health = Math.max(0, player.health - 5);
    playDrink();
    showHudMessage(player.currentLang === 'it' ? "Hai bevuto acqua di mare salata! -15 Idratazione, -5 HP!" : "Drank salty seawater! -15 Hydration, -5 HP!");
  } else if (isNearLake) {
    if (player.hydration >= 100) {
      showHudMessage(getTranslation('msg_already_hydrated') || "Already hydrated!");
      return;
    }
    player.hydration = Math.min(100, player.hydration + 30);
    playDrink();
    showHudMessage(player.currentLang === 'it' ? "Hai bevuto acqua dolce fresca! +30 Idratazione" : "Drank fresh water! +30 Hydration");
  }
}

// Add fuel or light/spark the campfire using 2 stones and 1 leaf
function addFuelToCampfire() {
  if (!closestCampfire) return;

  const userData = closestCampfire.userData;
  if (!userData) return;

  const isBurning = userData.burnTime > 0;

  if (!isBurning) {
    // Requires ignition: 2 stones and 1 leaf
    if ((player.inventory.stone || 0) < 2 || (player.inventory.leaves || 0) < 1) {
      showHudMessage(getTranslation('msg_no_ignition') || "Need at least 2 Stones and 1 Leaf to light the fire!");
      return;
    }
    // Consume 1 leaf, keep stones
    player.inventory.leaves--;
    userData.burnTime = 15.0; // starts with 15s from the leaf
    playSpark();
    syncHotbarCounts();
    renderInventoryUI();
    showHudMessage(getTranslation('msg_lit_fire_spark') || "Sparked the stones and lit the fire with leaves!");
  } else {
    // Fire is already lit, just add fuel
    if (userData.burnTime >= userData.maxBurnTime) {
      showHudMessage(getTranslation('msg_fire_full') || "Campfire fuel capacity is full!");
      return;
    }

    let fuelType = null;
    let addAmount = 0;

    // Prioritize weakest first: leaves (+15), stick (+30), wood (+60)
    if ((player.inventory.leaves || 0) > 0) {
      fuelType = 'leaves';
      addAmount = 15;
    } else if ((player.inventory.stick || 0) > 0) {
      fuelType = 'stick';
      addAmount = 30;
    } else if ((player.inventory.wood || 0) > 0) {
      fuelType = 'wood';
      addAmount = 60;
    }

    if (!fuelType) {
      showHudMessage(getTranslation('msg_no_fuel') || "No fuel in inventory! (Need Leaves, Sticks, or Wood)");
      return;
    }

    player.inventory[fuelType]--;
    userData.burnTime = Math.min(userData.maxBurnTime, userData.burnTime + addAmount);
    playSelect();
    syncHotbarCounts();
    renderInventoryUI();

    const fuelName = getTranslation(`inv.${fuelType}`) || fuelType;
    showHudMessage(getTranslation('msg_added_fuel', { type: fuelName, amount: addAmount }) || `Added fuel! (${fuelName}: +${addAmount}s)`);
  }
}

// Gather berries from the closest berry bush
function gatherBerries() {
  if (!closestBerryBush || !closestBerryBush.userData.hasBerries) return;

  closestBerryBush.userData.hasBerries = false;
  closestBerryBush.userData.regrowTimer = 60.0; // 60 seconds to regrow

  // Hide the red berry mesh children
  if (closestBerryBush.userData.berriesList) {
    closestBerryBush.userData.berriesList.forEach(berry => {
      berry.visible = false;
    });
  }

  // Add 3 berries to inventory
  player.inventory.berries = (player.inventory.berries || 0) + 3;

  playSelect(); // Play picking sound (use select sound)
  showHudMessage(getTranslation('msg_collected_berries') || "+3 Wild Berries");

  syncHotbarCounts();
  renderInventoryUI();
}
