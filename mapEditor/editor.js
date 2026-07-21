import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { game } from '../js/game.js';
import { 
  world, 
  initWorld, 
  getDensity,
  setDensity,
  buildMarchingCubesMesh,
  generateDensityGrid,
  shiftGridWindow,
  createPalmTree, 
  createPineTree, 
  createLandRockMesh, 
  createMarineRockMesh, 
  createOreDepositMesh, 
  createBerryBushMesh, 
  createCanePlant, 
  createFlowerMesh, 
  createStarfishMesh,
  smoothNoise2D,
  fbmNoise2D
} from '../js/world.js';
import { getSurfaceHeightNear } from '../js/physics.js';

// Global Editor State
let scene, camera, renderer, controls;
let currentToolType = 'pine'; // Default selected object
let rotationY = 0; // Current placement rotation
let editorObjects = []; // Array of placed editor object metadata
let playerSpawnMarker = null; // Single player spawn marker
let previewMesh = null; // Ghost preview mesh

// Sculpting Brush State
let brushWidth = 10.0;
let brushLength = 10.0;
let brushShape = 'circle'; // 'circle' or 'square'
let isSculpting = false;
const lastSculptPoint = new THREE.Vector3();
let flattenTargetHeight = null; // Altitude target for flattening brush

// Extrusion Tool State
let isExtruding = false;
const extrudeCenter = new THREE.Vector3();
let extrudeStartMouseY = 0;
let extrudeSavedHeights = {};

// Selection Brush State
let selectedColumns = new Set();
let selectToolMode = 'add'; // 'add', 'sub', 'extrude'
let selectionVisualizerGroup = null;

// Raycasting & Mouse
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // Horizontal intersection backup

// Keyboard movement state
const activeKeys = { w: false, a: false, s: false, d: false, shift: false };
const moveDirection = new THREE.Vector3();
const moveSide = new THREE.Vector3();
const moveVector = new THREE.Vector3();

// Setup mock game object properties so world.js/fauna.js work seamlessly
game.shadowsEnabled = true;
game.isMobile = false;
game.time = 0;
game.paused = false;

// Initialize Editor Engine
function initEditor() {
  const container = document.getElementById('canvas-container');
  
  // 1. Create Scene & Camera
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f172a);
  scene.fog = new THREE.FogExp2(0x0f172a, 0.001);
  game.scene = scene;

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 5000);
  camera.position.set(120, 80, 120);

  // 2. Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);
  game.renderer = renderer;

  // 3. OrbitControls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.01; // Don't go below ground
  controls.minDistance = 5;
  controls.maxDistance = 1000;

  // 4. Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xfff8e7, 1.2);
  dirLight.position.set(150, 200, 100);
  scene.add(dirLight);

  // 5. Initialize the Voxel Terrain
  initWorld();
  // 6. Setup Preview Mesh
  updatePreviewMesh();

  selectionVisualizerGroup = new THREE.Group();
  scene.add(selectionVisualizerGroup);

  // 7. Event Listeners
  window.addEventListener('resize', onWindowResize);
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  setupUI();

  // Initialize Global Minimap Teleporter Interaction
  const minimapArea = document.getElementById('minimap-area');
  if (minimapArea) {
    const handleMinimapInteraction = (e) => {
      const rect = minimapArea.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      
      const px = Math.max(0, Math.min(196, clickX));
      const pz = Math.max(0, Math.min(196, clickY));
      
      const targetX = -8000 + (px / 196) * 16000;
      const targetZ = -8000 + (pz / 196) * 16000;
      
      camera.position.set(targetX, camera.position.y, targetZ + 120);
      controls.target.set(targetX, getSurfaceHeightNear(targetX, 40, targetZ), targetZ);
      controls.update();
    };
    
    let isMouseDownOnMinimap = false;
    minimapArea.addEventListener('pointerdown', (e) => {
      isMouseDownOnMinimap = true;
      handleMinimapInteraction(e);
      minimapArea.setPointerCapture(e.pointerId);
    });
    
    minimapArea.addEventListener('pointermove', (e) => {
      if (isMouseDownOnMinimap) {
        handleMinimapInteraction(e);
      }
    });
    
    minimapArea.addEventListener('pointerup', (e) => {
      isMouseDownOnMinimap = false;
      minimapArea.releasePointerCapture(e.pointerId);
    });
  }

  // Load existing map from localStorage if there is one
  const existingMap = localStorage.getItem('custom_map_data');
  if (existingMap) {
    try {
      importMapJSON(JSON.parse(existingMap));
    } catch(e) {
      console.warn("No valid saved map to auto-load.");
    }
  }

  // Animation Loop
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  
  // Animate preview rotation/wind sway
  game.time = performance.now() * 0.001;

  // Handle keyboard translation (WASD)
  if (activeKeys.w || activeKeys.a || activeKeys.s || activeKeys.d) {
    camera.getWorldDirection(moveDirection);
    moveDirection.y = 0;
    moveDirection.normalize();

    moveSide.crossVectors(moveDirection, camera.up).normalize();
    moveSide.y = 0;
    moveSide.normalize();

    moveVector.set(0, 0, 0);
    if (activeKeys.w) moveVector.add(moveDirection);
    if (activeKeys.s) moveVector.sub(moveDirection);
    if (activeKeys.d) moveVector.add(moveSide);
    if (activeKeys.a) moveVector.sub(moveSide);

    if (moveVector.lengthSq() > 0) {
      const currentSpeed = activeKeys.shift ? 7.5 : 2.5; // Shift speed multiplier (3x faster!)
      moveVector.normalize().multiplyScalar(currentSpeed);
      camera.position.add(moveVector);
      controls.target.add(moveVector);
    }
  }
  
  controls.update();

  // Dynamically shift the active voxel canvas window to center around the camera focus/target
  shiftGridWindow(controls.target.x, controls.target.z);
  
  // Position the preview mesh on terrain
  updatePreviewPosition();

  // Update Global Minimap Marker
  const minimapMarker = document.getElementById('minimap-marker');
  if (minimapMarker) {
    const px = ((camera.position.x - (-8000)) / 16000) * 196;
    const pz = ((camera.position.z - (-8000)) / 16000) * 196;
    minimapMarker.style.left = `${px}px`;
    minimapMarker.style.top = `${pz}px`;
  }

  renderer.render(scene, camera);
}

