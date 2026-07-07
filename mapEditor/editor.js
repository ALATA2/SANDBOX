import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { game } from '../js/game.js';
import { 
  world, 
  initWorld, 
  createPalmTree, 
  createPineTree, 
  createLandRockMesh, 
  createMarineRockMesh, 
  createOreDepositMesh, 
  createBerryBushMesh, 
  createCanePlant, 
  createFlowerMesh, 
  createStarfishMesh 
} from '../js/world.js';
import { getSurfaceHeightNear } from '../js/physics.js';

// Global Editor State
let scene, camera, renderer, controls;
let currentToolType = 'pine'; // Default selected object
let rotationY = 0; // Current placement rotation
let editorObjects = []; // Array of placed editor object metadata
let playerSpawnMarker = null; // Single player spawn marker
let previewMesh = null; // Ghost preview mesh

// Raycasting & Mouse
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // Horizontal intersection backup

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

  // 7. Event Listeners
  window.addEventListener('resize', onWindowResize);
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('keydown', onKeyDown);

  setupUI();

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
  
  controls.update();
  
  // Position the preview mesh on terrain
  updatePreviewPosition();

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
}

// Create appropriate 3D mesh for the ghost preview
function updatePreviewMesh() {
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

// Raycast onto the terrain to set preview position
function updatePreviewPosition() {
  if (!previewMesh) return;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(world.terrainMesh);

  if (intersects.length > 0) {
    const hitPoint = intersects[0].point;
    
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

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(world.terrainMesh);

  if (intersects.length > 0) {
    const hitPoint = intersects[0].point;
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

// Track mouse positioning
function onMouseMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

// Place on left click, delete on right click
function onPointerDown(event) {
  // Only trigger if clicking inside the main viewport (not over HUD sidebar)
  if (event.clientX < 340 && event.clientY > 110) return; // Ignore clicks inside sidebar
  if (event.clientY < 90) return; // Ignore clicks inside top bar

  if (event.button === 0) { // Left Click
    if (event.ctrlKey) return; // Allow panning with ctrl+click without placing
    placeObject();
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

// Hotkey listeners (e.g. rotation)
function onKeyDown(event) {
  if (event.key === 'r' || event.key === 'R') {
    rotationY += Math.PI / 4; // Rotate 45 degrees
    if (rotationY >= Math.PI * 2) rotationY = 0;
    updatePreviewPosition();
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Export Map to JSON file
function exportMapJSON() {
  const mapData = serializeMapData();
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(mapData, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", "custom_map.json");
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
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
    carvedVoxels: {}, // In future expand to terrain carving
    objects: objectsMeta
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
}

// Reset map to default state
function resetMap() {
  editorObjects.forEach(obj => scene.remove(obj.mesh));
  editorObjects = [];
  if (playerSpawnMarker) {
    scene.remove(playerSpawnMarker);
    playerSpawnMarker = null;
  }
  localStorage.removeItem('custom_map_data');
}

// Prevent browser context menu on right click
window.addEventListener('contextmenu', e => e.preventDefault());

// Start the Editor
window.onload = initEditor;
