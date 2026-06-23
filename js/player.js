import * as THREE from 'three';
import { game } from './game.js';
import { moveForward, moveBackward, moveLeft, moveRight } from './controls.js';
import { getTranslation } from './lang.js';
import { playSelect } from './audio.js';
import { startCampfirePlacement } from './interact.js';

export const player = {
  health: 100,
  energy: 100,
  hydration: 100,
  selectedSlot: 6, // Starting selected slot (Slot 7 is index 6, Pickaxe)
  
  // Hand held models state
  handGroup: null,
  spearMesh: null,
  pickaxeMesh: null,
  axeMesh: null,
  stickMesh: null,
  caneMesh: null,
  activeCustomItem: null,
  
  // Tool swing animation states
  swingTimer: 0,
  swinging: false,
  swingDuration: 0.25, // seconds
  
  // Inventory counts (displayed in HUD)
  inventory: {
    ore: 0,
    stone: 1,
    wood: 5,
    leaves: 4,
    rope: 2,
    straw_hat: 0,
    explorer_vest: 1, // Start with explorer vest
    grass_pants: 0,
    wooden_boots: 0,
    raw_fish: 0,
    raw_crab: 0,
    cooked_meat: 0,
    campfire: 0,
    stick: 0,
    cane: 0,
    worm: 0
  },
  equipped: {
    head: null,
    torso: null,
    legs: null,
    feet: null,
    right_hand: null,
    left_hand: null
  }
};

// Target location (Lighthouse on distant island)
const targetLoc = new THREE.Vector3(80, -5, -120);

// Initialize player hand tools and HUD bindings
export function initPlayer() {
  // 1. Create a hand-held group and attach it to the camera
  player.handGroup = new THREE.Group();
  // Position it in bottom right corner of player screen, tilted forward/left
  player.handGroup.position.set(0.25, -0.32, -0.45);
  player.handGroup.rotation.set(-0.55, -0.65, 0.2);
  game.camera.add(player.handGroup);
  // Ensure camera child is added to scene properly (implicitly camera is in scene)

  // 2. Build Low-Poly 3D Spear
  buildSpearModel();

  // 3. Build Low-Poly 3D Pickaxe
  buildPickaxeModel();

  // Build Low-Poly 3D Axe
  buildAxeModel();

  // Build Low-Poly 3D Stick
  buildStickModel();

  // Build Low-Poly 3D Cane
  buildCaneModel();

  // 4. Set starting slot selection
  selectSlot(-1); // Start with empty hands (free hands)

  // 5. Setup Keyboard listener for slot swapping (1-8 keys) and inventory toggle
  document.addEventListener('keydown', (e) => {
    if (e.key >= '1' && e.key <= '8') {
      const idx = parseInt(e.key) - 1;
      if (player.selectedSlot === idx) {
        selectSlot(-1); // Toggle to empty hand
      } else {
        selectSlot(idx);
      }
    } else if (e.key === 'i' || e.key === 'I') {
      toggleInventory();
    }
  });

  // Setup click handler to trigger tool swing
  document.addEventListener('mousedown', (e) => {
    if (game.pointerLocked && e.button === 0) { // Left click
      triggerToolSwing();
    }
  });

  // Setup scroll wheel listener for slot swapping
  document.addEventListener('wheel', (e) => {
    if (game.pointerLocked && !game.paused) {
      let idx = player.selectedSlot;
      if (idx === -1) {
        idx = e.deltaY > 0 ? 0 : 7;
      } else {
        if (e.deltaY > 0) {
          idx = (idx + 1) % 8;
        } else if (e.deltaY < 0) {
          idx = (idx - 1 + 8) % 8;
        }
      }
      selectSlot(idx);
    }
  });

  // Setup slot clicks
  document.querySelectorAll('.hotbar-slot').forEach(slot => {
    slot.addEventListener('click', (e) => {
      const idx = parseInt(slot.getAttribute('data-slot'));
      if (!isNaN(idx)) {
        if (player.selectedSlot === idx) {
          selectSlot(-1); // Toggle to empty hand
        } else {
          selectSlot(idx);
        }
      }
    });
  });

  // Setup inventory close button click
  const closeBtn = document.getElementById('inventory-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      toggleInventory();
    });
  }

  // Setup clothing slot click listeners to unequip
  document.querySelectorAll('.clothing-slot').forEach(slot => {
    slot.addEventListener('click', () => {
      const slotType = slot.getAttribute('data-slot');
      unequipItem(slotType);
    });
  });

  // Setup mobile backpack button click
  const mobileInvBtn = document.getElementById('mobile-inv-btn');
  if (mobileInvBtn) {
    mobileInvBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      toggleInventory();
    });
  }
}