// UI bindings and action buttons
function setupUI() {
  // Tool selection in Sidebar Grid
  const gridItems = document.querySelectorAll('.grid-item');
  gridItems.forEach(item => {
    item.addEventListener('click', () => {
      gridItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      currentToolType = item.getAttribute('data-type');
      updatePreviewMesh();
    });
  });

  // Shape selection buttons binding
  const btnShapeCircle = document.getElementById('btn-shape-circle');
  const btnShapeSquare = document.getElementById('btn-shape-square');
  if (btnShapeCircle && btnShapeSquare) {
    btnShapeCircle.addEventListener('click', () => {
      brushShape = 'circle';
      btnShapeCircle.classList.add('active');
      btnShapeSquare.classList.remove('active');
      document.getElementById('label-brush-width').textContent = "Larghezza (Raggio X)";
      document.getElementById('label-brush-length').textContent = "Lunghezza (Raggio Z)";
      updatePreviewMesh();
    });
    btnShapeSquare.addEventListener('click', () => {
      brushShape = 'square';
      btnShapeSquare.classList.add('active');
      btnShapeCircle.classList.remove('active');
      document.getElementById('label-brush-width').textContent = "Larghezza (Semi-lato X)";
      document.getElementById('label-brush-length').textContent = "Lunghezza (Semi-lato Z)";
      updatePreviewMesh();
    });
  }

  // Brush width slider binding
  const sliderWidth = document.getElementById('brush-width-slider');
  const valueLabelWidth = document.getElementById('brush-width-value');
  if (sliderWidth && valueLabelWidth) {
    sliderWidth.addEventListener('input', (e) => {
      brushWidth = parseFloat(e.target.value);
      valueLabelWidth.textContent = `${brushWidth}m`;
      updatePreviewMesh();
    });
  }

  // Brush length slider binding
  const sliderLength = document.getElementById('brush-length-slider');
  const valueLabelLength = document.getElementById('brush-length-value');
  if (sliderLength && valueLabelLength) {
    sliderLength.addEventListener('input', (e) => {
      brushLength = parseFloat(e.target.value);
      valueLabelLength.textContent = `${brushLength}m`;
      updatePreviewMesh();
    });
  }

  // Action Buttons
  document.getElementById('btn-play').onclick = playTestMap;
  document.getElementById('btn-export').onclick = exportMapJSON;
  
  const fileInput = document.getElementById('file-input');
  document.getElementById('btn-import').onclick = () => fileInput.click();
  fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const mapData = JSON.parse(evt.target.result);
        importMapJSON(mapData);
        alert("Mappa caricata con successo!");
      } catch(err) {
        alert("Errore nel caricamento del file JSON.");
      }
    };
    reader.readAsText(file);
  };

  document.getElementById('btn-reset').onclick = () => {
    if (confirm("Sei sicuro di voler cancellare l'intera mappa?")) {
      resetMap();
    }
  };

  // Sea Level Toggle and Slider bindings
  const seaToggle = document.getElementById('sea-level-toggle');
  if (seaToggle) {
    seaToggle.addEventListener('change', (e) => {
      if (world.waterMesh) {
        world.waterMesh.visible = e.target.checked;
      }
    });
  }

  const seaSlider = document.getElementById('sea-level-slider');
  const seaValueLabel = document.getElementById('sea-level-value');
  if (seaSlider && seaValueLabel) {
    seaSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      world.seaLevel = val;
      seaValueLabel.textContent = `${val.toFixed(1)}m`;
      if (world.waterMesh) {
        world.waterMesh.position.y = val;
      }
    });
  }

  // Selection Tool Sub-Mode buttons
  const btnSelectAdd = document.getElementById('btn-select-add');
  const btnSelectSub = document.getElementById('btn-select-sub');
  const btnSelectDrag = document.getElementById('btn-select-drag');
  const btnSelectClear = document.getElementById('btn-select-clear');

  if (btnSelectAdd && btnSelectSub && btnSelectDrag) {
    btnSelectAdd.addEventListener('click', () => {
      selectToolMode = 'add';
      btnSelectAdd.classList.add('active');
      btnSelectSub.classList.remove('active');
      btnSelectDrag.classList.remove('active');
      updatePreviewMesh();
    });
    btnSelectSub.addEventListener('click', () => {
      selectToolMode = 'sub';
      btnSelectSub.classList.add('active');
      btnSelectAdd.classList.remove('active');
      btnSelectDrag.classList.remove('active');
      updatePreviewMesh();
    });
    btnSelectDrag.addEventListener('click', () => {
      selectToolMode = 'extrude';
      btnSelectDrag.classList.add('active');
      btnSelectAdd.classList.remove('active');
      btnSelectSub.classList.remove('active');
      updatePreviewMesh();
    });
  }

  if (btnSelectClear) {
    btnSelectClear.addEventListener('click', () => {
      selectedColumns.clear();
      updateSelectionVisualizer();
    });
  }
}

// Create appropriate 3D mesh for the ghost preview
function updatePreviewMesh() {
  const selectPanel = document.getElementById('selection-extrude-panel');
  if (selectPanel) {
    selectPanel.style.display = (currentToolType === 'extrude') ? 'flex' : 'none';
  }

  if (previewMesh) {
    scene.remove(previewMesh);
    previewMesh = null;
  }

  if (currentToolType === null) return;

  let geom, mat;
  const opacity = 0.5;

  if (currentToolType === 'pine') {
    previewMesh = createPineTree();
  } else if (currentToolType === 'palm') {
    previewMesh = createPalmTree();
  } else if (currentToolType === 'land_rock') {
    previewMesh = createLandRockMesh();
  } else if (currentToolType === 'marine_rock') {
    previewMesh = createMarineRockMesh();
  } else if (currentToolType === 'ore') {
    previewMesh = createOreDepositMesh();
  } else if (currentToolType === 'berry_bush') {
    previewMesh = createBerryBushMesh();
  } else if (currentToolType === 'cane') {
    previewMesh = createCanePlant();
  } else if (currentToolType === 'flower') {
    previewMesh = createFlowerMesh();
  } else if (currentToolType === 'starfish') {
    previewMesh = createStarfishMesh();
  } else if (currentToolType === 'player_spawn') {
    // Player Spawn point visual indicator (Green cylinder)
    geom = new THREE.CylinderGeometry(0.5, 0.5, 1.8, 16);
    mat = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity });
    previewMesh = new THREE.Mesh(geom, mat);
    previewMesh.position.y = 0.9;
  } else if (currentToolType === 'spawn_rooster') {
    // Rooster Arturo indicator (Red Box)
    geom = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    mat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity });
    previewMesh = new THREE.Mesh(geom, mat);
    previewMesh.position.y = 0.3;
  } else if (currentToolType === 'spawn_hen') {
    // Hen Rosita indicator (Tan Box)
    geom = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    mat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity });
    previewMesh = new THREE.Mesh(geom, mat);
    previewMesh.position.y = 0.25;
  } else if (currentToolType === 'spawn_crab') {
    geom = new THREE.BoxGeometry(0.4, 0.15, 0.3);
    mat = new THREE.MeshBasicMaterial({ color: 0xd97706, transparent: true, opacity });
    previewMesh = new THREE.Mesh(geom, mat);
    previewMesh.position.y = 0.075;
  } else if (currentToolType === 'spawn_fish') {
    geom = new THREE.BoxGeometry(0.4, 0.2, 0.15);
    mat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity });
    previewMesh = new THREE.Mesh(geom, mat);
    previewMesh.position.y = 0.1;
  } else if (currentToolType === 'spawn_seagull') {
    geom = new THREE.ConeGeometry(0.3, 0.6, 8);
    mat = new THREE.MeshBasicMaterial({ color: 0xf8fafc, transparent: true, opacity });
    previewMesh = new THREE.Mesh(geom, mat);
    previewMesh.position.y = 0.3;
  } else if (currentToolType === 'sculpt_up' || currentToolType === 'sculpt_down' || currentToolType === 'sculpt_smooth' || currentToolType === 'sculpt_flatten' || currentToolType === 'erase_area' || currentToolType === 'generate_island' || currentToolType === 'extrude') {
    const color = currentToolType === 'sculpt_up' ? 0x22c55e : 
                  (currentToolType === 'sculpt_down' ? 0xef4444 : 
                  (currentToolType === 'sculpt_smooth' ? 0x06b6d4 : 
                  (currentToolType === 'sculpt_flatten' ? 0xa855f7 : 
                  (currentToolType === 'erase_area' ? 0xe11d48 : 
                  (currentToolType === 'extrude' ? 0xf97316 : 0x06b6d4)))));
    if (brushShape === 'circle') {
      geom = new THREE.CylinderGeometry(1.0, 1.0, 0.4, 24);
      mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.35 });
      previewMesh = new THREE.Mesh(geom, mat);
      previewMesh.scale.set(brushWidth, 1.0, brushLength);
    } else {
      geom = new THREE.BoxGeometry(2.0, 0.4, 2.0); // Box with 2.0 side length represents -1.0 to 1.0 semi-lato
      mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.35 });
      previewMesh = new THREE.Mesh(geom, mat);
      previewMesh.scale.set(brushWidth, 1.0, brushLength);
    }
    previewMesh.position.y = 0.2;
  }

  // Fade out material hierarchy for previews
  previewMesh.traverse(child => {
    if (child.material) {
      child.material = child.material.clone();
      child.material.transparent = true;
      child.material.opacity = opacity;
    }
  });

  scene.add(previewMesh);
}

