import * as THREE from 'three';
import { game } from './game.js';
import { moveForward, moveBackward, moveLeft, moveRight } from './controls.js';

export const player = {
  health: 100,
  energy: 100,
  hydration: 100,
  selectedSlot: 6, // Starting selected slot (Slot 7 is index 6, Pickaxe)
  
  // Hand held models state
  handGroup: null,
  spearMesh: null,
  pickaxeMesh: null,
  
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
    rope: 2
  }
};

// Target location (Lighthouse on distant island)
const targetLoc = new THREE.Vector3(80, -5, -120);

// Initialize player hand tools and HUD bindings
export function initPlayer() {
  // 1. Create a hand-held group and attach it to the camera
  player.handGroup = new THREE.Group();
  // Position it in bottom right corner of player screen
  player.handGroup.position.set(0.3, -0.3, -0.5);
  player.handGroup.rotation.set(0.1, -0.3, 0.1);
  game.camera.add(player.handGroup);
  // Ensure camera child is added to scene properly (implicitly camera is in scene)

  // 2. Build Low-Poly 3D Spear
  buildSpearModel();

  // 3. Build Low-Poly 3D Pickaxe
  buildPickaxeModel();

  // 4. Set starting slot selection
  selectSlot(6); // Slot 7 (index 6, Pickaxe)

  // 5. Setup Keyboard listener for slot swapping (1-8 keys)
  document.addEventListener('keydown', (e) => {
    if (e.key >= '1' && e.key <= '8') {
      const idx = parseInt(e.key) - 1;
      selectSlot(idx);
    }
  });

  // Setup click handler to trigger tool swing
  document.addEventListener('mousedown', (e) => {
    if (game.pointerLocked && e.button === 0) { // Left click
      triggerToolSwing();
    }
  });

  // Setup slot clicks
  document.querySelectorAll('.hotbar-slot').forEach(slot => {
    slot.addEventListener('click', (e) => {
      const idx = parseInt(slot.getAttribute('data-slot'));
      selectSlot(idx);
    });
  });
}

// Draw a beautiful low-poly Spear
function buildSpearModel() {
  player.spearMesh = new THREE.Group();

  const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x6e4722, roughness: 0.9, flatShading: true });
  const metalMaterial = new THREE.MeshStandardMaterial({ color: 0xb5c0c9, roughness: 0.2, metalness: 0.9, flatShading: true });

  // Wooden shaft
  const shaftGeom = new THREE.CylinderGeometry(0.015, 0.015, 1.2, 5);
  const shaft = new THREE.Mesh(shaftGeom, woodMaterial);
  shaft.rotation.z = Math.PI / 2; // Orient along Z-ish
  shaft.rotation.y = Math.PI / 2;
  player.spearMesh.add(shaft);

  // Tip base (connector)
  const tipBaseGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.08, 5);
  const tipBase = new THREE.Mesh(tipBaseGeom, metalMaterial);
  tipBase.position.set(0, 0, -0.6);
  tipBase.rotation.x = Math.PI / 2;
  player.spearMesh.add(tipBase);

  // Sharp metallic point
  const pointGeom = new THREE.ConeGeometry(0.04, 0.18, 4);
  const point = new THREE.Mesh(pointGeom, metalMaterial);
  point.position.set(0, 0, -0.7);
  point.rotation.x = -Math.PI / 2; // point forward
  player.spearMesh.add(point);

  // Position spear nicely in hand
  player.spearMesh.position.set(-0.1, 0, -0.2);
  player.spearMesh.rotation.set(0.1, -0.1, 0.2);
  
  player.handGroup.add(player.spearMesh);
  player.spearMesh.visible = false;
}