// Draw a beautiful low-poly Spear
function buildSpearModel() {
  player.spearMesh = new THREE.Group();

  const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x6e4722, roughness: 0.9, flatShading: true });
  const metalMaterial = new THREE.MeshStandardMaterial({ color: 0xb5c0c9, roughness: 0.2, metalness: 0.9, flatShading: true });

  // Wooden shaft (runs straight up along Y)
  const shaftGeom = new THREE.CylinderGeometry(0.012, 0.012, 1.1, 5);
  const shaft = new THREE.Mesh(shaftGeom, woodMaterial);
  shaft.position.y = 0.2; // Extends from y = -0.35 to y = 0.75
  player.spearMesh.add(shaft);

  // Tip base (connector)
  const tipBaseGeom = new THREE.CylinderGeometry(0.016, 0.016, 0.06, 5);
  const tipBase = new THREE.Mesh(tipBaseGeom, metalMaterial);
  tipBase.position.y = 0.75;
  player.spearMesh.add(tipBase);

  // Sharp metallic point
  const pointGeom = new THREE.ConeGeometry(0.03, 0.15, 4);
  const point = new THREE.Mesh(pointGeom, metalMaterial);
  point.position.y = 0.855; // extends up
  player.spearMesh.add(point);

  // Slight local adjustments
  player.spearMesh.position.set(-0.05, 0.05, 0);
  player.spearMesh.rotation.set(0, 0, -0.05);
  
  player.handGroup.add(player.spearMesh);
  player.spearMesh.visible = false;
}

// Draw a beautiful low-poly Pickaxe
function buildPickaxeModel() {
  player.pickaxeMesh = new THREE.Group();

  const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x543519, roughness: 0.9, flatShading: true });
  const metalMaterial = new THREE.MeshStandardMaterial({ color: 0x57616b, roughness: 0.3, metalness: 0.8, flatShading: true });
  const goldAccentMaterial = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.2, metalness: 0.9, flatShading: true });

  // Handle (shaft - straight up along Y)
  const shaftGeom = new THREE.CylinderGeometry(0.015, 0.015, 0.65, 6);
  const shaft = new THREE.Mesh(shaftGeom, woodMaterial);
  shaft.position.y = 0; // Extends from y = -0.325 to y = 0.325
  player.pickaxeMesh.add(shaft);

  // Metal head connector ring
  const ringGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.05, 6);
  const ring = new THREE.Mesh(ringGeom, goldAccentMaterial);
  ring.position.y = 0.28;
  ring.rotation.z = Math.PI / 2;
  player.pickaxeMesh.add(ring);

  // Metal Pickaxe curve (T-bar)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.28, 0);

  const side1Geom = new THREE.BoxGeometry(0.18, 0.025, 0.025);
  const side1 = new THREE.Mesh(side1Geom, metalMaterial);
  side1.rotation.z = -0.15; // angled downwards
  side1.position.x = 0.09;
  headGroup.add(side1);

  const side2Geom = new THREE.BoxGeometry(0.18, 0.025, 0.025);
  const side2 = new THREE.Mesh(side2Geom, metalMaterial);
  side2.rotation.z = 0.15; // angled downwards
  side2.position.x = -0.09;
  headGroup.add(side2);

  // Sharp pick tips
  const tip1Geom = new THREE.ConeGeometry(0.015, 0.06, 4);
  const tip1 = new THREE.Mesh(tip1Geom, metalMaterial);
  tip1.rotation.z = -Math.PI / 2 - 0.15;
  tip1.position.set(0.18, -0.018, 0);
  headGroup.add(tip1);

  const tip2Geom = new THREE.ConeGeometry(0.015, 0.06, 4);
  const tip2 = new THREE.Mesh(tip2Geom, metalMaterial);
  tip2.rotation.z = Math.PI / 2 + 0.15;
  tip2.position.set(-0.18, -0.018, 0);
  headGroup.add(tip2);

  player.pickaxeMesh.add(headGroup);

  // Rotate pickaxe 90 degrees on Y so head points forward/back (Z direction)
  player.pickaxeMesh.rotation.y = Math.PI / 2;

  player.handGroup.add(player.pickaxeMesh);
  player.pickaxeMesh.visible = false;
}