// Raycasts onto terrainMesh, falling back to a virtual sea level plane if geometry is empty
function getTerrainIntersection() {
  raycaster.setFromCamera(mouse, camera);
  
  // 1. Try to intersect the actual terrain mesh
  const intersects = raycaster.intersectObject(world.terrainMesh);
  if (intersects.length > 0) {
    return intersects[0];
  }
  
  // 2. Fallback: intersect a horizontal plane at sea level
  const seaPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -world.seaLevel);
  const intersectPoint = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(seaPlane, intersectPoint)) {
    const minX = (world.gridOffsetX || 0) * world.spacing;
    const maxX = minX + world.sizeX * world.spacing;
    const minZ = (world.gridOffsetZ || 0) * world.spacing;
    const maxZ = minZ + world.sizeZ * world.spacing;
    if (intersectPoint.x >= minX && intersectPoint.x <= maxX && intersectPoint.z >= minZ && intersectPoint.z <= maxZ) {
      return { point: intersectPoint };
    }
  }
  
  return null;
}

// Raycast onto the terrain to set preview position
function updatePreviewPosition() {
  if (!previewMesh) return;

  const intersect = getTerrainIntersection();

  if (intersect) {
    const hitPoint = intersect.point;
    
    // Offset the mesh height depending on the type
    let offset = 0;
    if (currentToolType === 'palm') offset = -0.1;
    else if (currentToolType === 'ore') offset = -0.2;
    else if (currentToolType === 'player_spawn') offset = 0.9;
    else if (currentToolType === 'spawn_rooster') offset = 0.3;
    else if (currentToolType === 'spawn_hen') offset = 0.25;
    else if (currentToolType === 'spawn_crab') offset = 0.075;
    else if (currentToolType === 'spawn_fish') offset = 0.1;
    else if (currentToolType === 'spawn_seagull') offset = 0.3;
    else if (currentToolType === 'sculpt_up' || currentToolType === 'sculpt_down' || currentToolType === 'erase_area' || currentToolType === 'generate_island' || currentToolType === 'extrude') offset = 0.2;

    previewMesh.position.set(hitPoint.x, hitPoint.y + offset, hitPoint.z);
    previewMesh.rotation.y = rotationY;
    previewMesh.visible = true;
  } else {
    previewMesh.visible = false;
  }
}

function updateSidebarSelection() {
  const gridItems = document.querySelectorAll('.grid-item');
  gridItems.forEach(item => {
    if (item.getAttribute('data-type') === currentToolType) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

// Sculpt Voxel Terrain or Erase area
function sculptTerrain(hitPoint, valueChange, eraseMode = false) {
  const spacing = world.spacing;
  const gx = hitPoint.x / spacing - (world.gridOffsetX || 0);
  const gy = (hitPoint.y - (world.gridOffsetY || 0)) / spacing;
  const gz = hitPoint.z / spacing - (world.gridOffsetZ || 0);
  
  const gWidth = brushWidth / spacing;
  const gLength = brushLength / spacing;
  // Use vertical radius proportional to the average horizontal size
  const gHeight = Math.max(gWidth, gLength);

  const minX = Math.max(0, Math.floor(gx - gWidth));
  const maxX = Math.min(world.sizeX - 1, Math.ceil(gx + gWidth));
  const minY = Math.max(0, Math.floor(gy - gHeight));
  const maxY = Math.min(world.sizeY - 1, Math.ceil(gy + gHeight));
  const minZ = Math.max(0, Math.floor(gz - gLength));
  const maxZ = Math.min(world.sizeZ - 1, Math.ceil(gz + gLength));

  let modified = false;

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        const dx = x - gx;
        const dy = y - gy;
        const dz = z - gz;

        let inside = false;
        let falloff = 0;

        if (brushShape === 'circle') {
          // Ellipsoidal brush
          const rx = dx / gWidth;
          const ry = dy / gHeight;
          const rz = dz / gLength;
          const distRatioSq = rx*rx + ry*ry + rz*rz;
          if (distRatioSq < 1.0) {
            inside = true;
            falloff = 1.0 - Math.sqrt(distRatioSq);
          }
        } else {
          // Cuboidal brush
          const rx = Math.abs(dx) / gWidth;
          const ry = Math.abs(dy) / gHeight;
          const rz = Math.abs(dz) / gLength;
          if (rx < 1.0 && ry < 1.0 && rz < 1.0) {
            inside = true;
            // Product of linear falloffs
            falloff = (1.0 - rx) * (1.0 - ry) * (1.0 - rz);
          }
        }

        if (inside) {
          let newDens;
          if (eraseMode) {
            newDens = -5.0; // Clear completely to negative/vacuum density
          } else {
            let currentD = getDensity(x, y, z);
            if (valueChange > 0 && currentD < -3.5) {
              currentD = -1.5; // Elevate baseline so the first click makes land pop up immediately
            }
            const change = valueChange * falloff;
            newDens = currentD + change;
          }
          
          setDensity(x, y, z, newDens);
          const key = `${x},${y},${z}`;
          world.carvedVoxels[key] = newDens;
          modified = true;
        }
      }
    }
  }

  if (modified) {
    buildMarchingCubesMesh();
  }
}

// Paints or erases selection columns in a grid under the current brush configuration
function applySelectionBrush(hitPoint) {
  const spacing = world.spacing;
  const gcx = hitPoint.x / spacing - (world.gridOffsetX || 0);
  const gcz = hitPoint.z / spacing - (world.gridOffsetZ || 0);
  
  const gWidth = brushWidth / spacing;
  const gLength = brushLength / spacing;

  const minX = Math.max(0, Math.floor(gcx - gWidth));
  const maxX = Math.min(world.sizeX - 1, Math.ceil(gcx + gWidth));
  const minZ = Math.max(0, Math.floor(gcz - gLength));
  const maxZ = Math.min(world.sizeZ - 1, Math.ceil(gcz + gLength));

  let changed = false;

  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      const dx = x - gcx;
      const dz = z - gcz;
      
      let inside = false;
      if (brushShape === 'circle') {
        inside = (dx*dx/(gWidth*gWidth) + dz*dz/(gLength*gLength)) < 1.0;
      } else {
        inside = Math.abs(dx) < gWidth && Math.abs(dz) < gLength;
      }

      if (inside) {
        const absX = x + (world.gridOffsetX || 0);
        const absZ = z + (world.gridOffsetZ || 0);
        const key = `${absX},${absZ}`;
        if (selectToolMode === 'add') {
          if (!selectedColumns.has(key)) {
            selectedColumns.add(key);
            changed = true;
          }
        } else if (selectToolMode === 'sub') {
          if (selectedColumns.has(key)) {
            selectedColumns.delete(key);
            changed = true;
          }
        }
      }
    }
  }

  if (changed) {
    updateSelectionVisualizer();
  }
}