// Draw a beautiful low-poly Pickaxe
function buildPickaxeModel() {
  player.pickaxeMesh = new THREE.Group();

  const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x543519, roughness: 0.9, flatShading: true });
  const metalMaterial = new THREE.MeshStandardMaterial({ color: 0x57616b, roughness: 0.3, metalness: 0.8, flatShading: true });
  const goldAccentMaterial = new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.2, metalness: 0.9, flatShading: true });

  // Handle (shaft)
  const shaftGeom = new THREE.CylinderGeometry(0.018, 0.018, 0.85, 5);
  const shaft = new THREE.Mesh(shaftGeom, woodMaterial);
  shaft.rotation.x = Math.PI / 2; // extend forward
  player.pickaxeMesh.add(shaft);

  // Metal head connector
  const ringGeom = new THREE.CylinderGeometry(0.024, 0.024, 0.06, 5);
  const ring = new THREE.Mesh(ringGeom, goldAccentMaterial);
  ring.position.set(0, 0, -0.38);
  ring.rotation.x = Math.PI / 2;
  player.pickaxeMesh.add(ring);

  // Metal Pickaxe curve (T-bar)
  // Built using 3 segments for a low-poly curved look
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0, -0.38);

  const side1Geom = new THREE.BoxGeometry(0.24, 0.03, 0.03);
  const side1 = new THREE.Mesh(side1Geom, metalMaterial);
  side1.rotation.y = 0.15; // angled forward
  side1.position.x = 0.12;
  headGroup.add(side1);

  const side2Geom = new THREE.BoxGeometry(0.24, 0.03, 0.03);
  const side2 = new THREE.Mesh(side2Geom, metalMaterial);
  side2.rotation.y = -0.15; // angled forward
  side2.position.x = -0.12;
  headGroup.add(side2);

  // Sharp pick tips
  const tip1Geom = new THREE.ConeGeometry(0.02, 0.08, 4);
  const tip1 = new THREE.Mesh(tip1Geom, metalMaterial);
  tip1.rotation.z = -Math.PI / 2;
  tip1.position.set(0.24, 0, 0.02);
  headGroup.add(tip1);

  const tip2Geom = new THREE.ConeGeometry(0.02, 0.08, 4);
  const tip2 = new THREE.Mesh(tip2Geom, metalMaterial);
  tip2.rotation.z = Math.PI / 2;
  tip2.position.set(-0.24, 0, 0.02);
  headGroup.add(tip2);

  player.pickaxeMesh.add(headGroup);

  // Position pickaxe nicely in hand
  player.pickaxeMesh.position.set(0, 0.05, -0.2);
  player.pickaxeMesh.rotation.set(-0.15, -0.2, 0.25);

  player.handGroup.add(player.pickaxeMesh);
  player.pickaxeMesh.visible = false;
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
  if (player.spearMesh && player.pickaxeMesh) {
    player.spearMesh.visible = false;
    player.pickaxeMesh.visible = false;

    if (index === 0) {
      player.spearMesh.visible = true; // Spear
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
  const time = game.clock.getElapsedTime();

  // 1. Tool Swing animation math
  if (player.swinging) {
    player.swingTimer -= delta;
    if (player.swingTimer <= 0) {
      player.swinging = false;
      player.swingTimer = 0;
    }

    // Swing motion: Rotate tool forward rapidly, then return
    const halfDuration = player.swingDuration / 2;
    let progress = 0;
    if (player.swingTimer > halfDuration) {
      // Swing down (progress 0 to 1)
      progress = (player.swingDuration - player.swingTimer) / halfDuration;
      // Interpolate rotation.x to swing forward
      player.handGroup.rotation.x = 0.1 - progress * 0.9;
      player.handGroup.rotation.y = -0.3 + progress * 0.4;
      player.handGroup.position.z = -0.5 - progress * 0.15;
    } else {
      // Swing back (progress 1 to 0)
      progress = player.swingTimer / halfDuration;
      player.handGroup.rotation.x = 0.1 - progress * 0.9;
      player.handGroup.rotation.y = -0.3 + progress * 0.4;
      player.handGroup.position.z = -0.5 - progress * 0.15;
    }
  } else {
    // 2. Idle / Walking Bobbing (breathing animation)
    // Check if player is moving by reading movement keys (if controls initialized)
    let isMoving = false;
    if (game.controls && game.controls.getObject) {
      const pObj = game.controls.getObject();
      // If player is moving, increase speed and amplitude of breathing bobbing
      const keysPressed = document.querySelectorAll('#blocker[style*="display: none"]').length > 0 &&
        (moveForward || moveBackward || moveLeft || moveRight);
      isMoving = keysPressed; // fallback or query from controls.js state
    }

    const bobSpeed = isMoving ? 14.0 : 2.5;
    const bobAmountX = isMoving ? 0.02 : 0.005;
    const bobAmountY = isMoving ? 0.035 : 0.01;

    // Reset base hand positioning
    player.handGroup.position.x = 0.3 + Math.sin(time * bobSpeed * 0.5) * bobAmountX;
    player.handGroup.position.y = -0.3 + Math.cos(time * bobSpeed) * bobAmountY;
    player.handGroup.position.z = -0.5;
    player.handGroup.rotation.set(0.1, -0.3, 0.1);
  }

  // 3. Update Player Stats decay (Health, Energy, Hydration)
  // Hydration decays slowly over time
  player.hydration = Math.max(0, player.hydration - 0.7 * delta);
  
  // Energy decays slightly, recovers if standing still
  let isWalking = false;
  if (game.controls) {
    const keys = (moveForward || moveBackward || moveLeft || moveRight);
    isWalking = keys; // Simple estimation
  }
  
  if (isWalking) {
    player.energy = Math.max(0, player.energy - 3.5 * delta);
  } else {
    player.energy = Math.min(100, player.energy + 8.0 * delta); // recover
  }

  // Health decays if starved or dehydrated
  if (player.hydration <= 0 || player.energy <= 0) {
    player.health = Math.max(0, player.health - 2.5 * delta);
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
    
    // Scale and translate the compass tape in pixel equivalents
    // Total tape length represents 360 degrees. Let's translate by percentage
    // Map -PI...PI to 0...100%
    const pct = ((angle + Math.PI) / (Math.PI * 2)) * 100;
    
    // Translate the tape. Since the tape wraps, we shift the container transform
    // Adjust mapping to align with letters
    const compassOffset = (angle / Math.PI) * 110; // offset factor
    document.getElementById('compass-tape').style.transform = `translateX(${compassOffset}px)`;
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
  el.innerText = text;
  el.classList.add('visible');
  
  // Clear after 1.5 seconds
  setTimeout(() => {
    el.classList.remove('visible');
  }, 1500);
}