// Draw a beautiful low-poly Axe
function buildAxeModel() {
  player.axeMesh = new THREE.Group();

  const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x5c3d24, roughness: 0.9, flatShading: true }); // Warm brown handle
  const metalMaterial = new THREE.MeshStandardMaterial({ color: 0x6b7782, roughness: 0.35, metalness: 0.75, flatShading: true }); // Steel grey blade
  const wrappingMaterial = new THREE.MeshStandardMaterial({ color: 0x3d3028, roughness: 0.8, flatShading: true }); // Dark leather wrap

  // 1. Handle (shaft - straight up along Y)
  const shaftGeom = new THREE.CylinderGeometry(0.014, 0.016, 0.62, 5);
  const shaft = new THREE.Mesh(shaftGeom, woodMaterial);
  shaft.position.y = -0.05;
  player.axeMesh.add(shaft);

  // 2. Leather hand wrap at bottom
  const wrapGeom = new THREE.CylinderGeometry(0.017, 0.019, 0.18, 5);
  const wrap = new THREE.Mesh(wrapGeom, wrappingMaterial);
  wrap.position.y = -0.22;
  player.axeMesh.add(wrap);

  // 3. Metal head socket block
  const socketGeom = new THREE.BoxGeometry(0.035, 0.06, 0.045);
  const socket = new THREE.Mesh(socketGeom, metalMaterial);
  socket.position.set(0, 0.22, 0);
  player.axeMesh.add(socket);

  // 4. Flat wedge-shaped blade (flaring out in X, thin in Z)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.22, 0);

  // Neck connecting socket to blade
  const neckGeom = new THREE.BoxGeometry(0.05, 0.03, 0.025);
  const neck = new THREE.Mesh(neckGeom, metalMaterial);
  neck.position.x = 0.035;
  headGroup.add(neck);

  // Flaring blade face
  const bladeGeom = new THREE.BoxGeometry(0.06, 0.12, 0.015);
  const blade = new THREE.Mesh(bladeGeom, metalMaterial);
  blade.position.set(0.08, 0, 0);
  blade.rotation.z = -0.05; // slight tilt for aesthetic
  headGroup.add(blade);

  // Sharp cutting edge (bevelled prism using a thin tall box)
  const edgeGeom = new THREE.BoxGeometry(0.02, 0.15, 0.005);
  const edge = new THREE.Mesh(edgeGeom, metalMaterial);
  edge.position.set(0.115, 0, 0);
  headGroup.add(edge);

  player.axeMesh.add(headGroup);

  // Rotate axe 90 degrees on Y so the blade points forward (Z direction)
  player.axeMesh.rotation.y = Math.PI / 2;

  player.handGroup.add(player.axeMesh);
  player.axeMesh.visible = false;
}

// Draw a simple low-poly Stick
function buildStickModel() {
  player.stickMesh = new THREE.Group();
  const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9, flatShading: true });
  
  const geom = new THREE.CylinderGeometry(0.015, 0.015, 0.7, 5);
  const mesh = new THREE.Mesh(geom, woodMaterial);
  mesh.position.y = 0.2;
  mesh.rotation.z = -0.15;
  player.stickMesh.add(mesh);
  
  player.handGroup.add(player.stickMesh);
  player.stickMesh.visible = false;
}

// Draw a segmented low-poly Cane (reed/bamboo)
function buildCaneModel() {
  player.caneMesh = new THREE.Group();
  const caneMaterial = new THREE.MeshStandardMaterial({ color: 0x556b2f, roughness: 0.8, flatShading: true });
  
  // Segmented green cylinder (3 nodes)
  for (let i = 0; i < 3; i++) {
    const geom = new THREE.CylinderGeometry(0.012, 0.012, 0.22, 5);
    const mesh = new THREE.Mesh(geom, caneMaterial);
    mesh.position.y = 0.05 + i * 0.23;
    player.caneMesh.add(mesh);
    
    // Joint ring
    const ringGeom = new THREE.CylinderGeometry(0.016, 0.016, 0.02, 5);
    const ring = new THREE.Mesh(ringGeom, caneMaterial);
    ring.position.y = 0.05 + i * 0.23 + 0.11;
    player.caneMesh.add(ring);
  }
  
  player.caneMesh.rotation.z = -0.15;
  player.handGroup.add(player.caneMesh);
  player.caneMesh.visible = false;
}

// Select active slot
export function selectSlot(index) {
  player.selectedSlot = index;

  // Update HUD selected border
  document.querySelectorAll('.hotbar-slot').forEach((slot, idx) => {
    if (idx === index) {
      slot.classList.add('selected');
    } else {
      slot.classList.remove('selected');
    }
  });

  // Switch visible hand model
  if (player.spearMesh && player.pickaxeMesh && player.axeMesh) {
    player.spearMesh.visible = false;
    player.pickaxeMesh.visible = false;
    player.axeMesh.visible = false;
    if (player.stickMesh) player.stickMesh.visible = false;
    if (player.caneMesh) player.caneMesh.visible = false;
    player.activeCustomItem = null;

    if (index === 0) {
      player.spearMesh.visible = true; // Spear
    } else if (index === 1) {
      player.axeMesh.visible = true;   // Axe
    } else if (index === 6) {
      player.pickaxeMesh.visible = true; // Pickaxe
    }
  }
}

// Trigger tool swing animation
export function triggerToolSwing() {
  if (player.swinging) return;
  player.swinging = true;
  player.swingTimer = player.swingDuration;
}