// Smooth/Blur voxel densities inside brush bounds to round off sharp ridges and spikes
function smoothTerrain(hitPoint) {
  const spacing = world.spacing;
  const gx = hitPoint.x / spacing - (world.gridOffsetX || 0);
  const gy = (hitPoint.y - (world.gridOffsetY || 0)) / spacing;
  const gz = hitPoint.z / spacing - (world.gridOffsetZ || 0);
  
  const gWidth = brushWidth / spacing;
  const gLength = brushLength / spacing;
  const gHeight = Math.max(gWidth, gLength);

  const minX = Math.max(0, Math.floor(gx - gWidth));
  const maxX = Math.min(world.sizeX - 1, Math.ceil(gx + gWidth));
  const minY = Math.max(0, Math.floor(gy - gHeight));
  const maxY = Math.min(world.sizeY - 1, Math.ceil(gy + gHeight));
  const minZ = Math.max(0, Math.floor(gz - gLength));
  const maxZ = Math.min(world.sizeZ - 1, Math.ceil(gz + gLength));

  let modified = false;

  // Pre-calculate neighbor offsets (6 cardinal neighbors)
  const neighbors = [
    [1, 0, 0], [-1, 0, 0],
    [0, 1, 0], [0, -1, 0],
    [0, 0, 1], [0, 0, -1]
  ];

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        const dx = x - gx;
        const dy = y - gy;
        const dz = z - gz;

        let inside = false;
        if (brushShape === 'circle') {
          inside = (dx*dx/(gWidth*gWidth) + dy*dy/(gHeight*gHeight) + dz*dz/(gLength*gLength)) < 1.0;
        } else {
          inside = Math.abs(dx) < gWidth && Math.abs(dy) < gHeight && Math.abs(dz) < gLength;
        }

        if (inside) {
          // Average neighbors
          let sum = 0;
          let count = 0;
          for (let i = 0; i < 6; i++) {
            const nx = x + neighbors[i][0];
            const ny = y + neighbors[i][1];
            const nz = z + neighbors[i][2];
            if (nx >= 0 && nx < world.sizeX && ny >= 0 && ny < world.sizeY && nz >= 0 && nz < world.sizeZ) {
              sum += getDensity(nx, ny, nz);
              count++;
            }
          }

          if (count > 0) {
            const avg = sum / count;
            const currentD = getDensity(x, y, z);
            const newD = currentD * 0.75 + avg * 0.25;

            if (Math.abs(newD - currentD) > 0.005) {
              setDensity(x, y, z, newD);
              const voxelKey = `${x},${y},${z}`;
              world.carvedVoxels[voxelKey] = newD;
              modified = true;
            }
          }
        }
      }
    }
  }

  if (modified) {
    buildMarchingCubesMesh();
  }
}

// Plateau / flatten terrain to flattenTargetHeight within brush bounds
function flattenTerrain(hitPoint) {
  if (flattenTargetHeight === null) return;

  const spacing = world.spacing;
  const gx = hitPoint.x / spacing - (world.gridOffsetX || 0);
  const gz = hitPoint.z / spacing - (world.gridOffsetZ || 0);
  
  const gWidth = brushWidth / spacing;
  const gLength = brushLength / spacing;
  const targetGridY = (flattenTargetHeight - (world.gridOffsetY || 0)) / spacing;

  const minX = Math.max(0, Math.floor(gx - gWidth));
  const maxX = Math.min(world.sizeX - 1, Math.ceil(gx + gWidth));
  const minZ = Math.max(0, Math.floor(gz - gLength));
  const maxZ = Math.min(world.sizeZ - 1, Math.ceil(gcz = gz + gLength)); // Prevent typo, just maxZ limit

  let modified = false;

  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      const dx = x - gx;
      const dz = z - gz;

      let inside = false;
      let falloff = 0;
      if (brushShape === 'circle') {
        const rx = dx / gWidth;
        const rz = dz / gLength;
        const t = Math.sqrt(rx*rx + rz*rz);
        if (t < 1.0) {
          inside = true;
          falloff = Math.pow(Math.cos(t * Math.PI / 2), 2);
        }
      } else {
        const rx = Math.abs(dx) / gWidth;
        const rz = Math.abs(dz) / gLength;
        if (rx < 1.0 && rz < 1.0) {
          inside = true;
          falloff = Math.pow(Math.cos(rx * Math.PI / 2), 2) * Math.pow(Math.cos(rz * Math.PI / 2), 2);
        }
      }

      if (inside) {
        // Flatten entire column to meet targetGridY with falloff blending
        for (let y = 0; y < world.sizeY; y++) {
          const targetD = targetGridY - y;
          const currentD = getDensity(x, y, z);
          const newD = currentD + (targetD - currentD) * falloff;

          if (Math.abs(newD - currentD) > 0.005) {
            setDensity(x, y, z, newD);
            const voxelKey = `${x},${y},${z}`;
            world.carvedVoxels[voxelKey] = newD;
            modified = true;
          }
        }
      }
    }
  }

  if (modified) {
    buildMarchingCubesMesh();
  }
}

// Dynamic terrain sculpting trigger using the current brush configuration
function applySculpt(hitPoint) {
  if (currentToolType === 'sculpt_up') {
    sculptTerrain(hitPoint, 1.8, false);
  } else if (currentToolType === 'sculpt_down') {
    sculptTerrain(hitPoint, -1.8, false);
  } else if (currentToolType === 'sculpt_smooth') {
    smoothTerrain(hitPoint);
  } else if (currentToolType === 'sculpt_flatten') {
    flattenTerrain(hitPoint);
  } else if (currentToolType === 'erase_area') {
    sculptTerrain(hitPoint, 0.0, true);
    
    // Remove scenery objects within brush bounds
    const objectsToKeep = [];
    editorObjects.forEach(obj => {
      const dx = obj.x - hitPoint.x;
      const dz = obj.z - hitPoint.z;
      
      let inside = false;
      if (brushShape === 'circle') {
        const rx = dx / brushWidth;
        const rz = dz / brushLength;
        inside = (rx*rx + rz*rz) < 1.0;
      } else {
        inside = Math.abs(dx) < brushWidth && Math.abs(dz) < brushLength;
      }

      if (inside) {
        scene.remove(obj.mesh);
        if (obj.mesh === playerSpawnMarker) playerSpawnMarker = null;
      } else {
        objectsToKeep.push(obj);
      }
    });
    editorObjects = objectsToKeep;
  } else if (currentToolType === 'extrude') {
    if (selectToolMode === 'add' || selectToolMode === 'sub') {
      applySelectionBrush(hitPoint);
    }
  }
}

