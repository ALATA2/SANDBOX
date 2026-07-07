import * as THREE from 'three';
import { game } from './game.js';
import { moveForward, moveBackward, moveLeft, moveRight, shiftPressed } from './controls.js';
import { getTranslation } from './lang.js';
import { playSelect } from './audio.js';
import { startCampfirePlacement } from './interact.js';
import { getVertexVirtualDepth, getOriginalHeight, world, checkIsSheltered, getSurfaceHeightNear, getWaterHeightAt } from './world.js';

import { getSurfaceTemperature } from './weather.js';
import { getDom, updateHUD, renderInventoryUI } from './ui.js';
export { renderInventoryUI };

export const player = {
  health: 100,
  energy: 100,
  hydration: 100,
  selectedSlot: -1, // Start with free hands!
  exploredGrid: null,
  
  // Hand held models state
  handGroup: null,
  leftHandGroup: null,
  spearMesh: null,
  pickaxeMesh: null,
  axeMesh: null,
  stickMesh: null,
  caneMesh: null,
  fishingRodMesh: null,
  torchMesh: null,
  spectrometerMesh: null,
  chemicalAnalyzerMesh: null,
  activeCustomItem: null,
  
  // Tool swing animation states
  swingTimer: 0,
  swinging: false,
  swingDuration: 0.25, // seconds
  
  // Fishing states
  isFishing: false,
  fishingState: 'idle', // 'idle', 'cast', 'bite'
  fishingTimer: 0,
  fishingBiteTime: 0,
  fishingBiteTimer: 0,
  bobberMesh: null,
  
  // Inventory counts (displayed in HUD)
  inventory: {
    ore: 0,
    stone: 0,
    wood: 0,
    leaves: 0,
    rope: 0,
    straw_hat: 0,
    explorer_vest: 0, // Starts with nothing!
    grass_pants: 0,
    wooden_boots: 0,
    raw_fish: 0,
    raw_crab: 0,
    cooked_meat: 0,
    egg: 0,
    cooked_egg: 0,
    fishing_rod: 0,
    campfire: 0,
    stick: 0,
    cane: 0,
    worm: 0,
    torch: 0,
    berries: 0,
    raw_silicon: 0,
    raw_copper: 0,
    raw_titanium: 0,
    copper_ingot: 0,
    titanium_plate: 0,
    glass: 0,
    sharp_stone: 0,
    plank: 0,
    stone_block: 0,
    primitive_spear: 0,
    primitive_axe: 0,
    primitive_pickaxe: 0,
    refined_spear: 0,
    refined_axe: 0,
    refined_pickaxe: 0,
    workbench: 0,
    furnace: 0,
    lab_table: 0,
    spectrometer: 0,
    chemical_analyzer: 0,
    heat_suit: 0,
    foundation: 0,
    wall: 0,
    primitive_roof: 0,
    wood_roof: 0,
    door: 0,
    worn_map: 0,
    charcoal: 0
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

export function getActiveSpear() {
  if ((player.inventory.refined_spear || 0) > 0) return 'refined_spear';
  if ((player.inventory.primitive_spear || 0) > 0) return 'primitive_spear';
  return null;
}

export function getActiveAxe() {
  if ((player.inventory.refined_axe || 0) > 0) return 'refined_axe';
  if ((player.inventory.primitive_axe || 0) > 0) return 'primitive_axe';
  return null;
}

export function getActivePickaxe() {
  if ((player.inventory.refined_pickaxe || 0) > 0) return 'refined_pickaxe';
  if ((player.inventory.primitive_pickaxe || 0) > 0) return 'primitive_pickaxe';
  return null;
}

export function isNearStation(type) {
  if (!world || !world.placedWorkstations) return false;
  if (game.controls && game.controls.getObject) {
    const pos = game.controls.getObject().position;
    for (const ws of world.placedWorkstations) {
      if (ws.type === type && pos.distanceTo(ws.position) < 3.0) {
        return true;
      }
    }
  }
  return false;
}

export function setToolMeshMaterial(group, toolType) {
  const isPrimitive = toolType.startsWith('primitive');
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a7f76, roughness: 0.9, flatShading: true });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9, flatShading: true });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, roughness: 0.2, metalness: 0.9, flatShading: true });
  
  group.traverse(child => {
    if (child.isMesh) {
      if (isPrimitive) {
        if (child.name === 'shaft' || (child.geometry.type === 'CylinderGeometry' && child.position.y === 0)) {
          child.material = woodMat;
        } else {
          child.material = stoneMat;
        }
      } else {
        if (child.name === 'shaft' || (child.geometry.type === 'CylinderGeometry' && child.position.y === 0)) {
          child.material = woodMat;
        } else {
          child.material = metalMat;
        }
      }
    }
  });
}

// Target location (Lighthouse on distant island)
const targetLoc = new THREE.Vector3(80, -5, -120);

// Pre-allocated Vector3 helper for dynamic compass/map yaw
const directionVec = new THREE.Vector3();