// Update player metrics, hand bobbing, animations, and HUD panels
export function updatePlayer(delta) {
  const time = game.time;

  // 1. Tool Swing animation math
  if (player.swinging) {
    player.swingTimer -= delta;
    if (player.swingTimer <= 0) {
      player.swinging = false;
      player.swingTimer = 0;
    }

    // Swing motion: Heavy chop down and inward
    const halfDuration = player.swingDuration / 2;
    let progress = 0;
    if (player.swingTimer > halfDuration) {
      // Swing down (progress 0 to 1)
      progress = (player.swingDuration - player.swingTimer) / halfDuration;
      player.handGroup.rotation.x = -0.55 - progress * 0.8;
      player.handGroup.rotation.y = -0.65 + progress * 0.35;
      player.handGroup.rotation.z = 0.2 - progress * 0.3;
      player.handGroup.position.set(0.25 - progress * 0.1, -0.32 - progress * 0.12, -0.45 + progress * 0.05);
    } else {
      // Swing back (progress 1 to 0)
      progress = player.swingTimer / halfDuration;
      player.handGroup.rotation.x = -0.55 - progress * 0.8;
      player.handGroup.rotation.y = -0.65 + progress * 0.35;
      player.handGroup.rotation.z = 0.2 - progress * 0.3;
      player.handGroup.position.set(0.25 - progress * 0.1, -0.32 - progress * 0.12, -0.45 + progress * 0.05);
    }
  } else {
    // 2. Idle / Walking Bobbing (breathing animation)
    let isMoving = false;
    if (game.controls && game.controls.getObject) {
      const keysPressed = document.querySelectorAll('#blocker[style*="display: none"]').length > 0 &&
        (moveForward || moveBackward || moveLeft || moveRight);
      isMoving = keysPressed;
    }

    const bobSpeed = isMoving ? 14.0 : 2.5;
    const bobAmountX = isMoving ? 0.02 : 0.005;
    const bobAmountY = isMoving ? 0.035 : 0.01;

    // Reset base hand positioning, tilted forward/left
    player.handGroup.position.x = 0.25 + Math.sin(time * bobSpeed * 0.5) * bobAmountX;
    player.handGroup.position.y = -0.32 + Math.cos(time * bobSpeed) * bobAmountY;
    player.handGroup.position.z = -0.45;
    player.handGroup.rotation.set(-0.55, -0.65, 0.2);
  }

  // 3. Update Player Stats decay (Health, Energy, Hydration)
  // Apply buffs from equipped clothing
  const hasHat = player.equipped && player.equipped.head === 'straw_hat';
  const hasVest = player.equipped && player.equipped.torso === 'explorer_vest';
  const hasPants = player.equipped && player.equipped.legs === 'grass_pants';

  // Volcanic Island checks: extreme heat and lava damage
  let isNearVolcano = false;
  let inLava = false;
  if (game.controls && game.controls.getObject) {
    const pos = game.controls.getObject().position;
    const vdx = pos.x - (-1800);
    const vdz = pos.z - 1500;
    const vdist = Math.sqrt(vdx * vdx + vdz * vdz);
    if (vdist < 180) {
      isNearVolcano = true;
      if (vdist < 45 && pos.y < 6.5) {
        inLava = true;
      }
    }
  }

  let hydrationDecayRate = 0.7 * (hasHat ? 0.75 : 1.0);
  if (isNearVolcano) {
    hydrationDecayRate *= 2.0; // Double decay under extreme heat
    if (!player.lastHeatWarnTime) player.lastHeatWarnTime = 0;
    player.lastHeatWarnTime += delta;
    if (player.lastHeatWarnTime > 8.0) {
      player.lastHeatWarnTime = 0;
      showHudMessage(getTranslation('msg_extreme_heat') || "🌡️ EXTREME HEAT: Hydration draining faster!");
    }
  }

  const energyDecayRate = 3.5 * (hasVest ? 0.8 : 1.0);
  const healthDamageRate = 2.5 * (hasPants ? 0.7 : 1.0);

  // Hydration decays slowly over time
  player.hydration = Math.max(0, player.hydration - hydrationDecayRate * delta);
  
  // Energy decays slightly, recovers if standing still
  let isWalking = false;
  if (game.controls) {
    const keys = (moveForward || moveBackward || moveLeft || moveRight);
    isWalking = keys; // Simple estimation
  }
  
  if (isWalking) {
    player.energy = Math.max(0, player.energy - energyDecayRate * delta);
  } else {
    player.energy = Math.min(100, player.energy + 8.0 * delta); // recover
  }

  // Health decays if starved or dehydrated, or if standing in lava
  if (player.hydration <= 0 || player.energy <= 0) {
    player.health = Math.max(0, player.health - healthDamageRate * delta);
  }

  if (inLava) {
    player.health = Math.max(0, player.health - 10.0 * delta); // 10 HP per second
    if (!player.lastLavaWarnTime) player.lastLavaWarnTime = 0;
    player.lastLavaWarnTime += delta;
    if (player.lastLavaWarnTime > 1.0) {
      player.lastLavaWarnTime = 0;
      showHudMessage(getTranslation('msg_in_lava') || "🔥 IN LAVA! TAKING DAMAGE! 🔥");
    }
  }

  // 4. Update HUD UI elements
  // Sync bar fills
  document.getElementById('health-fill').style.width = `${player.health}%`;
  document.getElementById('energy-fill').style.width = `${player.energy}%`;
  document.getElementById('hydration-fill').style.width = `${player.hydration}%`;

  // Sync bar text values
  document.getElementById('health-value').innerText = `${Math.ceil(player.health)}%`;
  document.getElementById('energy-value').innerText = `${Math.ceil(player.energy)}%`;
  document.getElementById('hydration-value').innerText = `${Math.ceil(player.hydration)}%`;

  // 5. Update Dynamic Compass
  if (game.controls && game.controls.getObject) {
    const cameraObj = game.camera;
    // Get camera yaw rotation (angle around Y)
    const directionVec = new THREE.Vector3();
    cameraObj.getWorldDirection(directionVec);
    
    // Angle in radians (-PI to PI)
    const angle = Math.atan2(directionVec.x, directionVec.z);
    
    const tape = document.getElementById('compass-tape');
    if (tape) {
      const oneCycleWidth = tape.offsetWidth / 3;
      // When looking North (angle = PI / -PI), offset is 0.
      let diff = angle - Math.PI;
      // Normalize difference to -PI...PI range
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      
      // Calculate precise offset in pixels (diff/2PI * cycle width)
      const offset = (diff / (Math.PI * 2)) * oneCycleWidth;
      tape.style.transform = `translateX(calc(-50% + ${offset}px))`;
    }
  }

  // 6. Update Distance to target
  if (game.controls && game.controls.getObject) {
    const playerPos = game.controls.getObject().position;
    // Distance in meters (multiplied by a factor to make it feel epic)
    const rawDist = playerPos.distanceTo(targetLoc);
    const scaleDist = Math.round(rawDist * 10 + 400); // offset so it starts around 1810m
    document.getElementById('distance-value').innerText = `${scaleDist} m`;
  }
}

