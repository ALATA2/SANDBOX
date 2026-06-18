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
  axeMesh: null,
  
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
  el.innerText = text;
  el.classList.add('visible');
  
  // Clear after 1.5 seconds
  setTimeout(() => {
    el.classList.remove('visible');
  }, 1500);
}