// Initialize player hand tools and HUD bindings
export function initPlayer() {
  // 1. Create a hand-held group and attach it to the camera
  player.handGroup = new THREE.Group();
  // Position it in bottom right corner of player screen, tilted forward/left
  player.handGroup.position.set(0.25, -0.32, -0.45);
  player.handGroup.rotation.set(-0.55, -0.65, 0.2);
  game.camera.add(player.handGroup);

  // Mirrored left-hand group for left hand slot items
  player.leftHandGroup = new THREE.Group();
  player.leftHandGroup.position.set(-0.25, -0.32, -0.45);
  player.leftHandGroup.rotation.set(-0.55, 0.65, -0.2);
  game.camera.add(player.leftHandGroup);

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

  // Build Low-Poly 3D Fishing Rod
  buildFishingRodModel();

  // Build Low-Poly 3D Torch
  buildTorchModel();

  // Build Chemistry Voxel tools
  buildSpectrometerModel();
  buildChemicalAnalyzerModel();

  // 4. Set starting slot selection
  selectSlot(-1); // Start with empty hands (free hands)
  syncHotbarCounts();

  // Initialize Fog of War Explored Grid
  if (!player.exploredGrid) {
    player.exploredGrid = new Uint8Array(120 * 120);
  }

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

  // Setup map close button click
  const mapCloseBtn = document.getElementById('map-close-btn');
  if (mapCloseBtn) {
    mapCloseBtn.addEventListener('click', () => {
      closeWornMap();
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
  player.leftHandGroup.add(player.caneMesh);
  player.caneMesh.visible = false;
}

// Draw a beautiful low-poly Fishing Rod
function buildFishingRodModel() {
  player.fishingRodMesh = new THREE.Group();
  const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9, flatShading: true });
  const reelMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2, flatShading: true });
  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const bobberMaterial = new THREE.MeshStandardMaterial({ color: 0xff3b30, roughness: 0.5, flatShading: true });

  // Main rod pole
  const poleGeom = new THREE.CylinderGeometry(0.008, 0.015, 0.75, 5);
  const pole = new THREE.Mesh(poleGeom, woodMaterial);
  pole.position.y = 0.25;
  pole.rotation.z = -0.1; // tilted slightly forward
  player.fishingRodMesh.add(pole);

  // Reel mechanism
  const reelGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.025, 6);
  const reel = new THREE.Mesh(reelGeom, reelMaterial);
  reel.position.set(-0.015, 0.08, 0);
  reel.rotation.z = Math.PI / 2;
  player.fishingRodMesh.add(reel);

  // Hanging fishing line
  const lineGeom = new THREE.CylinderGeometry(0.002, 0.002, 0.35, 4);
  const line = new THREE.Mesh(lineGeom, lineMaterial);
  line.position.set(-0.08, 0.42, 0); // attached near the top tip
  player.fishingRodMesh.add(line);

  // Bobber float
  const bobberGeom = new THREE.SphereGeometry(0.015, 4, 4);
  const bobber = new THREE.Mesh(bobberGeom, bobberMaterial);
  bobber.position.set(-0.08, 0.25, 0);
  player.fishingRodMesh.add(bobber);

  player.fishingRodMesh.rotation.z = -0.15; // overall group rotation matching stick/cane
  player.handGroup.add(player.fishingRodMesh);
  player.fishingRodMesh.visible = false;
}

// Draw a beautiful low-poly Torch with a PointLight
function buildTorchModel() {
  player.torchMesh = new THREE.Group();
  
  const woodMaterial = new THREE.MeshStandardMaterial({ color: 0x5c3d24, roughness: 0.9, flatShading: true }); // Dark brown stick
  const metalMaterial = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.5, metalness: 0.5, flatShading: true }); // Dark metal cup
  const flameMaterial = new THREE.MeshBasicMaterial({ color: 0xffaa00 }); // Glowing orange/yellow flame
  
  // Handle (wood cylinder)
  const handleGeom = new THREE.CylinderGeometry(0.012, 0.012, 0.35, 5);
  const handle = new THREE.Mesh(handleGeom, woodMaterial);
  handle.position.y = 0.175;
  player.torchMesh.add(handle);
  
  // Cup/Bracket (metal cylinder on top of handle)
  const cupGeom = new THREE.CylinderGeometry(0.02, 0.015, 0.08, 6);
  const cup = new THREE.Mesh(cupGeom, metalMaterial);
  cup.position.y = 0.35 + 0.04;
  player.torchMesh.add(cup);
  
  // Flame (cone)
  const flameGeom = new THREE.ConeGeometry(0.025, 0.1, 5);
  const flame = new THREE.Mesh(flameGeom, flameMaterial);
  flame.position.y = 0.39 + 0.05;
  player.torchMesh.add(flame);
  
  // PointLight
  // A warm orange light
  const light = new THREE.PointLight(0xffaa44, 2.0, 15);
  light.position.y = 0.39 + 0.05;
  light.castShadow = true;
  light.shadow.bias = -0.002;
  player.torchMesh.add(light);
  
  // Keep track of light so we can animate/flicker it in updatePlayer
  player.torchMesh.userData = {
    light: light,
    flame: flame,
    flickerTime: 0
  };
  
  player.torchMesh.rotation.z = -0.15;
  player.leftHandGroup.add(player.torchMesh);
  player.torchMesh.visible = false;
}