// Start the extrusion process (records original surface heights inside shape bounds or selection mask)
function startExtrude(hitPoint) {
  extrudeCenter.copy(hitPoint);
  extrudeSavedHeights = {};
  
  const spacing = world.spacing;

  if (selectedColumns.size > 0 && selectToolMode === 'extrude') {
    // Selection mask mode: Record heights of all selected columns
    selectedColumns.forEach(key => {
      const parts = key.split(',');
      const absX = parseInt(parts[0], 10);
      const absZ = parseInt(parts[1], 10);
      
      const x = absX - (world.gridOffsetX || 0);
      const z = absZ - (world.gridOffsetZ || 0);
      
      let surfaceY = 0.0;
      for (let y = world.sizeY - 1; y >= 0; y--) {
        if (getDensity(x, y, z) >= -1.5) {
          surfaceY = y;
          break;
        }
      }
      if (surfaceY === 0.0) {
        surfaceY = Math.max(-20.0, getDensity(x, 0, z));
      }
      extrudeSavedHeights[key] = surfaceY;
    });
  } else {
    // Standard tablecloth mode
    const gcx = hitPoint.x / spacing - (world.gridOffsetX || 0);
    const gcz = hitPoint.z / spacing - (world.gridOffsetZ || 0);
    
    const gWidth = brushWidth / spacing;
    const gLength = brushLength / spacing;

    const minX = Math.max(0, Math.floor(gcx - gWidth));
    const maxX = Math.min(world.sizeX - 1, Math.ceil(gcx + gWidth));
    const minZ = Math.max(0, Math.floor(gcz - gLength));
    const maxZ = Math.min(world.sizeZ - 1, Math.ceil(gcz + gLength));

    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const dx = x - gcx;
        const dz = z - gcz;
        
        let inside = false;
        if (brushShape === 'circle') {
          inside = (dx*dx/(gWidth*gWidth) + dz*dz/(gLength*gLength)) < 1.0;
        } else {
          inside = Math.abs(dx) < gWidth && Math.abs(dz) < gLength;
        }

        if (inside) {
          let surfaceY = 0.0;
          for (let y = world.sizeY - 1; y >= 0; y--) {
            if (getDensity(x, y, z) >= -1.5) {
              surfaceY = y;
              break;
            }
          }
          if (surfaceY === 0.0) {
            surfaceY = Math.max(-20.0, getDensity(x, 0, z));
          }
          const key = `${x},${z}`;
          extrudeSavedHeights[key] = surfaceY;
        }
      }
    }
  }
}

// Dynamically updates terrain mesh like pulling up a tablecloth (smooth cosine-squared falloff)
function updateExtrude(deltaY) {
  const spacing = world.spacing;
  let modified = false;
  const isRough = document.getElementById('rough-extrude-checkbox')?.checked;

  if (selectedColumns.size > 0 && selectToolMode === 'extrude') {
    // Selection mask mode: extrude all selected columns uniformly
    selectedColumns.forEach(key => {
      const origH = extrudeSavedHeights[key];
      if (origH !== undefined) {
        const parts = key.split(',');
        const absX = parseInt(parts[0], 10);
        const absZ = parseInt(parts[1], 10);
        
        const x = absX - (world.gridOffsetX || 0);
        const z = absZ - (world.gridOffsetZ || 0);
        let changeInGrid = deltaY / spacing;
        if (isRough) {
          const noiseFactor = 0.4 + 1.2 * fbmNoise2D(absX * 0.15, absZ * 0.15);
          changeInGrid *= noiseFactor;
        }
        const newH = origH + changeInGrid;

        for (let y = 0; y < world.sizeY; y++) {
          setDensity(x, y, z, newH - y);
        }
        modified = true;
      }
    });
  } else {
    // Standard tablecloth mode
    const gcx = extrudeCenter.x / spacing - (world.gridOffsetX || 0);
    const gcz = extrudeCenter.z / spacing - (world.gridOffsetZ || 0);
    
    const gWidth = brushWidth / spacing;
    const gLength = brushLength / spacing;

    const minX = Math.max(0, Math.floor(gcx - gWidth));
    const maxX = Math.min(world.sizeX - 1, Math.ceil(gcx + gWidth));
    const minZ = Math.max(0, Math.floor(gcz - gLength));
    const maxZ = Math.min(world.sizeZ - 1, Math.ceil(gcz + gLength));

    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const key = `${x},${z}`;
        const origH = extrudeSavedHeights[key];
        if (origH !== undefined) {
          const dx = x - gcx;
          const dz = z - gcz;
          
          let falloff = 0;
          if (brushShape === 'circle') {
            const rx = dx / gWidth;
            const rz = dz / gLength;
            const t = Math.sqrt(rx*rx + rz*rz);
            falloff = Math.pow(Math.cos(Math.min(1.0, t) * Math.PI / 2), 2);
          } else {
            const rx = Math.abs(dx) / gWidth;
            const rz = Math.abs(dz) / gLength;
            falloff = Math.pow(Math.cos(Math.min(1.0, rx) * Math.PI / 2), 2) * 
                      Math.pow(Math.cos(Math.min(1.0, rz) * Math.PI / 2), 2);
          }

          let changeInGrid = (deltaY / spacing) * falloff;
          if (isRough) {
            const noiseFactor = 0.4 + 1.2 * fbmNoise2D(x * 0.15, z * 0.15);
            changeInGrid *= noiseFactor;
          }
          const newH = origH + changeInGrid;

          // Rebuild density column cleanly: positive under newH, negative above
          for (let y = 0; y < world.sizeY; y++) {
            const dens = newH - y;
            setDensity(x, y, z, dens);
          }
          modified = true;
        }
      }
    }
  }

  if (modified) {
    buildMarchingCubesMesh();
    updateSelectionVisualizer();
  }
}

// Commits the finalized drag-extrusion densities to carvedVoxels
function commitExtrude() {
  const spacing = world.spacing;

  if (selectedColumns.size > 0 && selectToolMode === 'extrude') {
    // Selection mask mode
    selectedColumns.forEach(key => {
      const parts = key.split(',');
      const x = parseInt(parts[0]);
      const z = parseInt(parts[1]);
      for (let y = 0; y < world.sizeY; y++) {
        const voxelKey = `${x},${y},${z}`;
        world.carvedVoxels[voxelKey] = getDensity(x, y, z);
      }
    });
  } else {
    // Standard tablecloth mode
    const gcx = extrudeCenter.x / spacing;
    const gcz = extrudeCenter.z / spacing;
    
    const gWidth = brushWidth / spacing;
    const gLength = brushLength / spacing;

    const minX = Math.max(0, Math.floor(gcx - gWidth));
    const maxX = Math.min(world.sizeX - 1, Math.ceil(gcx + gWidth));
    const minZ = Math.max(0, Math.floor(gcz - gLength));
    const maxZ = Math.min(world.sizeZ - 1, Math.ceil(gcz + gLength));

    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const dx = x - gcx;
        const dz = z - gcz;
        
        let inside = false;
        if (brushShape === 'circle') {
          inside = (dx*dx/(gWidth*gWidth) + dz*dz/(gLength*gLength)) < 1.0;
        } else {
        inside = Math.abs(dx) < gWidth && Math.abs(dz) < gLength;
      }

      if (inside) {
        for (let y = 0; y < world.sizeY; y++) {
          const key = `${x},${y},${z}`;
          world.carvedVoxels[key] = getDensity(x, y, z);
        }
      }
    }
  }
}
}

// Rebuilds 3D indicator planes for each selected grid column to show active mask
function updateSelectionVisualizer() {
  if (!selectionVisualizerGroup) return;

  // Clear existing visuals
  while(selectionVisualizerGroup.children.length > 0) {
    const child = selectionVisualizerGroup.children[0];
    child.geometry.dispose();
    child.material.dispose();
    selectionVisualizerGroup.remove(child);
  }

  // If no columns are selected, we are done
  if (selectedColumns.size === 0) return;

  const spacing = world.spacing;
  const geom = new THREE.PlaneGeometry(spacing * 0.95, spacing * 0.95);
  geom.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.65 });

  selectedColumns.forEach(key => {
    const parts = key.split(',');
    const x = parseInt(parts[0]);
    const z = parseInt(parts[1]);
    
    // Find the surface height of this column
    let surfaceY = 0.0;
    for (let y = world.sizeY - 1; y >= 0; y--) {
      if (getDensity(x, y, z) >= -1.5) {
        surfaceY = y * spacing;
        break;
      }
    }

    // Render on top of the water or land, whichever is higher
    const displayY = Math.max(surfaceY, world.seaLevel);

    const mesh = new THREE.Mesh(geom, mat);
    // Align plane horizontally, slightly elevated to prevent z-fighting
    mesh.position.set(x * spacing, displayY + 0.15, z * spacing);
    selectionVisualizerGroup.add(mesh);
  });
}

