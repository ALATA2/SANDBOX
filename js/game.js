import * as THREE from 'three';
import { initControls, updateControls } from './controls.js';
import { initWorld, updateWorld } from './world.js';
import { initPlayer, updatePlayer } from './player.js';
import { initInteraction, updateInteraction } from './interact.js';

// Global Game State
export const game = {
  scene: null,
  camera: null,
  renderer: null,
  clock: null,
  lights: {
    ambient: null,
    sun: null
  },
  pointerLocked: false
};

const blocker = document.getElementById('blocker');
const startButton = document.getElementById('start-button');

// Initialize the 3D Game Engine
function init() {
  // 1. Create Scene
  game.scene = new THREE.Scene();
  // Sunset atmospheric fog (pink/purple gradient blend)
  game.scene.background = new THREE.Color(0xfc8c82); // Warm peach/pink
  game.scene.fog = new THREE.FogExp2(0xfc8c82, 0.015);

  // 2. Create Camera (FPS perspective)
  game.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  game.camera.position.set(25, 8, 25); // Starting position above ground

  // 3. Create WebGL Renderer
  game.renderer = new THREE.WebGLRenderer({ antialias: true });
  game.renderer.setSize(window.innerWidth, window.innerHeight);
  game.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  game.renderer.shadowMap.enabled = true;
  game.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  game.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  game.renderer.toneMappingExposure = 1.0;
  
  const container = document.getElementById('canvas-container');
  container.appendChild(game.renderer.domElement);

  // 4. Create Golden Hour Lights
  // Purple/pink ambient fill light to mimic sky reflection
  game.lights.ambient = new THREE.AmbientLight(0x4a2e5c, 1.2); 
  game.scene.add(game.lights.ambient);

  // Directional Golden/Orange Sun light at a low angle
  game.lights.sun = new THREE.DirectionalLight(0xffaa44, 2.5);
  game.lights.sun.position.set(-60, 20, -20); // Low sun angle
  game.lights.sun.castShadow = true;
  
  // Shadow camera config
  game.lights.sun.shadow.mapSize.width = 2048;
  game.lights.sun.shadow.mapSize.height = 2048;
  game.lights.sun.shadow.camera.near = 0.5;
  game.lights.sun.shadow.camera.far = 200;
  
  const shadowRange = 50;
  game.lights.sun.shadow.camera.left = -shadowRange;
  game.lights.sun.shadow.camera.right = shadowRange;
  game.lights.sun.shadow.camera.top = shadowRange;
  game.lights.sun.shadow.camera.bottom = -shadowRange;
  game.lights.sun.shadow.bias = -0.0005;
  
  game.scene.add(game.lights.sun);

  // 5. Setup Clock for frame-independent movement
  game.clock = new THREE.Clock();

  // 6. Initialize Sub-modules
  initControls();
  initWorld();
  initPlayer();
  initInteraction();

  // 7. Event Listeners
  window.addEventListener('resize', onWindowResize);
  
  // PointerLock controls trigger
  startButton.addEventListener('click', () => {
    // Attempt to lock pointer via controls
    // controls.lock() will trigger pointerlockchange
    const controls = game.controls;
    if (controls) {
      controls.lock();
    }
  });

  // Handle pointerlock change
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === game.renderer.domElement) {
      blocker.style.display = 'none';
      game.pointerLocked = true;
    } else {
      blocker.style.display = 'flex';
      game.pointerLocked = false;
    }
  });

  // 8. Start Game Loop
  animate();
}

function onWindowResize() {
  game.camera.aspect = window.innerWidth / window.innerHeight;
  game.camera.updateProjectionMatrix();
  game.renderer.setSize(window.innerWidth, window.innerHeight);
}

// Main Game Loop
function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(game.clock.getDelta(), 0.1); // Cap delta to avoid giant physics steps

  if (game.pointerLocked) {
    // Update modules
    updateControls(delta);
    updatePlayer(delta);
    updateWorld(delta);
    updateInteraction(delta);
  }

  // Render scene
  game.renderer.render(game.scene, game.camera);
}

// Run engine initialization on load
window.onload = init;