// Display float message in screen (+1 Ore)
export function showHudMessage(text) {
  const el = document.getElementById('hud-message');
  if (el) {
    el.innerText = text;
    el.classList.add('visible');
    
    // Clear after 1.5 seconds
    setTimeout(() => {
      el.classList.remove('visible');
    }, 1500);
  }
}

// Toggle Inventory Overlay
export function toggleInventory() {
  const overlay = document.getElementById('inventory-overlay');
  if (!overlay) return;
  
  if (overlay.style.display === 'flex') {
    if (game.controls) {
      game.controls.lock(); // This will trigger pointerlockchange to close overlay and unpause game
    }
  } else {
    overlay.style.display = 'flex';
    game.paused = true;
    if (game.controls) {
      game.controls.unlock();
    }
    renderInventoryUI();
  }
}

// Render Inventory Overlay Panels
export function renderInventoryUI() {
  // 1. Render My Bag Grid
  const bagGrid = document.getElementById('inv-bag-grid');
  if (!bagGrid) return;
  bagGrid.innerHTML = '';

  // All inventory item definitions
  const items = [
    { id: 'wood', name: 'Wood', icon: '🪵', labelKey: 'hotbar.wood' },
    { id: 'stone', name: 'Stone', icon: '🪨', labelKey: 'hotbar.stone' },
    { id: 'leaves', name: 'Leaves', icon: '🍃', labelKey: 'hotbar.leaves' },
    { id: 'rope', name: 'Rope', icon: '🧵', labelKey: 'hotbar.rope' },
    { id: 'ore', name: 'Gold Ore', icon: '🪙', labelKey: 'hotbar.ore' },
    { id: 'raw_fish', name: 'Raw Fish', icon: '🐟', labelKey: 'inv.raw_fish' },
    { id: 'raw_crab', name: 'Raw Crab', icon: '🦀', labelKey: 'inv.raw_crab' },
    { id: 'worm', name: 'Worm', icon: '🐛', labelKey: 'inv.worm' },
    { id: 'cooked_meat', name: 'Cooked Meat', icon: '🍖', labelKey: 'inv.cooked_meat' },
    { id: 'campfire', name: 'Campfire', icon: '🔥', labelKey: 'inv.campfire' },
    { id: 'straw_hat', name: 'Straw Hat', icon: '👒', labelKey: 'inv.straw_hat' },
    { id: 'explorer_vest', name: 'Explorer Vest', icon: '🦺', labelKey: 'inv.explorer_vest' },
    { id: 'grass_pants', name: 'Grass Pants', icon: '👖', labelKey: 'inv.grass_pants' },
    { id: 'wooden_boots', name: 'Wooden Boots', icon: '🥾', labelKey: 'inv.wooden_boots' },
    { id: 'stick', name: 'Stick', icon: '🦯', labelKey: 'inv.stick' },
    { id: 'cane', name: 'Cane', icon: '🎋', labelKey: 'inv.cane' }
  ];

  // Render items the player actually has
  let slotsCreated = 0;
  items.forEach(item => {
    const count = player.inventory[item.id] || 0;
    if (count > 0) {
      slotsCreated++;
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      
      const localizedName = getTranslation(item.labelKey) || item.name;
      slot.setAttribute('data-tooltip', localizedName);
      
      slot.innerHTML = `
        <span class="inv-slot-icon">${item.icon}</span>
        <span class="inv-slot-count">${count}</span>
      `;
      slot.addEventListener('click', () => {
        equipItem(item.id);
      });
      bagGrid.appendChild(slot);
    }
  });

  // Fill up to 15 slots with empty slots for clean grid aesthetics
  for (let i = slotsCreated; i < 15; i++) {
    const emptySlot = document.createElement('div');
    emptySlot.className = 'inv-slot empty';
    emptySlot.innerHTML = ''; // Keep it purely clean and empty
    bagGrid.appendChild(emptySlot);
  }

  // 2. Render Crafting List
  const craftingList = document.getElementById('inv-crafting-list');
  if (craftingList) {
    craftingList.innerHTML = '';
    const recipes = [
      { id: 'rope', name: 'Rope', icon: '🧵', cost: { leaves: 3 }, costText: '3 Leaves', labelKey: 'hotbar.rope', descKey: 'recipe.rope' },
      { id: 'campfire', name: 'Campfire', icon: '🔥', cost: { wood: 4, stone: 2 }, costText: '4 Wood, 2 Stone', labelKey: 'inv.campfire', descKey: 'recipe.campfire' },
      { id: 'straw_hat', name: 'Straw Hat', icon: '👒', cost: { leaves: 6, rope: 2 }, costText: '6 Leaves, 2 Ropes', labelKey: 'inv.straw_hat', descKey: 'recipe.straw_hat' },
      { id: 'grass_pants', name: 'Grass Pants', icon: '👖', cost: { leaves: 8, rope: 3 }, costText: '8 Leaves, 3 Ropes', labelKey: 'inv.grass_pants', descKey: 'recipe.grass_pants' },
      { id: 'wooden_boots', name: 'Wooden Boots', icon: '🥾', cost: { wood: 4, rope: 2 }, costText: '4 Wood, 2 Ropes', labelKey: 'inv.wooden_boots', descKey: 'recipe.wooden_boots' }
    ];

    const resourceIcons = {
      leaves: '🍃',
      rope: '🧵',
      wood: '🪵',
      stone: '🪨'
    };

    recipes.forEach(recipe => {
      let isAffordable = true;
      for (const res in recipe.cost) {
        if ((player.inventory[res] || 0) < recipe.cost[res]) {
          isAffordable = false;
        }
      }

      const itemEl = document.createElement('div');
      itemEl.className = 'crafting-item';
      
      const localizedName = getTranslation(recipe.labelKey) || recipe.name;
      
      // Build visual cost badges instead of raw text
      const costBadges = [];
      for (const res in recipe.cost) {
        const required = recipe.cost[res];
        const current = player.inventory[res] || 0;
        const icon = resourceIcons[res] || '';
        const isSatisfied = current >= required;
        costBadges.push(`
          <span class="cost-badge ${isSatisfied ? 'satisfied' : 'deficient'}">
            <span class="cost-badge-icon">${icon}</span>
            <span class="cost-badge-text">${current}/${required}</span>
          </span>
        `);
      }

      itemEl.innerHTML = `
        <div class="crafting-info">
          <div class="crafting-title-row">
            <span class="crafting-icon">${recipe.icon}</span>
            <span class="crafting-title">${localizedName}</span>
          </div>
          <div class="crafting-costs-container">${costBadges.join('')}</div>
        </div>
        <button class="craft-btn ${isAffordable ? 'active' : ''}" ${isAffordable ? '' : 'disabled'}>CRAFT</button>
      `;

      const btn = itemEl.querySelector('.craft-btn');
      btn.addEventListener('click', () => {
        if (isAffordable) {
          // Deduct
          for (const res in recipe.cost) {
            player.inventory[res] -= recipe.cost[res];
          }
          // Add
          player.inventory[recipe.id] = (player.inventory[recipe.id] || 0) + 1;
          
          playSelect(); // audio feedback

          // Sync & Render
          syncHotbarCounts();
          renderInventoryUI();
        }
      });

      craftingList.appendChild(itemEl);
    });
  }

  // 3. Render Clothing & Hand Slots
  const clothingSlots = {
    head: { id: 'straw_hat', name: 'Straw Hat', icon: '👒', labelKey: 'inv.straw_hat' },
    torso: { id: 'explorer_vest', name: 'Explorer Vest', icon: '🦺', labelKey: 'inv.explorer_vest' },
    legs: { id: 'grass_pants', name: 'Grass Pants', icon: '👖', labelKey: 'inv.grass_pants' },
    feet: { id: 'wooden_boots', name: 'Wooden Boots', icon: '🥾', labelKey: 'inv.wooden_boots' },
    right_hand: { id: 'stick', name: 'Stick', icon: '🦯', labelKey: 'inv.stick' },
    left_hand: { id: 'cane', name: 'Cane', icon: '🎋', labelKey: 'inv.cane' }
  };

  const slotSVGPlaceholders = {
    head: `<svg viewBox="0 0 24 24" class="slot-placeholder-svg"><path d="M 2 16 Q 12 10 22 16 Q 20 12 12 12 Q 4 12 2 16 Z M 6 12 Q 12 4 18 12" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    torso: `<svg viewBox="0 0 24 24" class="slot-placeholder-svg"><path d="M 6 4 L 9 4 L 10 6 L 14 6 L 15 4 L 18 4 L 20 8 L 17 9 L 17 20 L 7 20 L 7 9 L 4 8 Z" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    legs: `<svg viewBox="0 0 24 24" class="slot-placeholder-svg"><path d="M 7 4 L 17 4 L 19 20 L 13 20 L 12 10 L 11 10 L 5 20 L 7 4" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    feet: `<svg viewBox="0 0 24 24" class="slot-placeholder-svg"><path d="M 5 6 L 8 6 L 9 14 L 5 18 L 5 20 L 11 20 L 11 18 L 10 14 Z M 19 6 L 16 6 L 15 14 L 19 18 L 19 20 L 13 20 L 13 18 L 14 14 Z" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    right_hand: `<svg viewBox="0 0 24 24" class="slot-placeholder-svg"><path d="M18.5 5.5 L5.5 18.5 M4 20 L5.5 18.5 M15 3.5 L20.5 9 M7.5 13.5 L10.5 16.5" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    left_hand: `<svg viewBox="0 0 24 24" class="slot-placeholder-svg"><path d="M12 2 C16.5 2 20 3.5 20 7 C20 13.5 16.5 18.5 12 21 C7.5 18.5 4 13.5 4 7 C4 3.5 7.5 2 12 2 Z" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  };

  for (const slotType in clothingSlots) {
    const el = document.querySelector(`.clothing-slot[data-slot="${slotType}"]`);
    if (el) {
      const equippedId = player.equipped[slotType];
      if (equippedId) {
        const itemInfo = clothingSlots[slotType];
        el.classList.remove('empty');
        el.innerHTML = `
          <span class="clothing-slot-type">${getTranslation(`inv_slot_${slotType}`) || slotType.toUpperCase()}</span>
          <div class="clothing-slot-content">
            <span class="slot-icon">${itemInfo.icon}</span>
            <span class="slot-text">${getTranslation(itemInfo.labelKey) || itemInfo.name}</span>
          </div>
        `;
      } else {
        el.classList.add('empty');
        el.innerHTML = `
          <span class="clothing-slot-type">${getTranslation(`inv_slot_${slotType}`) || slotType.toUpperCase()}</span>
          <div class="clothing-slot-content">
            <span class="slot-icon-container">${slotSVGPlaceholders[slotType]}</span>
            <span class="slot-text">${getTranslation('inv.empty') || '[Empty]'}</span>
          </div>
        `;
      }
    }
  }

  // 4. Update Stats Modifiers Labels
  const hasHat = player.equipped.head === 'straw_hat';
  const hasVest = player.equipped.torso === 'explorer_vest';
  const hasBoots = player.equipped.feet === 'wooden_boots';

  document.getElementById('stat-mod-energy').innerText = hasVest ? '80%' : '100%';
  document.getElementById('stat-mod-hydration').innerText = hasHat ? '75%' : '100%';
  document.getElementById('stat-mod-speed').innerText = hasBoots ? '+15%' : '+0%';
}