// Spawns a registered scenery object in the editor
function spawnObjectInEditor(type, wx, wy, wz) {
  let visualMesh;
  let offset = 0;
  
  if (type === 'pine') {
    visualMesh = createPineTree();
  } else if (type === 'palm') {
    visualMesh = createPalmTree();
    offset = -0.1;
  } else if (type === 'land_rock') {
    visualMesh = createLandRockMesh();
  } else if (type === 'marine_rock') {
    visualMesh = createMarineRockMesh();
  } else if (type === 'ore') {
    visualMesh = createOreDepositMesh();
    offset = -0.2;
  } else if (type === 'berry_bush') {
    visualMesh = createBerryBushMesh();
  } else if (type === 'cane') {
    visualMesh = createCanePlant();
  } else if (type === 'flower') {
    visualMesh = createFlowerMesh();
  } else if (type === 'starfish') {
    visualMesh = createStarfishMesh();
  }

  if (visualMesh) {
    const rotY = Math.random() * Math.PI * 2;
    visualMesh.position.set(wx, wy + offset, wz);
    visualMesh.rotation.y = rotY;
    scene.add(visualMesh);

    const objMeta = {
      type: type,
      x: wx,
      y: wy + offset,
      z: wz,
      rotationY: rotY,
      scale: 1.0,
      mesh: visualMesh
    };
    editorObjects.push(objMeta);
  }
}

// Procedural Island Height Generator inside selected brush circle
function generateProceduralIsland(hitPoint, radius, genre) {
  const spacing = world.spacing;
  const gcx = hitPoint.x / spacing - (world.gridOffsetX || 0);
  const gcz = hitPoint.z / spacing - (world.gridOffsetZ || 0);
  const gRadius = radius / spacing;

  const minX = Math.max(0, Math.floor(gcx - gRadius));
  const maxX = Math.min(world.sizeX - 1, Math.ceil(gcx + gRadius));
  const minZ = Math.max(0, Math.floor(gcz - gRadius));
  const maxZ = Math.min(world.sizeZ - 1, Math.ceil(gcz + gRadius));

  let modified = false;

  for (let x = minX; x <= maxX; x++) {
    for (let z = minZ; z <= maxZ; z++) {
      const dx = x - gcx;
      const dz = z - gcz;
      const dist = Math.sqrt(dx*dx + dz*dz);
      const t = dist / gRadius;

      if (t <= 1.0) {
        let h = -20.0; // default deep seabed under the island area

        if (genre === 'atollo') {
          // Sandy ring at 70% radius
          const ringCenter = gRadius * 0.7;
          const ringWidth = gRadius * 0.25;
          const distToRing = Math.abs(dist - ringCenter);
          if (distToRing < ringWidth) {
            const rt = distToRing / ringWidth;
            h = (1.6 + Math.random() * 0.8) * Math.cos(rt * Math.PI / 2);
          }
        } else if (genre === 'collinare') {
          // Grassy dome with FBM noise hills
          const hBase = (4.0 + Math.random() * 2.0) * Math.cos(t * Math.PI / 2);
          const noiseH = (smoothNoise2D(x * 0.2, z * 0.2) + 0.5 * smoothNoise2D(x * 0.4, z * 0.4)) * 2.5;
          h = Math.max(-2.0, hBase + noiseH);
        } else if (genre === 'vulcanica') {
          // Volcano cone with crater
          const rimRadius = gRadius * 0.4;
          if (dist < rimRadius) {
            const craterT = dist / rimRadius;
            const rimH = (12.0 + Math.random() * 3.0) * Math.cos((rimRadius / gRadius) * Math.PI / 2);
            h = 4.0 + (rimH - 4.0) * craterT * craterT; // crater dips to sea level Y=4.0
          } else {
            h = (12.0 + Math.random() * 3.0) * Math.cos(t * Math.PI / 2);
          }
        }

        // Set density for all heights in voxel column
        for (let y = 0; y < world.sizeY; y++) {
          const dens = h - y;
          setDensity(x, y, z, dens);
          const key = `${x},${y},${z}`;
          world.carvedVoxels[key] = dens;
        }
        modified = true;
      }
    }
  }

  if (modified) {
    buildMarchingCubesMesh();

    // Re-check heights after mesh rebuild to scatter objects snap-fit to the new terrain surface
    setTimeout(() => {
      scatterProceduralObjects(hitPoint, radius, genre);
    }, 50);
  }
}

// Scatters flora, rocks, and ores based on altitude-locked rules
function scatterProceduralObjects(hitPoint, radius, genre) {
  const numSpawns = Math.floor(radius * 0.5); // 5 to 15 spawns
  for (let i = 0; i < numSpawns; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * radius * 0.85;
    const wx = hitPoint.x + Math.cos(angle) * dist;
    const wz = hitPoint.z + Math.sin(angle) * dist;
    const wy = getSurfaceHeightNear(wx, 25.0, wz);

    if (wy > 4.1) {
      if (wy <= 5.6) {
        // Low shore / sandy beach (up to 5.6m): spawn palm tree or starfish
        const type = Math.random() < 0.8 ? 'palm' : 'starfish';
        spawnObjectInEditor(type, wx, wy, wz);
      } else if (wy <= 16.3) {
        // Meadows (5.6m to 16.3m): spawn wildflowers, berry bushes, pines, or rocks
        const rand = Math.random();
        if (rand < 0.35) {
          spawnObjectInEditor('flower', wx, wy, wz);
        } else if (rand < 0.55) {
          spawnObjectInEditor('pine', wx, wy, wz);
        } else if (rand < 0.75) {
          spawnObjectInEditor('berry_bush', wx, wy, wz);
        } else if (rand < 0.9) {
          spawnObjectInEditor('land_rock', wx, wy, wz);
        }
      } else if (wy <= 21.7) {
        // Forest (16.3m to 21.7m): spawn pines and land rocks
        const rand = Math.random();
        if (rand < 0.65) {
          spawnObjectInEditor('pine', wx, wy, wz);
        } else if (rand < 0.85) {
          spawnObjectInEditor('land_rock', wx, wy, wz);
        } else {
          spawnObjectInEditor('berry_bush', wx, wy, wz);
        }
      } else {
        // High mountain (above 21.7m): no trees allowed! Only rocks and gold ores
        if (Math.random() < 0.65) {
          spawnObjectInEditor('land_rock', wx, wy, wz);
        } else {
          spawnObjectInEditor('ore', wx, wy, wz);
        }
      }
    }
  }
}