function buildSpectrometerModel() {
  player.spectrometerMesh = new THREE.Group();
  
  // Brass body
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd8a060, roughness: 0.3, metalness: 0.8, flatShading: true });
  const bodyGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.25, 6);
  const bodyMesh = new THREE.Mesh(bodyGeom, brassMat);
  bodyMesh.position.set(0.12, 0.15, -0.22);
  bodyMesh.rotation.x = Math.PI / 4;
  player.spectrometerMesh.add(bodyMesh);

  // Cyan glowing lens/laser head
  const cyanMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 0.8, flatShading: true });
  const lensGeom = new THREE.CylinderGeometry(0.025, 0.015, 0.04, 6);
  const lensMesh = new THREE.Mesh(lensGeom, cyanMat);
  lensMesh.position.set(0.12, 0.24, -0.31);
  lensMesh.rotation.x = Math.PI / 4;
  player.spectrometerMesh.add(lensMesh);

  player.handGroup.add(player.spectrometerMesh);
  player.spectrometerMesh.visible = false;
}

function buildChemicalAnalyzerModel() {
  player.chemicalAnalyzerMesh = new THREE.Group();

  // Steel body
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x506070, roughness: 0.4, metalness: 0.8, flatShading: true });
  const bodyGeom = new THREE.BoxGeometry(0.08, 0.15, 0.05);
  const bodyMesh = new THREE.Mesh(bodyGeom, steelMat);
  bodyMesh.position.set(0.12, 0.12, -0.2);
  bodyMesh.rotation.y = Math.PI / 6;
  player.chemicalAnalyzerMesh.add(bodyMesh);

  // Green glowing analyzer screen
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x33cc33, emissive: 0x33cc33, emissiveIntensity: 0.6, flatShading: true });
  const screenGeom = new THREE.PlaneGeometry(0.06, 0.08);
  const screenMesh = new THREE.Mesh(screenGeom, screenMat);
  screenMesh.position.set(0.11, 0.12, -0.173);
  screenMesh.rotation.y = Math.PI / 6;
  player.chemicalAnalyzerMesh.add(screenMesh);

  player.handGroup.add(player.chemicalAnalyzerMesh);
  player.chemicalAnalyzerMesh.visible = false;
}

// Cancel active fishing
export function cancelFishing() {
  if (!player.isFishing) return;
  player.isFishing = false;
  player.fishingState = 'idle';
  if (player.bobberMesh) {
    game.scene.remove(player.bobberMesh);
    player.bobberMesh = null;
  }
  showHudMessage(getTranslation('msg_fishing_cancelled') || 'Fishing cancelled!');
}

// Update visibility of hand meshes based on slot selection and equipped items
export function updateHandMeshesVisibility() {
  if (player.spearMesh) player.spearMesh.visible = false;
  if (player.axeMesh) player.axeMesh.visible = false;
  if (player.pickaxeMesh) player.pickaxeMesh.visible = false;
  if (player.stickMesh) player.stickMesh.visible = false;
  if (player.fishingRodMesh) player.fishingRodMesh.visible = false;
  if (player.caneMesh) player.caneMesh.visible = false;
  if (player.torchMesh) player.torchMesh.visible = false;
  if (player.spectrometerMesh) player.spectrometerMesh.visible = false;
  if (player.chemicalAnalyzerMesh) player.chemicalAnalyzerMesh.visible = false;

  // Resolve active custom item for backward compatibility
  player.activeCustomItem = player.equipped.right_hand || player.equipped.left_hand;

  // Right-hand item/tool
  const rightHandItem = player.equipped.right_hand;
  if (rightHandItem) {
    if (rightHandItem === 'stick' && player.stickMesh) player.stickMesh.visible = true;
    if (rightHandItem === 'fishing_rod' && player.fishingRodMesh) player.fishingRodMesh.visible = true;
    if (rightHandItem === 'spectrometer' && player.spectrometerMesh) player.spectrometerMesh.visible = true;
    if (rightHandItem === 'chemical_analyzer' && player.chemicalAnalyzerMesh) player.chemicalAnalyzerMesh.visible = true;
  } else {
    if (player.selectedSlot === 0) {
      const activeSpear = getActiveSpear();
      if (activeSpear && player.spearMesh) {
        player.spearMesh.visible = true;
        setToolMeshMaterial(player.spearMesh, activeSpear);
      }
    }
    if (player.selectedSlot === 1) {
      const activeAxe = getActiveAxe();
      if (activeAxe && player.axeMesh) {
        player.axeMesh.visible = true;
        setToolMeshMaterial(player.axeMesh, activeAxe);
      }
    }
    if (player.selectedSlot === 6) {
      const activePickaxe = getActivePickaxe();
      if (activePickaxe && player.pickaxeMesh) {
        player.pickaxeMesh.visible = true;
        setToolMeshMaterial(player.pickaxeMesh, activePickaxe);
      }
    }
  }

  // Left-hand item/tool
  const leftHandItem = player.equipped.left_hand;
  if (leftHandItem) {
    if (leftHandItem === 'cane' && player.caneMesh) player.caneMesh.visible = true;
    if (leftHandItem === 'torch' && player.torchMesh) player.torchMesh.visible = true;
  }
}