// Equip wearable item or use item
function equipItem(itemId) {
  if (itemId === 'raw_fish' || itemId === 'raw_crab' || itemId === 'cooked_meat') {
    consumeFood(itemId);
    return;
  }

  if (itemId === 'campfire') {
    toggleInventory(); // close inventory
    startCampfirePlacement();
    return;
  }

  let slotType = null;
  if (itemId === 'straw_hat') slotType = 'head';
  else if (itemId === 'explorer_vest') slotType = 'torso';
  else if (itemId === 'grass_pants') slotType = 'legs';
  else if (itemId === 'wooden_boots') slotType = 'feet';
  else if (itemId === 'stick') slotType = 'right_hand';
  else if (itemId === 'cane') slotType = 'left_hand';

  if (!slotType) return; // not wearable/equipable

  const currentEquipped = player.equipped[slotType];
  if (currentEquipped) {
    player.inventory[currentEquipped] = (player.inventory[currentEquipped] || 0) + 1;
  }

  player.equipped[slotType] = itemId;
  player.inventory[itemId]--;

  // Sync hand slots with actual held weapon models
  if (slotType === 'right_hand' || slotType === 'left_hand') {
    player.activeCustomItem = itemId;
    player.selectedSlot = -1; // Deselect hotbar slots
    document.querySelectorAll('.hotbar-slot').forEach(slot => {
      slot.classList.remove('selected');
    });
    if (player.spearMesh) player.spearMesh.visible = false;
    if (player.pickaxeMesh) player.pickaxeMesh.visible = false;
    if (player.axeMesh) player.axeMesh.visible = false;
    if (player.stickMesh) player.stickMesh.visible = (itemId === 'stick');
    if (player.caneMesh) player.caneMesh.visible = (itemId === 'cane');
  }

  playSelect(); // audio feedback
  renderInventoryUI();
}