// Spawn object in scene
function placeObject() {
  if (currentToolType === null) {
    // Pick up / Move mode
    raycaster.setFromCamera(mouse, camera);
    const meshesToTest = [];
    editorObjects.forEach(obj => {
      obj.mesh.traverse(child => {
        if (child.isMesh) {
          child.userData.ownerMeta = obj;
          meshesToTest.push(child);
        }
      });
    });

    const intersects = raycaster.intersectObjects(meshesToTest);
    if (intersects.length > 0) {
      const hitMesh = intersects[0].object;
      const meta = hitMesh.userData.ownerMeta;
      if (meta) {
        // Pick it up: copy properties
        currentToolType = meta.type;
        rotationY = meta.rotationY || 0;
        
        // Remove old mesh from scene
        scene.remove(meta.mesh);
        if (meta.mesh === playerSpawnMarker) playerSpawnMarker = null;
        editorObjects = editorObjects.filter(o => o !== meta);

        updatePreviewMesh();
        updatePreviewPosition();
        updateSidebarSelection();
      }
    }
    return;
  }

  const intersect = getTerrainIntersection();

  if (intersect) {
    const hitPoint = intersect.point;

    // Sculpt or Erase Terrain/Scenery Brush
    if (currentToolType === 'sculpt_up' || currentToolType === 'sculpt_down' || currentToolType === 'erase_area') {
      applySculpt(hitPoint);
      return;
    }

    // Procedural Island Spawning Brush
    if (currentToolType === 'generate_island') {
      const genre = document.getElementById('island-genre-select').value;
      generateProceduralIsland(hitPoint, Math.max(brushWidth, brushLength), genre);
      return;
    }

    const wx = hitPoint.x;
    const wz = hitPoint.z;
    const wy = hitPoint.y;

    let visualMesh;
    let type = currentToolType;
    let offset = 0;

    // Build the visual mesh
    if (type === 'pine') {
      visualMesh = createPineTree();
    } else if (type === 'palm') {
      visualMesh = createPalmTree();
      offset = -0.1;
    } else if (type === 'land_rock') {
      visualMesh = createLandRockMesh();
    } else if (type === 'marine_rock') {
      visualMesh = createMarineRockMesh();
    } else if (type === 'ore') {
      visualMesh = createOreDepositMesh();
      offset = -0.2;
    } else if (type === 'berry_bush') {
      visualMesh = createBerryBushMesh();
    } else if (type === 'cane') {
      visualMesh = createCanePlant();
    } else if (type === 'flower') {
      visualMesh = createFlowerMesh();
    } else if (type === 'starfish') {
      visualMesh = createStarfishMesh();
    } else if (type === 'player_spawn') {
      // If player spawn already exists, remove it first
      if (playerSpawnMarker) {
        scene.remove(playerSpawnMarker);
        editorObjects = editorObjects.filter(o => o.type !== 'player_spawn');
      }
      const geom = new THREE.CylinderGeometry(0.5, 0.5, 1.8, 16);
      const mat = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.8 });
      visualMesh = new THREE.Mesh(geom, mat);
      offset = 0.9;
      playerSpawnMarker = visualMesh;
    } else if (type === 'spawn_rooster') {
      const geom = new THREE.BoxGeometry(0.6, 0.6, 0.6);
      const mat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.8 });
      visualMesh = new THREE.Mesh(geom, mat);
      offset = 0.3;
    } else if (type === 'spawn_hen') {
      const geom = new THREE.BoxGeometry(0.5, 0.5, 0.5);
      const mat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.8 });
      visualMesh = new THREE.Mesh(geom, mat);
      offset = 0.25;
    } else if (type === 'spawn_crab') {
      const geom = new THREE.BoxGeometry(0.4, 0.15, 0.3);
      const mat = new THREE.MeshBasicMaterial({ color: 0xd97706, transparent: true, opacity: 0.8 });
      visualMesh = new THREE.Mesh(geom, mat);
      offset = 0.075;
    } else if (type === 'spawn_fish') {
      const geom = new THREE.BoxGeometry(0.4, 0.2, 0.15);
      const mat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.8 });
      visualMesh = new THREE.Mesh(geom, mat);
      offset = 0.1;
    } else if (type === 'spawn_seagull') {
      const geom = new THREE.ConeGeometry(0.3, 0.6, 8);
      const mat = new THREE.MeshBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.8 });
      visualMesh = new THREE.Mesh(geom, mat);
      offset = 0.3;
    }

    if (visualMesh) {
      visualMesh.position.set(wx, wy + offset, wz);
      visualMesh.rotation.y = rotationY;
      scene.add(visualMesh);

      // Register object metadata
      const objMeta = {
        type: type,
        x: wx,
        y: wy + offset,
        z: wz,
        rotationY: rotationY,
        scale: 1.0,
        mesh: visualMesh
      };
      editorObjects.push(objMeta);
    }
  }
}

// Remove hovered object from scene
function deleteObject() {
  raycaster.setFromCamera(mouse, camera);
  
  // Build a list of all current placed meshes
  const meshesToTest = [];
  editorObjects.forEach(obj => {
    obj.mesh.traverse(child => {
      if (child.isMesh) {
        child.userData.ownerMeta = obj; // Reference link
        meshesToTest.push(child);
      }
    });
  });

  const intersects = raycaster.intersectObjects(meshesToTest);
  if (intersects.length > 0) {
    const hitMesh = intersects[0].object;
    const meta = hitMesh.userData.ownerMeta;
    
    if (meta) {
      scene.remove(meta.mesh);
      if (meta.mesh === playerSpawnMarker) playerSpawnMarker = null;
      editorObjects = editorObjects.filter(o => o !== meta);
    }
  }
}

// Track mouse positioning, continuous drag-sculpting, and vertical drag-extrusion
function onMouseMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  if (isSculpting) {
    const intersect = getTerrainIntersection();
    if (intersect) {
      const hitPoint = intersect.point;
      const dist = hitPoint.distanceTo(lastSculptPoint);
      if (dist > 1.6) { // Only sculpt if moved at least 1.6m (1 voxel spacing)
        lastSculptPoint.copy(hitPoint);
        applySculpt(hitPoint);
      }
    }
  } else if (isExtruding) {
    const deltaY = (event.clientY - extrudeStartMouseY) * -0.2;
    updateExtrude(deltaY);
  }
}

// Start sculpting/extruding drag session or place object on left click
function onPointerDown(event) {
  // Only trigger if clicking inside the main viewport (not over HUD sidebar)
  if (event.clientX < 340 && event.clientY > 110) return; // Ignore clicks inside sidebar
  if (event.clientY < 90) return; // Ignore clicks inside top bar

  if (event.button === 0) { // Left Click
    if (event.ctrlKey) return; // Allow panning with ctrl+click without placing
    
    // Check if we are starting a sculpting drag session
    if (currentToolType === 'sculpt_up' || currentToolType === 'sculpt_down' || currentToolType === 'sculpt_smooth' || currentToolType === 'sculpt_flatten' || currentToolType === 'erase_area') {
      isSculpting = true;
      controls.enabled = false; // Disable camera OrbitControls
      
      const intersect = getTerrainIntersection();
      if (intersect) {
        const hitPoint = intersect.point;
        if (currentToolType === 'sculpt_flatten') {
          flattenTargetHeight = hitPoint.y;
        }
        lastSculptPoint.copy(hitPoint);
        applySculpt(hitPoint);
      }
    } else if (currentToolType === 'extrude') {
      if (selectToolMode === 'add' || selectToolMode === 'sub') {
        isSculpting = true;
        controls.enabled = false; // Disable camera OrbitControls
        
        const intersect = getTerrainIntersection();
        if (intersect) {
          const hitPoint = intersect.point;
          lastSculptPoint.copy(hitPoint);
          applySculpt(hitPoint);
        }
      } else {
        isExtruding = true;
        extrudeStartMouseY = event.clientY;
        controls.enabled = false; // Disable camera OrbitControls
        
        const intersect = getTerrainIntersection();
        if (intersect) {
          const hitPoint = intersect.point;
          startExtrude(hitPoint);
        }
      }
    } else {
      placeObject();
    }
  } else if (event.button === 2) { // Right Click
    if (currentToolType !== null) {
      // Cancel active selection / enter move mode
      currentToolType = null;
      updatePreviewMesh();
      updateSidebarSelection();
    } else {
      // Free hands: delete object
      deleteObject();
    }
  }
}

function onPointerUp(event) {
  if (isSculpting) {
    isSculpting = false;
    controls.enabled = true; // Re-enable camera rotation
  } else if (isExtruding) {
    commitExtrude();
    isExtruding = false;
    controls.enabled = true; // Re-enable camera rotation
  }
}