// Select active slot
export function selectSlot(index) {
  // Enforce tool possession checks
  if (index === 0 && getActiveSpear() === null) {
    showHudMessage(player.currentLang === 'it' ? "Non hai una lancia!" : "You don't have a spear!");
    index = -1;
  } else if (index === 1 && getActiveAxe() === null) {
    showHudMessage(player.currentLang === 'it' ? "Non hai un'accetta!" : "You don't have an axe!");
    index = -1;
  } else if (index === 6 && getActivePickaxe() === null) {
    showHudMessage(player.currentLang === 'it' ? "Non hai un piccone!" : "You don't have a pickaxe!");
    index = -1;
  }

  player.selectedSlot = index;

  // Update HUD selected border
  document.querySelectorAll('.hotbar-slot').forEach((slot, idx) => {
    if (idx === index) {
      slot.classList.add('selected');
    } else {
      slot.classList.remove('selected');
    }
  });

  // If a hotbar slot is selected (which is a right-hand tool), we unequip any custom right-hand item!
  if (index !== -1 && player.equipped.right_hand) {
    const rightHandItem = player.equipped.right_hand;
    player.equipped.right_hand = null;
    player.inventory[rightHandItem] = (player.inventory[rightHandItem] || 0) + 1;
    renderInventoryUI();
  }

  updateHandMeshesVisibility();

  if (player.equipped.right_hand !== 'fishing_rod' && player.isFishing) {
    cancelFishing();
  }
}

// Trigger tool swing animation
export function triggerToolSwing() {
  if (player.swinging) return;
  player.swinging = true;
  player.swingTimer = player.swingDuration;
  
  // Deduct 2 energy per swing
  player.energy = Math.max(0, player.energy - 2);
}