// Equip a custom held weapon model (Legacy call, retained for compatibility)
export function equipCustomItem(itemId) {
  if (!player.inventory[itemId] || player.inventory[itemId] <= 0) return;
  
  player.activeCustomItem = itemId;
  player.selectedSlot = -1; // Deselect hotbar slots
  document.querySelectorAll('.hotbar-slot').forEach(slot => {
    slot.classList.remove('selected');
  });
  if (player.spearMesh && player.pickaxeMesh && player.axeMesh) {
    player.spearMesh.visible = false;
    player.pickaxeMesh.visible = false;
    player.axeMesh.visible = false;
  }
  if (player.stickMesh) player.stickMesh.visible = (itemId === 'stick');
  if (player.caneMesh) player.caneMesh.visible = (itemId === 'cane');
  playSelect();
}

// Consume food and modify player stats
function consumeFood(itemId) {
  if (!player.inventory[itemId] || player.inventory[itemId] <= 0) return;

  player.inventory[itemId]--;

  if (itemId === 'cooked_meat') {
    player.energy = Math.min(100, player.energy + 40);
    player.health = Math.min(100, player.health + 20);
    player.hydration = Math.min(100, player.hydration + 5);
    showHudMessage(getTranslation('msg_ate_cooked') || 'Ate cooked meat! +20 HP, +40 Energy');
  } else {
    player.energy = Math.max(0, player.energy - 10);
    player.health = Math.max(0, player.health - 5);
    showHudMessage(getTranslation('msg_ate_raw') || 'Ate raw food! Drained 5 HP, 10 Energy');
  }

  playSelect(); // audio feedback
  renderInventoryUI();
}