function onPointerLeave(event) {
  if (isSculpting) {
    isSculpting = false;
    controls.enabled = true; // Re-enable camera rotation
  } else if (isExtruding) {
    commitExtrude();
    isExtruding = false;
    controls.enabled = true; // Re-enable camera rotation
  }
}

// Hotkey listeners (e.g. rotation, keyboard movement)
function onKeyDown(event) {
  if (event.key === 'r' || event.key === 'R') {
    rotationY += Math.PI / 4; // Rotate 45 degrees
    if (rotationY >= Math.PI * 2) rotationY = 0;
    updatePreviewPosition();
  }

  if (event.key === 'Shift') {
    activeKeys.shift = true;
  }

  const key = event.key.toLowerCase();
  if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
    activeKeys[key] = true;
  }
}

function onKeyUp(event) {
  if (event.key === 'Shift') {
    activeKeys.shift = false;
  }

  const key = event.key.toLowerCase();
  if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
    activeKeys[key] = false;
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Export Map to JSON file
async function exportMapJSON() {
  const mapData = serializeMapData();
  const dataStr = JSON.stringify(mapData, null, 2);

  // Check if FileSystem Access API is supported
  if (window.showSaveFilePicker) {
    try {
      const options = {
        suggestedName: 'custom_map.json',
        types: [{
          description: 'JSON Map File',
          accept: {
            'application/json': ['.json']
          }
        }]
      };
      const handle = await window.showSaveFilePicker(options);
      const writable = await handle.createWritable();
      await writable.write(dataStr);
      await writable.close();
    } catch (err) {
      // Ignore AbortError if user cancels the save dialog
      if (err.name !== 'AbortError') {
        console.error("Save picker failed, falling back to download:", err);
        fallbackDownload(dataStr);
      }
    }
  } else {
    fallbackDownload(dataStr);
  }
}

function fallbackDownload(dataStr) {
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", url);
  downloadAnchor.setAttribute("download", "custom_map.json");
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  URL.revokeObjectURL(url);
}

// Compile Map Data into JSON Structure
function serializeMapData() {
  const objectsMeta = [];
  let playerSpawn = null;

  editorObjects.forEach(obj => {
    if (obj.type === 'player_spawn') {
      playerSpawn = { x: obj.x, y: obj.y, z: obj.z };
    } else {
      objectsMeta.push({
        type: obj.type,
        x: obj.x,
        y: obj.y,
        z: obj.z,
        rotationY: obj.rotationY,
        scale: obj.scale
      });
    }
  });

  return {
    version: "v0.080",
    playerSpawn: playerSpawn,
    carvedVoxels: world.carvedVoxels || {},
    objects: objectsMeta,
    seaLevel: world.seaLevel !== undefined ? world.seaLevel : 4.0
  };
}

// Play Test the Map
function playTestMap() {
  const mapData = serializeMapData();
  localStorage.setItem('custom_map_data', JSON.stringify(mapData));
  window.location.href = '../index.html'; // Load main game
}

// Import Map from JSON object
function importMapJSON(mapData) {
  // Clear existing placed meshes
  editorObjects.forEach(obj => scene.remove(obj.mesh));
  editorObjects = [];
  if (playerSpawnMarker) {
    scene.remove(playerSpawnMarker);
    playerSpawnMarker = null;
  }

  // Restore objects
  if (mapData.objects) {
    mapData.objects.forEach(obj => {
      let visualMesh;
      let offset = 0;

      if (obj.type === 'pine') {
        visualMesh = createPineTree();
      } else if (obj.type === 'palm') {
        visualMesh = createPalmTree();
        offset = -0.1;
      } else if (obj.type === 'land_rock') {
        visualMesh = createLandRockMesh();
      } else if (obj.type === 'marine_rock') {
        visualMesh = createMarineRockMesh();
      } else if (obj.type === 'ore') {
        visualMesh = createOreDepositMesh();
        offset = -0.2;
      } else if (obj.type === 'berry_bush') {
        visualMesh = createBerryBushMesh();
      } else if (obj.type === 'cane') {
        visualMesh = createCanePlant();
      } else if (obj.type === 'flower') {
        visualMesh = createFlowerMesh();
      } else if (obj.type === 'starfish') {
        visualMesh = createStarfishMesh();
      } else if (obj.type === 'spawn_rooster') {
        const geom = new THREE.BoxGeometry(0.6, 0.6, 0.6);
        const mat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.8 });
        visualMesh = new THREE.Mesh(geom, mat);
        offset = 0.3;
      } else if (obj.type === 'spawn_hen') {
        const geom = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const mat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.8 });
        visualMesh = new THREE.Mesh(geom, mat);
        offset = 0.25;
      } else if (obj.type === 'spawn_crab') {
        const geom = new THREE.BoxGeometry(0.4, 0.15, 0.3);
        const mat = new THREE.MeshBasicMaterial({ color: 0xd97706, transparent: true, opacity: 0.8 });
        visualMesh = new THREE.Mesh(geom, mat);
        offset = 0.075;
      } else if (obj.type === 'spawn_fish') {
        const geom = new THREE.BoxGeometry(0.4, 0.2, 0.15);
        const mat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.8 });
        visualMesh = new THREE.Mesh(geom, mat);
        offset = 0.1;
      } else if (obj.type === 'spawn_seagull') {
        const geom = new THREE.ConeGeometry(0.3, 0.6, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.8 });
        visualMesh = new THREE.Mesh(geom, mat);
        offset = 0.3;
      }

      if (visualMesh) {
        visualMesh.position.set(obj.x, obj.y, obj.z);
        visualMesh.rotation.y = obj.rotationY || 0;
        scene.add(visualMesh);

        editorObjects.push({
          type: obj.type,
          x: obj.x,
          y: obj.y,
          z: obj.z,
          rotationY: obj.rotationY || 0,
          scale: obj.scale || 1.0,
          mesh: visualMesh
        });
      }
    });
  }

  // Restore Player Spawn Marker
  if (mapData.playerSpawn) {
    const p = mapData.playerSpawn;
    const geom = new THREE.CylinderGeometry(0.5, 0.5, 1.8, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.8 });
    const visualMesh = new THREE.Mesh(geom, mat);
    visualMesh.position.set(p.x, p.y, p.z);
    scene.add(visualMesh);
    playerSpawnMarker = visualMesh;

    editorObjects.push({
      type: 'player_spawn',
      x: p.x,
      y: p.y,
      z: p.z,
      rotationY: 0,
      scale: 1.0,
      mesh: visualMesh
    });
  }

  // Restore carved voxels
  if (mapData.carvedVoxels) {
    world.carvedVoxels = mapData.carvedVoxels;
  } else {
    world.carvedVoxels = {};
  }
  generateDensityGrid();
  buildMarchingCubesMesh();

  // Restore sea level
  if (mapData.seaLevel !== undefined) {
    world.seaLevel = mapData.seaLevel;
    const seaSlider = document.getElementById('sea-level-slider');
    const seaValueLabel = document.getElementById('sea-level-value');
    if (seaSlider && seaValueLabel) {
      seaSlider.value = mapData.seaLevel;
      seaValueLabel.textContent = `${mapData.seaLevel.toFixed(1)}m`;
    }
    if (world.waterMesh) {
      world.waterMesh.position.y = mapData.seaLevel;
    }
  }
}

// Reset map to default state
function resetMap() {
  localStorage.removeItem('custom_map_data');
  location.reload(); // Reload page to load fresh default virgin map
}

// Prevent browser context menu on right click
window.addEventListener('contextmenu', e => e.preventDefault());

// Start the Editor
window.onload = initEditor;