// Update player metrics, hand bobbing, animations, and HUD panels
export function updatePlayer(delta) {
  const time = game.time;

  // Throttle hotbar sync to run every 15 frames (approx. 4 times per second) during gameplay
  player.hotbarSyncTick = (player.hotbarSyncTick || 0) + 1;
  if (player.hotbarSyncTick >= 15) {
    player.hotbarSyncTick = 0;
    syncHotbarCounts();
  }

  // Update Fog of War explored grid based on player position
  if (game.controls && game.controls.getObject) {
    const playerPos = game.controls.getObject().position;
    const gx = Math.floor(playerPos.x / 1.6);
    const gz = Math.floor(playerPos.z / 1.6);
    
    if (player.exploredGrid) {
      const revealRadius = 8;
      for (let dz = -revealRadius; dz <= revealRadius; dz++) {
        for (let dx = -revealRadius; dx <= revealRadius; dx++) {
          if (dx * dx + dz * dz <= revealRadius * revealRadius) {
            const nx = gx + dx;
            const nz = gz + dz;
            if (nx >= 0 && nx < 120 && nz >= 0 && nz < 120) {
              player.exploredGrid[nz * 120 + nx] = 1;
            }
          }
        }
      }
    }
  }

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

    // Left hand bobbing during swing
    if (player.leftHandGroup) {
      let isMoving = false;
      if (game.controls && game.controls.getObject) {
        const keysPressed = game.pointerLocked &&
          (moveForward || moveBackward || moveLeft || moveRight);
        isMoving = keysPressed;
      }
      const bobSpeed = isMoving ? 14.0 : 2.5;
      const bobAmountX = isMoving ? 0.02 : 0.005;
      const bobAmountY = isMoving ? 0.035 : 0.01;

      player.leftHandGroup.position.x = -0.25 - Math.sin(time * bobSpeed * 0.5) * bobAmountX;
      player.leftHandGroup.position.y = -0.32 + Math.cos(time * bobSpeed) * bobAmountY;
      player.leftHandGroup.position.z = -0.45;
      player.leftHandGroup.rotation.set(-0.55, 0.65, -0.2);
    }
  } else {
    // 2. Idle / Walking Bobbing (breathing animation)
    let isMoving = false;
    if (game.controls && game.controls.getObject) {
      const keysPressed = game.pointerLocked &&
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

    // Left hand bobbing
    if (player.leftHandGroup) {
      player.leftHandGroup.position.x = -0.25 - Math.sin(time * bobSpeed * 0.5) * bobAmountX;
      player.leftHandGroup.position.y = -0.32 + Math.cos(time * bobSpeed) * bobAmountY;
      player.leftHandGroup.position.z = -0.45;
      player.leftHandGroup.rotation.set(-0.55, 0.65, -0.2);
    }
  }

  // 2.5 Torch flicker animation
  if (player.torchMesh && player.torchMesh.visible) {
    const light = player.torchMesh.userData.light;
    const flame = player.torchMesh.userData.flame;
    if (light && flame) {
      player.torchMesh.userData.flickerTime += delta * 15;
      const flicker = Math.sin(player.torchMesh.userData.flickerTime);
      light.intensity = 1.8 + flicker * 0.25;
      flame.scale.set(1 + flicker * 0.1, 1 + Math.cos(player.torchMesh.userData.flickerTime * 0.7) * 0.15, 1 + flicker * 0.1);
    }
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
  
  const playerPos = game.controls && game.controls.getObject ? game.controls.getObject().position : null;
  if (isWalking) {
    const runFactor = (shiftPressed && player.energy > 10) ? 3.0 : 1.0;
    player.energy = Math.max(0, player.energy - energyDecayRate * runFactor * delta);
  } else {
    // Regenerate stamina faster if sheltered
    const recoverSpeed = (playerPos && checkIsSheltered(playerPos)) ? 16.0 : 8.0;
    player.energy = Math.min(100, player.energy + recoverSpeed * delta); // recover
  }

  // Health decays if starved or dehydrated, or if standing in lava
  if (player.hydration <= 0 || player.energy <= 0) {
    player.health = Math.max(0, player.health - healthDamageRate * delta);
  }

  // 3.5 Subterranean depth, temperature, and heat damage calculations
  let depth = 0;
  let temp = 25;
  if (playerPos) {
    const H = getOriginalHeight(playerPos.x, playerPos.z);
    const physicalDepth = H - playerPos.y;
    depth = Math.max(0, Math.round(physicalDepth * (3.0 / world.spacing) + (world.currentVirtualDepth || 0)));

    if (isNearVolcano) {
      temp = 45; // Extreme volcanic heat
    } else if (depth > 67) {
      // Temperature rises up to 120°C at 700m depth
      temp = 25 + Math.min(95, ((depth - 67) / (700 - 67)) * 95);
    } else if (depth >= 700) {
      // Rises up to 250°C at 1100m depth
      temp = 120 + Math.min(130, ((depth - 700) / (1100 - 700)) * 130);
    } else {
      // Surface temperature: depends on calendar season, day/night, and weather
      temp = getSurfaceTemperature();
      
      if (temp < 15) {
        // Check heat sources
        let isNearFire = false;
        if (world.campfires) {
          for (let i = 0; i < world.campfires.length; i++) {
            const fire = world.campfires[i];
            const dist = playerPos.distanceTo(fire.position);
            if (dist < 4.0 && fire.userData && fire.userData.burnTime > 0) {
              isNearFire = true;
              break;
            }
          }
        }
        const isSheltered = checkIsSheltered(playerPos);
        
        if (isNearFire) {
          temp = 25;
        } else if (isSheltered) {
          temp = Math.max(temp, 21); // Warm shelter
        }
        
        // Explorer vest adds thermal protection (+5°C)
        if (hasVest) {
          temp += 5;
        }
      }
    }
    
    temp = Math.round(temp);
    
    // Handle freezing warning and hypothermia damage
    if (temp < 10) {
      player.energy = Math.max(0, player.energy - 6.0 * delta); // drains stamina fast
      if (player.energy <= 0) {
        player.health = Math.max(0, player.health - 3.0 * delta); // freezing hypothermia damage
      }
      
      if (!player.lastColdWarnTime) player.lastColdWarnTime = 0;
      player.lastColdWarnTime += delta;
      if (player.lastColdWarnTime > 8.0) {
        player.lastColdWarnTime = 0;
        showHudMessage(player.currentLang === 'it' ? "🥶 CONGELAMENTO: Scaldati vicino a un fuoco o in un rifugio!" : "🥶 FREEZING: Warm up near a fire or inside a shelter!");
      }
    }

    // Lava damage in Magma layer (Layer 6, 99m to 700m)
    if (depth >= 99 && depth < 700) {
      const hasHeatSuit = player.equipped && player.equipped.torso === 'heat_suit';
      if (!hasHeatSuit) {
        player.health = Math.max(0, player.health - 25.0 * delta); // 25 HP per second
        if (!player.lastLavaWarnTime) player.lastLavaWarnTime = 0;
        player.lastLavaWarnTime += delta;
        if (player.lastLavaWarnTime > 1.0) {
          player.lastLavaWarnTime = 0;
          showHudMessage(getTranslation('msg_in_lava') || "🔥 IN LAVA! TAKING DAMAGE! 🔥");
        }
      }
    }
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
  updateHUD(depth, temp);
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


// Equip wearable item or use item
export function equipItem(itemId) {
  if (itemId === 'raw_fish' || itemId === 'raw_crab' || itemId === 'cooked_meat' || itemId === 'egg' || itemId === 'cooked_egg' || itemId === 'berries') {
    consumeFood(itemId);
    return;
  }

  const isStructure = itemId === 'campfire' || itemId === 'workbench' || itemId === 'furnace' || itemId === 'lab_table' ||
                      itemId === 'foundation' || itemId === 'wall' || itemId === 'primitive_roof' || itemId === 'wood_roof' || itemId === 'door';
  if (isStructure) {
    toggleInventory(); // close inventory
    import('./interact.js').then(module => {
      module.startStructurePlacement(itemId);
    });
    return;
  }

  if (itemId === 'worn_map') {
    openWornMap();
    return;
  }

  if (itemId.endsWith('_axe')) {
    showHudMessage(player.currentLang === 'it' ? "Premi il tasto 2 (Slot 2) per usare l'Accetta!" : "Press key 2 (Slot 2) to equip the Axe!");
    return;
  }
  if (itemId.endsWith('_pickaxe')) {
    showHudMessage(player.currentLang === 'it' ? "Premi il tasto 7 (Slot 7) per usare il Piccone!" : "Press key 7 (Slot 7) to equip the Pickaxe!");
    return;
  }
  if (itemId.endsWith('_spear')) {
    showHudMessage(player.currentLang === 'it' ? "Premi il tasto 1 (Slot 1) per usare la Lancia!" : "Press key 1 (Slot 1) to equip the Spear!");
    return;
  }

  let slotType = null;
  if (itemId === 'straw_hat') slotType = 'head';
  else if (itemId === 'explorer_vest' || itemId === 'heat_suit') slotType = 'torso';
  else if (itemId === 'grass_pants') slotType = 'legs';
  else if (itemId === 'wooden_boots') slotType = 'feet';
  else if (itemId === 'stick' || itemId === 'spectrometer' || itemId === 'chemical_analyzer') slotType = 'right_hand';
  else if (itemId === 'fishing_rod') slotType = 'right_hand';
  else if (itemId === 'cane') slotType = 'left_hand';
  else if (itemId === 'torch') slotType = 'left_hand';

  if (!slotType) return; // not wearable/equipable

  const currentEquipped = player.equipped[slotType];
  if (currentEquipped) {
    player.inventory[currentEquipped] = (player.inventory[currentEquipped] || 0) + 1;
  }

  player.equipped[slotType] = itemId;
  player.inventory[itemId]--;

  // Sync hand slots with actual held weapon models
  if (slotType === 'right_hand' || slotType === 'left_hand') {
    if (slotType === 'right_hand') {
      player.selectedSlot = -1; // Deselect hotbar slots ONLY when equipping right-hand item
      document.querySelectorAll('.hotbar-slot').forEach(slot => {
        slot.classList.remove('selected');
      });
    }

    updateHandMeshesVisibility();

    if (player.equipped.right_hand !== 'fishing_rod' && player.isFishing) {
      cancelFishing();
    }
  }

  playSelect(); // audio feedback
  renderInventoryUI();
}

// Equip a custom held weapon model (Legacy call, retained for compatibility)
export function equipCustomItem(itemId) {
  if (!player.inventory[itemId] || player.inventory[itemId] <= 0) return;
  
  let slotType = (itemId === 'cane' || itemId === 'torch') ? 'left_hand' : 'right_hand';
  const currentEquipped = player.equipped[slotType];
  if (currentEquipped) {
    player.inventory[currentEquipped] = (player.inventory[currentEquipped] || 0) + 1;
  }
  player.equipped[slotType] = itemId;
  player.inventory[itemId]--;

  if (slotType === 'right_hand') {
    player.selectedSlot = -1; // Deselect hotbar slots
    document.querySelectorAll('.hotbar-slot').forEach(slot => {
      slot.classList.remove('selected');
    });
  }

  updateHandMeshesVisibility();
  
  if (player.equipped.right_hand !== 'fishing_rod' && player.isFishing) {
    cancelFishing();
  }
  playSelect();
  renderInventoryUI();
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
  } else if (itemId === 'cooked_egg') {
    player.energy = Math.min(100, player.energy + 30);
    player.health = Math.min(100, player.health + 15);
    player.hydration = Math.min(100, player.hydration + 5);
    showHudMessage(getTranslation('msg_ate_cooked_egg') || 'Ate cooked egg! +15 HP, +30 Energy, +5 Hydration');
  } else if (itemId === 'berries') {
    player.energy = Math.min(100, player.energy + 15);
    player.health = Math.min(100, player.health + 5);
    player.hydration = Math.min(100, player.hydration + 10);
    showHudMessage(getTranslation('msg_ate_berries') || 'Ate wild berries! +5 HP, +15 Energy, +10 Hydration');
  } else {
    player.energy = Math.max(0, player.energy - 10);
    player.health = Math.max(0, player.health - 5);
    showHudMessage(getTranslation('msg_ate_raw') || 'Ate raw food! Drained 5 HP, 10 Energy');
  }

  playSelect(); // audio feedback
  renderInventoryUI();
}

// Unequip wearable or hand-held item
export function unequipItem(slotType) {
  const equippedId = player.equipped[slotType];
  if (!equippedId) return;

  player.equipped[slotType] = null;
  player.inventory[equippedId] = (player.inventory[equippedId] || 0) + 1;

  // Sync hand slots with actual held weapon models
  if (slotType === 'right_hand' || slotType === 'left_hand') {
    updateHandMeshesVisibility();

    if (slotType === 'right_hand' && equippedId === 'fishing_rod' && player.isFishing) {
      cancelFishing();
    }
    
    // Restore hotbar tools selection if applicable
    if (player.selectedSlot !== -1) {
      // Re-select standard tool
      const toolSlots = ['spear', 'axe', '', '', '', '', 'pickaxe'];
      const activeTool = toolSlots[player.selectedSlot];
      const slotEl = document.querySelector(`.hotbar-slot[data-slot="${player.selectedSlot}"]`);
      if (slotEl) slotEl.classList.add('selected');
    }
  }

  playSelect(); // audio feedback
  renderInventoryUI();
}

// Sync HUD Hotbar counts
export function syncHotbarCounts() {
  // Slot 1 (Spear - data-slot="0")
  const slot1 = document.querySelector('.hotbar-slot[data-slot="0"]');
  if (slot1) {
    const icon = slot1.querySelector('.slot-icon');
    const label = slot1.querySelector('.slot-label');
    let count = slot1.querySelector('.slot-count');
    if (!count) {
      count = document.createElement('span');
      count.className = 'slot-count';
      slot1.appendChild(count);
    }
    
    const activeSpear = getActiveSpear();
    if (activeSpear) {
      icon.innerText = "⚔️";
      label.innerText = getTranslation(`inv.${activeSpear}`) || activeSpear;
      count.innerText = "x1";
    } else {
      icon.innerText = "";
      label.innerText = "";
      count.innerText = "";
    }
  }

  // Slot 2 (Axe - data-slot="1")
  const slot2 = document.querySelector('.hotbar-slot[data-slot="1"]');
  if (slot2) {
    const icon = slot2.querySelector('.slot-icon');
    const label = slot2.querySelector('.slot-label');
    let count = slot2.querySelector('.slot-count');
    if (!count) {
      count = document.createElement('span');
      count.className = 'slot-count';
      slot2.appendChild(count);
    }
    
    const activeAxe = getActiveAxe();
    if (activeAxe) {
      icon.innerText = "🪓";
      label.innerText = getTranslation(`inv.${activeAxe}`) || activeAxe;
      count.innerText = "x1";
    } else {
      icon.innerText = "";
      label.innerText = "";
      count.innerText = "";
    }
  }

  // Slot 3 (Water - data-slot="2")
  const slot3 = document.querySelector('.hotbar-slot[data-slot="2"]');
  if (slot3) {
    const icon = slot3.querySelector('.slot-icon');
    const label = slot3.querySelector('.slot-label');
    
    // Check if player is near water source
    let isNearWater = false;
    if (game.controls && game.controls.getObject) {
      const playerPos = game.controls.getObject().position;
      const waterHeight = getWaterHeightAt(playerPos.x, playerPos.z);
      const isNearOcean = playerPos.y <= 5.5 && waterHeight === 4.0;
      const isNearLake = playerPos.y <= 18.7 && waterHeight === 17.6;
      isNearWater = isNearOcean || isNearLake;
    }
    
    if (isNearWater) {
      if (icon) icon.innerText = "💧";
      if (label) label.innerText = getTranslation('hotbar.water') || 'Water';
    } else {
      if (icon) icon.innerText = "";
      if (label) label.innerText = "";
    }
  }

  // Slot 7 (Pickaxe - data-slot="6")
  const slot7 = document.querySelector('.hotbar-slot[data-slot="6"]');
  if (slot7) {
    const icon = slot7.querySelector('.slot-icon');
    const label = slot7.querySelector('.slot-label');
    const count = slot7.querySelector('.slot-count');
    
    const activePickaxe = getActivePickaxe();
    if (activePickaxe) {
      icon.innerText = "⛏️";
      label.innerText = getTranslation(`inv.${activePickaxe}`) || activePickaxe;
      if (count) count.innerText = "x1";
    } else {
      icon.innerText = "";
      label.innerText = "";
      if (count) count.innerText = "";
    }
  }

  const slot4 = document.querySelector('.hotbar-slot[data-slot="3"]');
  if (slot4) {
    const icon = slot4.querySelector('.slot-icon');
    const label = slot4.querySelector('.slot-label');
    const count = slot4.querySelector('.slot-count');
    const val = player.inventory.leaves || 0;
    if (val > 0) {
      if (icon) icon.innerText = "🍃";
      if (label) label.innerText = getTranslation('hotbar.leaves') || 'Leaves';
      if (count) count.innerText = `x${val}`;
    } else {
      if (icon) icon.innerText = "";
      if (label) label.innerText = "";
      if (count) count.innerText = "";
    }
  }
  const slot5 = document.querySelector('.hotbar-slot[data-slot="4"]');
  if (slot5) {
    const icon = slot5.querySelector('.slot-icon');
    const label = slot5.querySelector('.slot-label');
    const count = slot5.querySelector('.slot-count');
    const val = player.inventory.rope || 0;
    if (val > 0) {
      if (icon) icon.innerText = "🧵";
      if (label) label.innerText = getTranslation('hotbar.rope') || 'Rope';
      if (count) count.innerText = `x${val}`;
    } else {
      if (icon) icon.innerText = "";
      if (label) label.innerText = "";
      if (count) count.innerText = "";
    }
  }
  const slot6 = document.querySelector('.hotbar-slot[data-slot="5"]');
  if (slot6) {
    const icon = slot6.querySelector('.slot-icon');
    const label = slot6.querySelector('.slot-label');
    const count = slot6.querySelector('.slot-count');
    const val = player.inventory.wood || 0;
    if (val > 0) {
      if (icon) icon.innerText = "🪵";
      if (label) label.innerText = getTranslation('hotbar.wood') || 'Wood';
      if (count) count.innerText = `x${val}`;
    } else {
      if (icon) icon.innerText = "";
      if (label) label.innerText = "";
      if (count) count.innerText = "";
    }
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
    } else if ((player.inventory.stone || 0) > 0) {
      if (label) label.innerText = getTranslation('hotbar.stone') || 'Stone';
      if (icon) icon.innerText = "🪨";
      if (count) count.innerText = `x${player.inventory.stone}`;
    } else {
      if (label) label.innerText = "";
      if (icon) icon.innerText = "";
      if (count) count.innerText = "";
    }
  }
}

// Open the Worn Map UI overlay
export function openWornMap() {
  const overlay = document.getElementById('map-overlay');
  if (!overlay) return;

  const invOverlay = document.getElementById('inventory-overlay');
  if (invOverlay) invOverlay.style.display = 'none';

  overlay.style.display = 'flex';
  game.paused = true;
  if (game.controls) {
    game.controls.unlock();
  }

  drawExploredMap();
}

// Close the Worn Map UI overlay
export function closeWornMap() {
  const overlay = document.getElementById('map-overlay');
  if (!overlay) return;

  overlay.style.display = 'none';
  if (game.controls) {
    game.controls.lock();
  }
}

// Draw explored grid to 2D Canvas with fog of war
export function drawExploredMap() {
  const canvas = document.getElementById('map-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = 512;
  canvas.height = 512;

  const w = canvas.width;
  const h = canvas.height;
  const gridW = 120;
  const gridH = 120;
  const cellSize = w / gridW;

  ctx.fillStyle = '#1c1b18';
  ctx.fillRect(0, 0, w, h);

  for (let gz = 0; gz < gridH; gz++) {
    for (let gx = 0; gx < gridW; gx++) {
      const idx = gz * gridW + gx;
      const isExplored = player.exploredGrid && player.exploredGrid[idx] === 1;

      if (!isExplored) {
        ctx.fillStyle = '#3a352a';
        ctx.fillRect(gx * cellSize, gz * cellSize, cellSize + 0.5, cellSize + 0.5);
        continue;
      }

      const wx = gx * 1.6;
      const wz = gz * 1.6;
      const height = getSurfaceHeightNear(wx, 15, wz);

      let color = '#adc2d1';
      if (height < 3.7) {
        color = '#b0c4de';
      } else if (height < 4.8) {
        color = '#dfcf9f';
      } else if (height < 10.0) {
        color = '#8fad77';
      } else if (height < 17.0) {
        color = '#8c7c64';
      } else if (height === 17.6) {
        color = '#5f9ea0';
      } else {
        color = '#dcdcdc';
      }

      ctx.fillStyle = color;
      ctx.fillRect(gx * cellSize, gz * cellSize, cellSize + 0.5, cellSize + 0.5);
    }
  }

  ctx.strokeStyle = 'rgba(138, 90, 54, 0.1)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridW; i += 10) {
    ctx.beginPath();
    ctx.moveTo(i * cellSize, 0);
    ctx.lineTo(i * cellSize, h);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i * cellSize);
    ctx.lineTo(w, i * cellSize);
    ctx.stroke();
  }

  if (game.controls && game.controls.getObject) {
    const playerPos = game.controls.getObject().position;
    const pGridX = (playerPos.x / (120 * 1.6)) * w;
    const pGridZ = (playerPos.z / (120 * 1.6)) * h;

    // Zero-alloc yaw check
    game.camera.getWorldDirection(directionVec);
    const yaw = Math.atan2(directionVec.x, directionVec.z);

    ctx.save();
    ctx.translate(pGridX, pGridZ);
    ctx.rotate(yaw);

    ctx.fillStyle = '#d9534f';
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(-4, 0);
    ctx.lineTo(4, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#555';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(-4, 0);
    ctx.lineTo(4, 0);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}