// Unequip wearable or hand-held item
function unequipItem(slotType) {
  const equippedId = player.equipped[slotType];
  if (!equippedId) return;

  player.equipped[slotType] = null;
  player.inventory[equippedId] = (player.inventory[equippedId] || 0) + 1;

  // Sync hand slots with actual held weapon models
  if (slotType === 'right_hand' || slotType === 'left_hand') {
    player.activeCustomItem = null;
    if (player.stickMesh) player.stickMesh.visible = false;
    if (player.caneMesh) player.caneMesh.visible = false;
    
    // Restore hotbar tools selection if applicable
    if (player.selectedSlot !== -1) {
      // Re-select standard tool
      const toolSlots = ['spear', 'axe', '', '', '', '', 'pickaxe'];
      const activeTool = toolSlots[player.selectedSlot];
      if (activeTool) {
        if (player.spearMesh) player.spearMesh.visible = (activeTool === 'spear');
        if (player.axeMesh) player.axeMesh.visible = (activeTool === 'axe');
        if (player.pickaxeMesh) player.pickaxeMesh.visible = (activeTool === 'pickaxe');
      }
      const slotEl = document.querySelector(`.hotbar-slot[data-slot="${player.selectedSlot}"]`);
      if (slotEl) slotEl.classList.add('selected');
    }
  }

  playSelect(); // audio feedback
  renderInventoryUI();
}

// Sync HUD Hotbar counts
export function syncHotbarCounts() {
  const slot4 = document.querySelector('.hotbar-slot[data-slot="3"]');
  if (slot4) {
    const count = slot4.querySelector('.slot-count');
    if (count) count.innerText = `x${player.inventory.leaves || 0}`;
  }
  const slot5 = document.querySelector('.hotbar-slot[data-slot="4"]');
  if (slot5) {
    const count = slot5.querySelector('.slot-count');
    if (count) count.innerText = `x${player.inventory.rope || 0}`;
  }
  const slot6 = document.querySelector('.hotbar-slot[data-slot="5"]');
  if (slot6) {
    const count = slot6.querySelector('.slot-count');
    if (count) count.innerText = `x${player.inventory.wood || 0}`;
  }
  const slot8 = document.querySelector('.hotbar-slot[data-slot="7"]');
  if (slot8) {
    const label = slot8.querySelector('.slot-label');
    const count = slot8.querySelector('.slot-count');
    const icon = slot8.querySelector('.slot-icon');
    
    if (player.inventory.ore > 0) {
      if (label) label.innerText = getTranslation('hotbar.ore') || 'Ore';
      if (icon) icon.innerText = "🪙";
      if (count) count.innerText = `x${player.inventory.ore}`;
    } else {
      if (label) label.innerText = getTranslation('hotbar.stone') || 'Stone';
      if (icon) icon.innerText = "🪨";
      if (count) count.innerText = `x${player.inventory.stone || 0}`;
    }
  }
}
