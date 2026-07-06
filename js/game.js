import * as THREE from 'three';
import { initControls, updateControls, joystickValues, triggerMobileJump } from './controls.js';
import { initWorld, updateWorld, world, getSurfaceHeightNear, checkInWater, getWaterHeightAt, scrollWorld } from './world.js';
import { initPlayer, updatePlayer, triggerToolSwing, player } from './player.js';
import { initInteraction, updateInteraction, harvestClosestDebris, nearFeedbackBoard, activeDebris } from './interact.js';
import { startDrone, stopDrone, playHover, playSelect, playLaunch, startCoreHover, stopCoreHover, getMuted, setMute, setSubmergedAudio, startAmbientSounds, stopAmbientSounds, playWoodChop } from './audio.js';
import { setLanguage, currentLang } from './lang.js';
import { initMenuParticles, initUnderwaterParticles, initRainParticles, updateMenuParticles, updateUnderwaterParticles, updateRainParticles, menuParticles } from './particles.js';
import { updateShadowCamera } from './shadows.js';
import { updateFaunaAI } from './fauna.js';
import { updateOceanWaves } from './water.js';
import { currentPreset, updateWeatherAndOrbit, presets, applyPreset, updateUnderwaterVisuals, wasSubmerged } from './weather.js';
import { getDom, bindPerfProtocolsUI, initTerminalLogger } from './ui.js';

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
  pointerLocked: false,
  isMobile: false,
  sunMesh: null,
  sunHaloMesh: null,
  moonMesh: null,
  moonHaloMesh: null,
  time: 0,
  paused: false,
  roosterMesh: null,
  henMesh: null,
  crabs: [],
  fishes: [],
  seagulls: [],
  worms: [],
  raftConstructed: false,
  raftState: {
    active: false,
    position: new THREE.Vector3(80.0, 4.05, 127.2),
    rotationY: 0,
    speed: 0,
    lastSplashTime: 0
  },
  shadowsEnabled: true,
  windSwayEnabled: true,
  renderScale: 1.0
};

let underwaterParticles = null;

const blocker = document.getElementById('blocker');
const startButton = document.getElementById('start-button');
const startContainer = document.getElementById('start-container');

let cameraShake = 0;
let fpsFrameCount = 0;
let fpsLastTime = performance.now();
const sunDir = new THREE.Vector3();
const moonDir = new THREE.Vector3();
const cameraPosFallback = new THREE.Vector3();

// Initialize the 3D Game Engine
function init() {
  // Detect mobile device touch support
  game.isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  if (game.isMobile) {
    document.body.classList.add('is-mobile');
  }

  // 1. Create Scene
  game.scene = new THREE.Scene();
  // Clear scene background to make WebGL canvas transparent for CSS gradients
  game.scene.background = null;
  game.scene.fog = new THREE.FogExp2(presets.sunset.bg, presets.sunset.fogDensity);

  // 2. Create Camera (FPS perspective)
  game.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 24000);
  game.camera.position.set(75, 8, 75); // Starting position above ground

  // 3. Create WebGL Renderer
  game.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  game.renderer.setSize(window.innerWidth, window.innerHeight);
  game.renderer.setClearColor(0x000000, 0); // Transparent canvas background
  game.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  game.renderer.shadowMap.enabled = !game.isMobile;
  game.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  game.renderer.shadowMap.autoUpdate = true; // Continuous shadow updates for smooth frame pacing
  game.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  game.renderer.toneMappingExposure = 1.0;
  
  const container = document.getElementById('canvas-container');
  container.appendChild(game.renderer.domElement);

  // Query WebGL GPU information
  let gpuName = 'Unknown';
  try {
    const gl = game.renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      gpuName = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    }
  } catch (e) {
    console.warn("Could not query WebGL GPU info:", e);
  }
  console.log("WebGL GPU Renderer:", gpuName);
  game.gpuName = gpuName;

  // 4. Create Lights
  game.lights.ambient = new THREE.AmbientLight(presets.sunset.ambient, presets.sunset.ambientIntensity); 
  game.scene.add(game.lights.ambient);

  game.lights.sun = new THREE.DirectionalLight(presets.sunset.sun, presets.sunset.sunIntensity);
  game.lights.sun.position.copy(presets.sunset.sunPos);
  game.lights.sun.castShadow = true;
  
  // Shadow camera config
  game.lights.sun.shadow.mapSize.width = 1024;
  game.lights.sun.shadow.mapSize.height = 1024;
  game.lights.sun.shadow.camera.near = 0.5;
  game.lights.sun.shadow.camera.far = 120;
  
  const shadowRange = 30;
  game.lights.sun.shadow.camera.left = -shadowRange;
  game.lights.sun.shadow.camera.right = shadowRange;
  game.lights.sun.shadow.camera.top = shadowRange;
  game.lights.sun.shadow.camera.bottom = -shadowRange;
  game.lights.sun.shadow.bias = -0.0005;
  game.lights.sun.shadow.normalBias = 0.08;
  
  game.scene.add(game.lights.sun);

  // Create 3D Sun Disc (Disable fog so it remains bright and distinct)
  const sunGeom = new THREE.SphereGeometry(14, 8, 8); // Low-poly sphere
  const sunMat = new THREE.MeshBasicMaterial({ 
    color: presets.sunset.sunMeshColor, 
    toneMapped: false,
    fog: false 
  });
  game.sunMesh = new THREE.Mesh(sunGeom, sunMat);
  game.sunMesh.position.copy(presets.sunset.sunPos).normalize().multiplyScalar(180);
  game.scene.add(game.sunMesh);

  // Add a soft glowing low-poly halo around the sun/moon
  const haloGeom = new THREE.SphereGeometry(22, 8, 8);
  const haloMat = new THREE.MeshBasicMaterial({
    color: presets.sunset.sunMeshColor,
    toneMapped: false,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    fog: false
  });
  game.sunHaloMesh = new THREE.Mesh(haloGeom, haloMat);
  game.sunMesh.add(game.sunHaloMesh); // Add as child so it moves with the sun automatically

  // Create 3D Moon Disc as an extruded Crescent Shape (Disable fog so it remains bright and distinct)
  const moonShape = new THREE.Shape();
  // Outer circle: center (0,0), radius 12, arc from -PI/2 to PI/2
  moonShape.absarc(0, 0, 12, -Math.PI / 2, Math.PI / 2, false);
  // Inner circle: center (4.0, 0), radius 10.5, arc from PI/2 to -PI/2
  moonShape.absarc(4.0, 0, 10.5, Math.PI / 2, -Math.PI / 2, true);

  const extrudeSettings = {
    depth: 2.5,
    bevelEnabled: true,
    bevelThickness: 0.8,
    bevelSize: 0.4,
    bevelSegments: 1,
    curveSegments: 6 // Keep it low-poly
  };

  const moonGeom = new THREE.ExtrudeGeometry(moonShape, extrudeSettings);
  moonGeom.center(); // Center geometry pivot exactly

  const moonMat = new THREE.MeshBasicMaterial({ 
    color: 0xe6ffff, 
    toneMapped: false,
    fog: false 
  });
  game.moonMesh = new THREE.Mesh(moonGeom, moonMat);
  // Rotate the crescent moon slightly so its flat side faces the scene nicely
  game.moonMesh.rotation.y = Math.PI / 4;
  game.scene.add(game.moonMesh);

  // Add a soft glowing low-poly halo around the moon (crescent shape also for halo!)
  const moonHaloGeom = new THREE.ExtrudeGeometry(moonShape, {
    depth: 3.5,
    bevelEnabled: true,
    bevelThickness: 1.5,
    bevelSize: 1.2,
    bevelSegments: 1,
    curveSegments: 6
  });
  moonHaloGeom.center();

  const moonHaloMat = new THREE.MeshBasicMaterial({
    color: 0xe6ffff,
    toneMapped: false,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
    fog: false
  });
  game.moonHaloMesh = new THREE.Mesh(moonHaloGeom, moonHaloMat);
  game.moonMesh.add(game.moonHaloMesh); // Add as child so it moves with the moon automatically

  // 5. Setup Clock
  game.clock = new THREE.Clock();

  // 6. Initialize Sub-modules
  initControls();
  initWorld();
  initPlayer();
  initInteraction();

  // Spawn Arturo the Rooster
  game.roosterMesh = createRooster();
  const roosterSpawnY = getSurfaceHeightNear(84, 15, 84);
  game.roosterMesh.position.set(84, roosterSpawnY, 84);
  game.scene.add(game.roosterMesh);

  // Spawn Rosita the Hen
  game.henMesh = createHen();
  const henSpawnY = getSurfaceHeightNear(81, 15, 81);
  game.henMesh.position.set(81, henSpawnY, 81);
  game.scene.add(game.henMesh);

  // Spawn additional island life (crabs, fishes, seagulls)
  spawnFauna();

  // Initialize atmospheric particles
  initMenuParticles();
  initUnderwaterParticles();
  initRainParticles();

  // Apply default lighting preset color adjustments
  applyPreset('sunset');

  // 7. Event Listeners & UI Bindings
  window.addEventListener('resize', onWindowResize);
  
  // Start button hover sounds and click triggers
  startButton.addEventListener('click', (e) => {
    e.stopPropagation();
    playLaunch();
    
    // Add visual shake to portal menu
    const menu = document.getElementById('instructions');
    if (menu) {
      menu.classList.add('vibrate');
    }
    
    cameraShake = 5.0; // Heavy impact camera shake
    
    const controls = game.controls;
    if (controls) {
      if (game.isMobile) {
        // Mobile starts playing immediately without pointer lock
        blocker.style.display = 'none';
        game.pointerLocked = true;
        stopDrone();
        stopCoreHover();
        
        if (firstStart) {
          if (game.controls && game.controls.getObject) {
            game.controls.getObject().position.set(75, 8, 75);
          }
          firstStart = false;
        }
      } else {
        // Trigger Pointer Lock synchronously to avoid browser block
        controls.lock();
      }
    }
  });

  // Reactor Core container mouse events for hover synth riser
  if (startContainer) {
    startContainer.addEventListener('mouseenter', () => {
      startCoreHover();
    });
    startContainer.addEventListener('mouseleave', () => {
      stopCoreHover();
    });
  }

  // Handle pointerlock change
  let firstStart = true;

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === game.renderer.domElement) {
      blocker.style.display = 'none';
      
      // Close feedback board if pointer is locked (game focus)
      const feedbackModal = document.getElementById('feedback-modal');
      if (feedbackModal) {
        feedbackModal.style.display = 'none';
      }
      
      // Close inventory overlay if pointer is locked
      const inventoryOverlay = document.getElementById('inventory-overlay');
      if (inventoryOverlay) {
        inventoryOverlay.style.display = 'none';
      }
      
      // Close map overlay if pointer is locked
      const mapOverlay = document.getElementById('map-overlay');
      if (mapOverlay) {
        mapOverlay.style.display = 'none';
      }
      
      // Close confirmation modal & pause screen on relock
      const confirmModal = document.getElementById('confirm-modal');
      if (confirmModal) {
        confirmModal.style.display = 'none';
      }
      const pauseOverlay = document.getElementById('pause-overlay');
      if (pauseOverlay) {
        pauseOverlay.style.display = 'none';
      }
      
      game.pointerLocked = true;
      game.paused = false;
      if (game.controls) {
        game.controls.enabled = true;
      }
      stopDrone();
      stopCoreHover();
      startAmbientSounds(); // Play ambient waves and wind during gameplay
      cameraShake = 6.0; // Extra screen impact shake when entering world
      
      if (firstStart) {
        if (game.controls && game.controls.getObject) {
          game.controls.getObject().position.set(75, 8, 75);
        }
        firstStart = false;
      }
    } else {
      // If we were inside the active gameplay and pointer lock is lost (e.g. Escape key, Alt-tab, etc.)
      if (game.pointerLocked) {
        const feedbackModal = document.getElementById('feedback-modal');
        const inventoryOverlay = document.getElementById('inventory-overlay');
        const mapOverlay = document.getElementById('map-overlay');
        const isPeacefulUnlock = (feedbackModal && feedbackModal.style.display === 'flex') ||
                                 (inventoryOverlay && inventoryOverlay.style.display === 'flex') ||
                                 (mapOverlay && mapOverlay.style.display === 'flex');
        
        if (isPeacefulUnlock) {
          // Peacefully lost lock because a modal was opened
          game.pointerLocked = false;
          stopAmbientSounds();
          startDrone();
        } else {
          // Always show the exit confirmation modal when game focus is lost
          const confirmModal = document.getElementById('confirm-modal');
          if (confirmModal) {
            confirmModal.style.display = 'flex';
          }
          game.pointerLocked = false;
          game.paused = true;
          if (game.controls) {
            game.controls.enabled = false;
          }
          stopAmbientSounds();
          startDrone();
        }
      } else {
        // We were already outside active gameplay, just keep pointerLocked false
        game.pointerLocked = false;
      }
      
      // Reset menu vibration classes
      const menu = document.getElementById('instructions');
      if (menu) {
        menu.classList.remove('vibrate');
      }
    }
  });

  // Bind exit confirmation modal buttons
  const confirmYesBtn = document.getElementById('confirm-yes-btn');
  const confirmNoBtn = document.getElementById('confirm-no-btn');
  if (confirmYesBtn) {
    confirmYesBtn.addEventListener('click', () => {
      const confirmModal = document.getElementById('confirm-modal');
      if (confirmModal) confirmModal.style.display = 'none';
      
      // Go to main start menu blocker
      blocker.style.display = 'flex';
      game.pointerLocked = false;
      stopAmbientSounds();
      startDrone();
      
      firstStart = true; // Reset starting spawn coordinates trigger
    });
  }
  if (confirmNoBtn) {
    confirmNoBtn.addEventListener('click', () => {
      const confirmModal = document.getElementById('confirm-modal');
      if (confirmModal) confirmModal.style.display = 'none';
      
      // Re-lock and resume
      if (game.controls) {
        game.controls.lock();
      }
    });
  }

  // Key listener for Pause (P)
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyP') {
      if (game.pointerLocked) {
        togglePause();
      }
    }
  });

  // Mobile pause button support
  const mobilePauseBtn = document.getElementById('mobile-pause-btn');
  if (mobilePauseBtn) {
    mobilePauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePause();
    });
  }

  // Sound Mute Toggle UI Binding
  const muteBtn = document.getElementById('mute-toggle');
  if (muteBtn) {
    muteBtn.textContent = getMuted() ? '🔇' : '🔊';
    muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const nextMuted = !getMuted();
      setMute(nextMuted);
      muteBtn.textContent = nextMuted ? '🔇' : '🔊';
      if (!nextMuted) {
        playSelect();
      }
    });
  }

  // Language selection pills UI bindings
  const langPills = document.querySelectorAll('.lang-pill');
  langPills.forEach(pill => {
    if (pill.getAttribute('data-lang') === currentLang) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }

    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      const lang = pill.getAttribute('data-lang');
      setLanguage(lang);
      playSelect();
      
      langPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
    });
  });

  // Preset Buttons UI bindings
  const presetBtns = document.querySelectorAll('.preset-btn');
  presetBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const preset = btn.getAttribute('data-preset');
      applyPreset(preset);
      playSelect();
      
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Vibrate the HTML console panel
      const menu = document.getElementById('instructions');
      if (menu) {
        menu.classList.remove('vibrate');
        void menu.offsetWidth; // trigger reflow
        menu.classList.add('vibrate');
        setTimeout(() => menu.classList.remove('vibrate'), 200);
      }

      // Small thud camera shake
      cameraShake = 1.0;
    });
  });

  // Performance Settings bindings
  bindPerfProtocolsUI();

  // Setup scrolling terminal logger
  initTerminalLogger();

  // Start Drone synth on first user action (browser security bypass)
  const startDroneOnGesture = () => {
    startDrone();
    document.removeEventListener('click', startDroneOnGesture);
    document.removeEventListener('keydown', startDroneOnGesture);
  };
  document.addEventListener('click', startDroneOnGesture);
  document.addEventListener('keydown', startDroneOnGesture);

  // Initialize page translation
  setLanguage(currentLang);

  // Initialize feedback board system
  initFeedbackBoard();

  // Initialize mobile controls if mobile device detected
  initMobileControls();

  // 8. Start Game Loop
  animate();
}

function onWindowResize() {
  game.camera.aspect = window.innerWidth / window.innerHeight;
  game.camera.updateProjectionMatrix();
  game.renderer.setSize(window.innerWidth, window.innerHeight);
}



function animate() {
  requestAnimationFrame(animate);

  try {
    // Temporary FPS calculation
    fpsFrameCount++;
    const now = performance.now();
    if (now - fpsLastTime >= 1000) {
      const fps = Math.round((fpsFrameCount * 1000) / (now - fpsLastTime));
      const fpsEl = getDom('fps-counter');
      if (fpsEl) {
        const isSoftware = game.gpuName && (
          game.gpuName.includes('SwiftShader') || 
          game.gpuName.includes('Software') || 
          game.gpuName.includes('Basic Render')
        );
        let cleanGpu = 'Unknown';
        if (game.gpuName) {
          const match = game.gpuName.match(/ANGLE \((.*?), (.*?), (.*?)\)/);
          cleanGpu = match ? match[2] : game.gpuName;
          if (cleanGpu.length > 32) {
            cleanGpu = cleanGpu.substring(0, 30) + '...';
          }
        }
        fpsEl.textContent = `FPS: ${fps} | GPU: ${cleanGpu}`;
        fpsEl.style.color = isSoftware ? '#ff5555' : 'rgba(0, 255, 128, 0.75)';
      }
      fpsFrameCount = 0;
      fpsLastTime = now;
    }

  const delta = (game.pointerLocked && game.paused) ? 0 : Math.min(game.clock.getDelta(), 0.1);
  if (!game.paused) {
    game.time += delta;
  }

  // Animate low-poly water waves
  updateOceanWaves(delta, wasSubmerged);

  // Day / Night Cycle (Dynamically progressing)
  const cycleDuration = 240; // 4 minutes for a full day
  const cycleTime = game.time;
  const progress = (cycleTime / cycleDuration) % 1.0;
  const angle = progress * Math.PI * 2;

  // Orbit math: Sun and Moon rotate opposite to each other (Zero-alloc)
  sunDir.set(-Math.cos(angle), Math.sin(angle), -0.3).normalize();
  moonDir.set(Math.cos(angle), -Math.sin(angle), 0.3).normalize();

  const cameraPos = game.camera ? game.camera.position : cameraPosFallback.set(0, 0, 0);

  // Position Sun and Moon relative to camera to eliminate perspective parallax
  if (game.sunMesh) {
    game.sunMesh.position.copy(sunDir).multiplyScalar(180).add(cameraPos);
  }
  if (game.moonMesh) {
    game.moonMesh.position.copy(moonDir).multiplyScalar(180).add(cameraPos);
    game.moonMesh.lookAt(cameraPos);
  }

  const isDayTime = sunDir.y >= 0;

  // Slide the shadow frustum dynamically by centering the light's target on the camera position
  updateShadowCamera(cameraPos, sunDir, moonDir, isDayTime, currentPreset);

  // Dynamic Atmospheric Interpolation, Weather System, & Lighting Presets updates
  updateWeatherAndOrbit(delta, wasSubmerged, cameraPos, angle, sunDir, moonDir, (val) => { cameraShake = val; });

  // Apply camera shake decay
  if (cameraShake > 0) {
    cameraShake = Math.max(0, cameraShake - delta * 4.5);
  }

  // Check underwater state
  let isSubmerged = false;
  if (game.pointerLocked && game.controls && game.controls.getObject) {
    const camPos = game.controls.getObject().position;
    const waterHeight = getWaterHeightAt(camPos.x, camPos.z);
    isSubmerged = (camPos.y < waterHeight) && checkInWater(camPos.x, camPos.y, camPos.z);
  }
  updateUnderwaterVisuals(isSubmerged);

  if (game.pointerLocked) {
    if (menuParticles) menuParticles.visible = false;
    
    if (!game.paused) {
      // Update active game sub-modules
      updateControls(delta);
      updatePlayer(delta);
      updateWorld(delta);
      updateInteraction(delta);

      // Check for vertical world scrolling (sliding window)
      if (game.controls && game.controls.getObject) {
        const pObj = game.controls.getObject();
        if (pObj.position.y < 3.2 && (world.currentVirtualDepth || 0) < 1100) {
          scrollWorld('down');
        } else if (pObj.position.y > 15.0 && (world.currentVirtualDepth || 0) > 0) {
          scrollWorld('up');
        }
      }
      
      // Update Arturo Rooster
      updateRoosterBehavior(delta);
      
      // Update Rosita Hen
      updateHenBehavior(delta);
      
      // Update Island Life Fauna (crabs, fishes, seagulls)
      updateFaunaAI(delta);
      
      // Update underwater bubble particles
      updateUnderwaterParticles(delta);
      
      // Apply camera shake to playing camera if active
      if (cameraShake > 0) {
        const shakeX = (Math.random() - 0.5) * cameraShake * 0.08;
        const shakeY = (Math.random() - 0.5) * cameraShake * 0.08;
        const shakeZ = (Math.random() - 0.5) * cameraShake * 0.08;
        game.camera.position.x += shakeX;
        game.camera.position.y += shakeY;
        game.camera.position.z += shakeZ;
      }
    }
    
    // Update floating name tag position
    updateArturoLabel();
    updateRositaLabel();
  } else {
    const blocker = getDom('blocker');
    const isMainMenu = blocker && blocker.style.display !== 'none';
    if (menuParticles) menuParticles.visible = isMainMenu;

    // Cinematic menu rotation of the camera wrapper (game.controls.getObject())
    if (isMainMenu && game.controls && game.controls.getObject) {
      updateWorld(delta); // Let the lighthouse beam rotate in the menu
      updateMenuParticles(delta); // Let atmospheric particles float
      
      const time = Date.now() * 0.00015;
      const radius = 35;
      const cx = 32; // Center of island
      const cz = 32;
      
      const pObj = game.controls.getObject();
      pObj.position.x = cx + Math.sin(time) * radius;
      pObj.position.z = cz + Math.cos(time) * radius;
      pObj.position.y = 10 + Math.sin(time * 0.5) * 3;
      
      // Face camera towards the island center
      const target = new THREE.Vector3(cx, 4, cz);
      game.camera.lookAt(target);

      // Apply camera shake in menu view
      if (cameraShake > 0) {
        const shake = (Math.random() - 0.5) * cameraShake * 0.12;
        game.camera.position.x += (Math.random() - 0.5) * cameraShake * 0.12;
        game.camera.position.y += shake;
      }
      
      // Update real-time Telemetry Coordinates Display
      const latEl = getDom('telemetry-lat');
      const lngEl = getDom('telemetry-lng');
      const altEl = getDom('telemetry-alt');
      
      if (latEl) latEl.textContent = pObj.position.x.toFixed(2);
      if (lngEl) lngEl.textContent = pObj.position.z.toFixed(2);
      if (altEl) altEl.textContent = pObj.position.y.toFixed(2);
    }
  }

  // Render scene
  game.renderer.render(game.scene, game.camera);
  } catch (err) {
    console.error(err);
    const fpsEl = getDom('fps-counter');
    if (fpsEl) {
      fpsEl.textContent = `ERR: ${err.message.substring(0, 32)}`;
      fpsEl.style.color = '#ff3333';
    }
  }
}

// Pre-populate feedback if empty, and bind UI buttons
function initFeedbackBoard() {
  const defaultFeedbacks = [
    { text: "Che tramonto spettacolare! Bella atmosfera.", user: "@GamerIT", time: "2026-06-17 14:15" },
    { text: "Awesome low-poly visuals and smooth mining mechanics!", user: "@PixelLover", time: "2026-06-17 14:30" },
    { text: "Il faro in lontananza è bellissimo!", user: "@LighthouseKeeper", time: "2026-06-17 15:02" },
    { text: "Tip: hold Space to swim back up to the surface!", user: "@OceanExplorer", time: "2026-06-17 15:45" },
    { text: "J'adore le style rétro et la musique synthé!", user: "@Jean_Valjean", time: "2026-06-17 16:01" },
    { text: "¡Increíble la deformación del terreno en tiempo real!", user: "@Minero", time: "2026-06-17 16:10" }
  ];

  if (!localStorage.getItem('sandbox_feedbacks')) {
    localStorage.setItem('sandbox_feedbacks', JSON.stringify(defaultFeedbacks));
  }

  // Bind Submit Button
  const submitBtn = document.getElementById('feedback-submit');
  const inputEl = document.getElementById('feedback-input');
  const closeBtn = document.getElementById('feedback-close');

  if (submitBtn && inputEl) {
    const submitComment = () => {
      const text = inputEl.value.trim();
      if (!text) return;
      
      const feedbacks = JSON.parse(localStorage.getItem('sandbox_feedbacks') || '[]');
      
      // Get current date/time format YYYY-MM-DD HH:MM
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const timeStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
      
      feedbacks.push({
        text: text,
        user: `@You`,
        time: timeStr
      });
      
      localStorage.setItem('sandbox_feedbacks', JSON.stringify(feedbacks));
      inputEl.value = '';
      renderFeedbacks();
    };

    submitBtn.addEventListener('click', submitComment);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        submitComment();
      }
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      closeFeedbackBoard();
    });
  }
}

function renderFeedbacks() {
  const listEl = document.getElementById('feedback-list');
  if (!listEl) return;
  
  listEl.innerHTML = '';
  const feedbacks = JSON.parse(localStorage.getItem('sandbox_feedbacks') || '[]');
  
  feedbacks.forEach(item => {
    const itemEl = document.createElement('div');
    itemEl.className = 'feedback-item';
    
    const textEl = document.createElement('div');
    textEl.textContent = item.text;
    itemEl.appendChild(textEl);
    
    const metaEl = document.createElement('div');
    metaEl.className = 'feedback-item-meta';
    metaEl.textContent = `${item.user} • ${item.time}`;
    itemEl.appendChild(metaEl);
    
    listEl.appendChild(itemEl);
  });
  
  // Scroll to bottom
  listEl.scrollTop = listEl.scrollHeight;
}

window.openFeedbackBoard = function() {
  const modal = document.getElementById('feedback-modal');
  if (modal) {
    modal.style.display = 'flex';
    renderFeedbacks();
    
    // Focus input
    const inputEl = document.getElementById('feedback-input');
    if (inputEl) {
      setTimeout(() => inputEl.focus(), 100);
    }
  }
  
  if (game.isMobile) {
    game.pointerLocked = false;
  }
  if (game.controls) {
    game.controls.unlock();
  }
};

function closeFeedbackBoard() {
  const modal = document.getElementById('feedback-modal');
  if (modal) {
    modal.style.display = 'none';
  }
  
  if (game.isMobile) {
    game.pointerLocked = true;
  }
  if (game.controls) {
    game.controls.lock();
  }
}

// Mobile Controls Integration
let touchLookId = null;
let lastTouchX = 0;
let lastTouchY = 0;
const touchSensitivity = 0.005;

function initMobileControls() {
  if (!game.isMobile) return;

  const container = game.renderer.domElement;

  // 1. Touch camera rotation dragging (on the right half of the screen)
  container.addEventListener('touchstart', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.clientX > window.innerWidth / 2 && touchLookId === null) {
        touchLookId = touch.identifier;
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;
      }
    }
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (!game.pointerLocked) return;
    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i];
      if (touch.identifier === touchLookId) {
        const dx = touch.clientX - lastTouchX;
        const dy = touch.clientY - lastTouchY;

        game.camera.rotation.y -= dx * touchSensitivity;
        game.camera.rotation.x -= dy * touchSensitivity;
        game.camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, game.camera.rotation.x));

        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;
      }
    }
  }, { passive: true });

  const endTouchLook = (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === touchLookId) {
        touchLookId = null;
      }
    }
  };

  container.addEventListener('touchend', endTouchLook);
  container.addEventListener('touchcancel', endTouchLook);

  // 2. Initialize Left Joystick
  initJoystick();

  // 3. Action Buttons
  const attackBtn = document.getElementById('mobile-attack-btn');
  if (attackBtn) {
    attackBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      triggerToolSwing();
    }, { passive: false });
  }

  const jumpBtn = document.getElementById('mobile-jump-btn');
  if (jumpBtn) {
    jumpBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      triggerMobileJump();
    }, { passive: false });
  }

  const interactBtn = document.getElementById('mobile-interact-btn');
  if (interactBtn) {
    interactBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      triggerMobileInteraction();
    }, { passive: false });
  }

  // Double Click / Tap on Interaction Prompt
  const prompt = document.getElementById('interaction-prompt');
  if (prompt) {
    prompt.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerMobileInteraction();
    });
  }

  // 4. Pause Button
  const pauseBtn = document.getElementById('mobile-pause-btn');
  if (pauseBtn) {
    pauseBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      game.pointerLocked = false;
      blocker.style.display = 'flex';
      startDrone();
    }, { passive: false });
  }
}

function triggerMobileInteraction() {
  if (nearFeedbackBoard) {
    if (typeof window.openFeedbackBoard === 'function') {
      window.openFeedbackBoard();
    }
  } else {
    harvestClosestDebris();
  }
}

function initJoystick() {
  const joyContainer = document.getElementById('joystick-container');
  const joyThumb = document.getElementById('joystick-thumb');
  if (!joyContainer || !joyThumb) return;

  let joyTouchId = null;
  let joyStartX = 0;
  let joyStartY = 0;
  const maxLimit = 45; // Max displacement in pixels

  joyContainer.addEventListener('touchstart', (e) => {
    if (joyTouchId !== null) return;
    const touch = e.changedTouches[0];
    joyTouchId = touch.identifier;
    
    const rect = joyContainer.getBoundingClientRect();
    joyStartX = rect.left + rect.width / 2;
    joyStartY = rect.top + rect.height / 2;
  }, { passive: true });

  joyContainer.addEventListener('touchmove', (e) => {
    if (joyTouchId === null) return;
    
    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i];
      if (touch.identifier === joyTouchId) {
        let dx = touch.clientX - joyStartX;
        let dy = touch.clientY - joyStartY;
        
        const distance = Math.sqrt(dx*dx + dy*dy);
        if (distance > maxLimit) {
          dx = (dx / distance) * maxLimit;
          dy = (dy / distance) * maxLimit;
        }

        joyThumb.style.transform = `translate(${dx}px, ${dy}px)`;

        joystickValues.x = dx / maxLimit;
        joystickValues.y = dy / maxLimit;
      }
    }
  }, { passive: true });

  const endJoy = (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === joyTouchId) {
        joyTouchId = null;
        joyThumb.style.transform = `translate(0px, 0px)`;
        joystickValues.x = 0;
        joystickValues.y = 0;
      }
    }
  };

  joyContainer.addEventListener('touchend', endJoy);
  joyContainer.addEventListener('touchcancel', endJoy);
}

// Helper to create low-poly Rooster Arturo
function createRooster() {
  const group = new THREE.Group();
  
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8, flatShading: true }); // black body
  const neckMaterial = new THREE.MeshStandardMaterial({ color: 0xd84315, roughness: 0.8, flatShading: true }); // golden-red head/neck
  const combMaterial = new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.8, flatShading: true }); // red comb/wattle
  const beakMaterial = new THREE.MeshStandardMaterial({ color: 0xe0c068, roughness: 0.8, flatShading: true }); // yellow-beige beak/legs
  const tailMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8, flatShading: true }); // black tail

  // 1. Proud Plump Body (Main box + bulging chest)
  const bodyGeom = new THREE.BoxGeometry(0.3, 0.36, 0.44);
  const body = new THREE.Mesh(bodyGeom, bodyMaterial);
  body.position.set(0, 0.38, -0.02);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const chestGeom = new THREE.BoxGeometry(0.28, 0.28, 0.2);
  const chest = new THREE.Mesh(chestGeom, bodyMaterial);
  chest.position.set(0, 0.46, 0.12);
  chest.rotation.x = 0.25; // tilt up chest
  chest.castShadow = true;
  group.add(chest);

  // 2. Curved Neck & Head (Lower S-neck + Upper head)
  const lowerNeckGeom = new THREE.BoxGeometry(0.18, 0.26, 0.18);
  lowerNeckGeom.translate(0, 0.13, 0); // pivot at base
  const lowerNeck = new THREE.Mesh(lowerNeckGeom, neckMaterial);
  lowerNeck.position.set(0, 0.52, 0.12);
  lowerNeck.rotation.x = 0.35; // tilt forward
  lowerNeck.castShadow = true;
  group.add(lowerNeck);

  const headGeom = new THREE.BoxGeometry(0.14, 0.22, 0.16);
  headGeom.translate(0, 0.11, 0);
  const head = new THREE.Mesh(headGeom, neckMaterial);
  head.position.set(0, 0.72, 0.18);
  head.rotation.x = -0.15; // tilt back slightly
  head.castShadow = true;
  group.add(head);

  // 3. Beak (pointing forward along +Z)
  const beakGeom = new THREE.ConeGeometry(0.045, 0.12, 4);
  beakGeom.rotateX(Math.PI / 2); // point forward
  const beak = new THREE.Mesh(beakGeom, beakMaterial);
  beak.position.set(0, 0.78, 0.28);
  beak.castShadow = true;
  group.add(beak);

  // 4. Comb (crest on top of head, curving back)
  const combGeom = new THREE.BoxGeometry(0.035, 0.15, 0.22);
  combGeom.translate(0, 0.075, -0.04);
  const comb = new THREE.Mesh(combGeom, combMaterial);
  comb.position.set(0, 0.9, 0.16);
  comb.rotation.x = -0.3; // tilt back
  comb.castShadow = true;
  group.add(comb);

  // 5. Red Wattle (under beak)
  const wattleGeom = new THREE.BoxGeometry(0.03, 0.1, 0.07);
  wattleGeom.translate(0, -0.05, 0);
  const wattle = new THREE.Mesh(wattleGeom, combMaterial);
  wattle.position.set(0, 0.72, 0.22);
  wattle.castShadow = true;
  group.add(wattle);

  // 6. Fanned Tail Feathers (staggered flat blades fanning out)
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 0.44, -0.18);
  
  // Feather 1 (large center)
  const f1Geom = new THREE.BoxGeometry(0.04, 0.38, 0.18);
  f1Geom.translate(0, 0.19, -0.06);
  const f1 = new THREE.Mesh(f1Geom, tailMaterial);
  f1.rotation.x = -0.7; // angle up/back
  f1.castShadow = true;
  tailGroup.add(f1);

  // Feather 2 (higher vertical angle)
  const f2Geom = new THREE.BoxGeometry(0.035, 0.34, 0.16);
  f2Geom.translate(0, 0.17, -0.05);
  const f2 = new THREE.Mesh(f2Geom, tailMaterial);
  f2.rotation.x = -0.35; // pointing more up
  f2.castShadow = true;
  tailGroup.add(f2);

  // Feather 3 (lower horizontal angle)
  const f3Geom = new THREE.BoxGeometry(0.035, 0.3, 0.15);
  f3Geom.translate(0, 0.15, -0.04);
  const f3 = new THREE.Mesh(f3Geom, tailMaterial);
  f3.rotation.x = -1.05; // pointing further back
  f3.castShadow = true;
  tailGroup.add(f3);

  group.add(tailGroup);

  // 7. Legs & Detailed Feet (with toes)
  const leftLegGeom = new THREE.CylinderGeometry(0.015, 0.015, 0.2, 4);
  leftLegGeom.translate(0, -0.1, 0);
  const leftLeg = new THREE.Mesh(leftLegGeom, beakMaterial);
  leftLeg.position.set(-0.08, 0.22, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  // Left toes
  const leftFoot = new THREE.Group();
  leftFoot.position.set(-0.08, 0.02, 0);
  
  const toeGeom = new THREE.BoxGeometry(0.015, 0.012, 0.08);
  toeGeom.translate(0, 0, 0.04); // pivot at back
  
  const toeCenter = new THREE.Mesh(toeGeom, beakMaterial);
  toeCenter.castShadow = true;
  leftFoot.add(toeCenter);
  
  const toeLeft = new THREE.Mesh(toeGeom, beakMaterial);
  toeLeft.rotation.y = 0.35;
  toeLeft.castShadow = true;
  leftFoot.add(toeLeft);
  
  const toeRight = new THREE.Mesh(toeGeom, beakMaterial);
  toeRight.rotation.y = -0.35;
  toeRight.castShadow = true;
  leftFoot.add(toeRight);
  
  group.add(leftFoot);

  // Right Leg & Foot
  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.08;
  group.add(rightLeg);

  const rightFoot = leftFoot.clone();
  rightFoot.position.x = 0.08;
  group.add(rightFoot);

  // Scale the group slightly
  group.scale.setScalar(0.7);

  return group;
}

// Helper to create low-poly Hen Rosita
function createHen() {
  const group = new THREE.Group();
  
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xf5f5dc, roughness: 0.8, flatShading: true }); // beige body
  const neckMaterial = new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 0.8, flatShading: true }); // tan head/neck
  const combMaterial = new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.8, flatShading: true }); // red comb (small)
  const beakMaterial = new THREE.MeshStandardMaterial({ color: 0xe0c068, roughness: 0.8, flatShading: true }); // yellow beak/legs
  const tailMaterial = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.8, flatShading: true }); // brown tail feathers (small)

  // 1. Plump Body
  const bodyGeom = new THREE.BoxGeometry(0.26, 0.32, 0.38);
  const body = new THREE.Mesh(bodyGeom, bodyMaterial);
  body.position.set(0, 0.34, -0.02);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const chestGeom = new THREE.BoxGeometry(0.24, 0.24, 0.16);
  const chest = new THREE.Mesh(chestGeom, bodyMaterial);
  chest.position.set(0, 0.40, 0.1);
  chest.rotation.x = 0.2;
  chest.castShadow = true;
  group.add(chest);

  // 2. Neck & Head
  const lowerNeckGeom = new THREE.BoxGeometry(0.15, 0.20, 0.15);
  lowerNeckGeom.translate(0, 0.10, 0);
  const lowerNeck = new THREE.Mesh(lowerNeckGeom, neckMaterial);
  lowerNeck.position.set(0, 0.44, 0.1);
  lowerNeck.rotation.x = 0.3;
  lowerNeck.castShadow = true;
  group.add(lowerNeck);

  const headGeom = new THREE.BoxGeometry(0.12, 0.18, 0.14);
  headGeom.translate(0, 0.09, 0);
  const head = new THREE.Mesh(headGeom, neckMaterial);
  head.position.set(0, 0.60, 0.14);
  head.rotation.x = -0.15;
  head.castShadow = true;
  group.add(head);

  // 3. Beak
  const beakGeom = new THREE.ConeGeometry(0.035, 0.09, 4);
  beakGeom.rotateX(Math.PI / 2);
  const beak = new THREE.Mesh(beakGeom, beakMaterial);
  beak.position.set(0, 0.65, 0.22);
  beak.castShadow = true;
  group.add(beak);

  // 4. Tiny Comb
  const combGeom = new THREE.BoxGeometry(0.025, 0.08, 0.12);
  combGeom.translate(0, 0.04, -0.02);
  const comb = new THREE.Mesh(combGeom, combMaterial);
  comb.position.set(0, 0.74, 0.12);
  comb.rotation.x = -0.3;
  comb.castShadow = true;
  group.add(comb);

  // 5. Tiny Wattle (under beak)
  const wattleGeom = new THREE.BoxGeometry(0.02, 0.05, 0.04);
  wattleGeom.translate(0, -0.025, 0);
  const wattle = new THREE.Mesh(wattleGeom, combMaterial);
  wattle.position.set(0, 0.60, 0.17);
  wattle.castShadow = true;
  group.add(wattle);

  // 6. Tiny Tail Feathers
  const tailGeom = new THREE.BoxGeometry(0.03, 0.16, 0.1);
  tailGeom.translate(0, 0.08, -0.03);
  const tail = new THREE.Mesh(tailGeom, tailMaterial);
  tail.position.set(0, 0.42, -0.18);
  tail.rotation.x = -0.5;
  tail.castShadow = true;
  group.add(tail);

  // 7. Legs & Feet
  const leftLegGeom = new THREE.CylinderGeometry(0.012, 0.012, 0.16, 4);
  leftLegGeom.translate(0, -0.08, 0);
  const leftLeg = new THREE.Mesh(leftLegGeom, beakMaterial);
  leftLeg.position.set(-0.06, 0.18, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  const leftFoot = new THREE.Group();
  leftFoot.position.set(-0.06, 0.02, 0);
  const toeGeom = new THREE.BoxGeometry(0.012, 0.01, 0.06);
  toeGeom.translate(0, 0, 0.03);
  const toeCenter = new THREE.Mesh(toeGeom, beakMaterial);
  toeCenter.castShadow = true;
  leftFoot.add(toeCenter);
  const toeLeft = new THREE.Mesh(toeGeom, beakMaterial);
  toeLeft.rotation.y = 0.35;
  toeLeft.castShadow = true;
  leftFoot.add(toeLeft);
  const toeRight = new THREE.Mesh(toeGeom, beakMaterial);
  toeRight.rotation.y = -0.35;
  toeRight.castShadow = true;
  leftFoot.add(toeRight);
  group.add(leftFoot);

  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.06;
  group.add(rightLeg);

  const rightFoot = leftFoot.clone();
  rightFoot.position.x = 0.06;
  group.add(rightFoot);

  group.scale.setScalar(0.7);

  return group;
}

let roosterState = 'idle'; // 'idle', 'walking', 'pecking'
let roosterTimer = 2.0;
let roosterTarget = new THREE.Vector3();
let peckTimer = 0;

function updateRoosterBehavior(delta) {
  if (!game.roosterMesh) return;

  const mesh = game.roosterMesh;
  roosterTimer -= delta;

  // Snap Y to terrain height
  const groundY = getSurfaceHeightNear(mesh.position.x, 15, mesh.position.z);
  
  if (roosterState === 'idle') {
    // Stand still, slight idle breathe
    mesh.position.y = groundY;
    mesh.rotation.x = Math.sin(game.time * 5.0) * 0.03; // breathing tilt
    mesh.rotation.z = 0;
    
    if (roosterTimer <= 0) {
      if (Math.random() < 0.65) {
        roosterState = 'pecking';
        roosterTimer = 1.5 + Math.random() * 2.0;
        peckTimer = 0;
      } else {
        roosterState = 'walking';
        roosterTimer = 8.0; // timeout
        let attempts = 0;
        let tx = mesh.position.x;
        let tz = mesh.position.z;
        let ty = groundY;
        while (attempts < 10) {
          const dist = 3.0 + Math.random() * 5.0;
          const ang = Math.random() * Math.PI * 2;
          tx = mesh.position.x + Math.cos(ang) * dist;
          tz = mesh.position.z + Math.sin(ang) * dist;
          // Stay inside world bounds
          tx = Math.max(5, Math.min(world.sizeX * world.spacing - 5, tx));
          tz = Math.max(5, Math.min(world.sizeZ * world.spacing - 5, tz));
          ty = getSurfaceHeightNear(tx, 15, tz);
          if (ty > 4.2) break; // found land!
          attempts++;
        }
        roosterTarget.set(tx, ty, tz);
      }
    }
  } else if (roosterState === 'pecking') {
    mesh.position.y = groundY;
    mesh.rotation.z = 0;
    peckTimer += delta * 12.0;
    mesh.rotation.x = Math.max(0, Math.sin(peckTimer)) * 0.7; // peck downward
    
    if (roosterTimer <= 0) {
      roosterState = 'idle';
      roosterTimer = 1.0 + Math.random() * 2.0;
      mesh.rotation.x = 0;
    }
  } else if (roosterState === 'walking') {
    const dir = roosterTarget.clone().sub(mesh.position);
    dir.y = 0;
    const distance = dir.length();
    
    if (distance < 0.15 || roosterTimer <= 0) {
      roosterState = 'idle';
      roosterTimer = 1.0 + Math.random() * 2.0;
      mesh.rotation.z = 0;
    } else {
      dir.normalize();
      const speed = 1.1;
      mesh.position.addScaledVector(dir, speed * delta);
      mesh.position.y = groundY;
      
      const targetAngle = Math.atan2(dir.x, dir.z);
      mesh.rotation.y = targetAngle;
      mesh.rotation.z = Math.sin(game.time * 15.0) * 0.08;
    }
  }
}

function updateArturoLabel() {
  const label = document.getElementById('arturo-label');
  if (!label || !game.roosterMesh) return;

  const playerPos = game.controls.getObject().position;
  const dist = playerPos.distanceTo(game.roosterMesh.position);

  if (dist < 8.0 && game.pointerLocked && !game.paused) {
    const tempV = new THREE.Vector3();
    tempV.copy(game.roosterMesh.position);
    tempV.y += 0.8; // Position offset above the rooster

    tempV.project(game.camera);

    const x = (tempV.x * 0.5 + 0.5) * window.innerWidth;
    const y = (tempV.y * -0.5 + 0.5) * window.innerHeight;

    label.style.left = `${x}px`;
    label.style.top = `${y}px`;
    label.style.display = 'block';
  } else {
    label.style.display = 'none';
  }
}

let henState = 'idle'; // 'idle', 'walking', 'pecking', 'following'
let henTimer = 2.0;
let henTarget = new THREE.Vector3();
let henPeckTimer = 0;

function updateHenBehavior(delta) {
  if (!game.henMesh) return;

  const mesh = game.henMesh;
  const playerObj = game.controls.getObject();
  const playerPos = playerObj.position;
  const distToPlayer = mesh.position.distanceTo(playerPos);

  // Check if player has worm in inventory
  const hasWorm = player.inventory && player.inventory.worm > 0;

  // Snap Y to terrain height
  const groundY = getSurfaceHeightNear(mesh.position.x, 15, mesh.position.z);

  // Excitement reaction (e.g. after feeding)
  if (mesh.userData && mesh.userData.feedReaction > 0) {
    mesh.userData.feedReaction -= delta;
    mesh.position.y = groundY + Math.max(0, Math.sin(mesh.userData.feedReaction * 12.0)) * 0.35;
    mesh.rotation.y += delta * 15.0;
    mesh.rotation.x = Math.sin(mesh.userData.feedReaction * 25.0) * 0.3;
    mesh.rotation.z = 0;
    return;
  }

  if (hasWorm && distToPlayer < 15.0) {
    // Follow the player!
    henState = 'following';
    
    // Look at player
    const dir = playerPos.clone().sub(mesh.position);
    dir.y = 0;
    const distance = dir.length();
    
    if (distance > 1.8) {
      dir.normalize();
      const speed = 1.6; // slightly faster when following/excited
      mesh.position.addScaledVector(dir, speed * delta);
      mesh.position.y = groundY;
      
      const targetAngle = Math.atan2(dir.x, dir.z);
      mesh.rotation.y = targetAngle;
      mesh.rotation.z = Math.sin(game.time * 18.0) * 0.1; // wiggle walk
      mesh.rotation.x = Math.sin(game.time * 9.0) * 0.05; // bob head
    } else {
      // Just stand still and face the player
      mesh.position.y = groundY;
      mesh.rotation.x = Math.sin(game.time * 5.0) * 0.03;
      mesh.rotation.z = 0;
      const targetAngle = Math.atan2(dir.x, dir.z);
      mesh.rotation.y = targetAngle;
    }
  } else {
    // Normal wander behavior
    if (henState === 'following') {
      henState = 'idle';
      henTimer = 1.0;
    }
    
    henTimer -= delta;

    if (henState === 'idle') {
      mesh.position.y = groundY;
      mesh.rotation.x = Math.sin(game.time * 5.0) * 0.03;
      mesh.rotation.z = 0;
      
      if (henTimer <= 0) {
        if (Math.random() < 0.65) {
          henState = 'pecking';
          henTimer = 1.5 + Math.random() * 2.0;
          henPeckTimer = 0;
        } else {
          henState = 'walking';
          henTimer = 8.0;
          let attempts = 0;
          let tx = mesh.position.x;
          let tz = mesh.position.z;
          let ty = groundY;
          while (attempts < 10) {
            const dist = 3.0 + Math.random() * 5.0;
            const ang = Math.random() * Math.PI * 2;
            tx = mesh.position.x + Math.cos(ang) * dist;
            tz = mesh.position.z + Math.sin(ang) * dist;
            tx = Math.max(5, Math.min(world.sizeX * world.spacing - 5, tx));
            tz = Math.max(5, Math.min(world.sizeZ * world.spacing - 5, tz));
            ty = getSurfaceHeightNear(tx, 15, tz);
            if (ty > 4.2) break;
            attempts++;
          }
          henTarget.set(tx, ty, tz);
        }
      }
    } else if (henState === 'pecking') {
      mesh.position.y = groundY;
      mesh.rotation.z = 0;
      henPeckTimer += delta * 12.0;
      mesh.rotation.x = Math.max(0, Math.sin(henPeckTimer)) * 0.7;
      
      if (henTimer <= 0) {
        henState = 'idle';
        henTimer = 1.0 + Math.random() * 2.0;
        mesh.rotation.x = 0;
      }
    } else if (henState === 'walking') {
      const dir = henTarget.clone().sub(mesh.position);
      dir.y = 0;
      const distance = dir.length();
      
      if (distance < 0.15 || henTimer <= 0) {
        henState = 'idle';
        henTimer = 1.0 + Math.random() * 2.0;
        mesh.rotation.z = 0;
      } else {
        dir.normalize();
        const speed = 1.0;
        mesh.position.addScaledVector(dir, speed * delta);
        mesh.position.y = groundY;
        
        const targetAngle = Math.atan2(dir.x, dir.z);
        mesh.rotation.y = targetAngle;
        mesh.rotation.z = Math.sin(game.time * 15.0) * 0.08;
      }
    }
  }
}

function updateRositaLabel() {
  const label = document.getElementById('rosita-label');
  if (!label || !game.henMesh) return;

  const playerPos = game.controls.getObject().position;
  const dist = playerPos.distanceTo(game.henMesh.position);

  if (dist < 8.0 && game.pointerLocked && !game.paused) {
    const tempV = new THREE.Vector3();
    tempV.copy(game.henMesh.position);
    tempV.y += 0.8; // Position offset above the hen

    tempV.project(game.camera);

    const x = (tempV.x * 0.5 + 0.5) * window.innerWidth;
    const y = (tempV.y * -0.5 + 0.5) * window.innerHeight;

    label.style.left = `${x}px`;
    label.style.top = `${y}px`;
    label.style.display = 'block';
  } else {
    label.style.display = 'none';
  }
}

// Helper to create detailed low-poly crabs
function createCrab() {
  const group = new THREE.Group();
  
  const redMaterial = new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.7, flatShading: true }); // Crab red
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.5 }); // Black eyes
  const stalkMaterial = new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.7, flatShading: true });
  
  // 1. Body
  const bodyGeom = new THREE.BoxGeometry(0.22, 0.09, 0.16);
  const body = new THREE.Mesh(bodyGeom, redMaterial);
  body.position.y = 0.08;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  
  // 2. Eyes on stalks
  const leftStalk = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.02), stalkMaterial);
  leftStalk.position.set(-0.04, 0.14, 0.06);
  leftStalk.castShadow = true;
  group.add(leftStalk);
  
  const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.035), eyeMaterial);
  leftEye.position.set(-0.04, 0.18, 0.065);
  leftEye.castShadow = true;
  group.add(leftEye);
  
  const rightStalk = leftStalk.clone();
  rightStalk.position.x = 0.04;
  group.add(rightStalk);
  
  const rightEye = leftEye.clone();
  rightEye.position.x = 0.04;
  group.add(rightEye);

  // 3. Claws (Pincers in front)
  const leftArmGeom = new THREE.BoxGeometry(0.06, 0.04, 0.1);
  leftArmGeom.translate(-0.03, 0, 0.05); // shift pivot
  const leftArm = new THREE.Mesh(leftArmGeom, redMaterial);
  leftArm.position.set(-0.08, 0.06, 0.06);
  leftArm.rotation.y = 0.4;
  leftArm.castShadow = true;
  group.add(leftArm);
  
  const leftPincerGeom = new THREE.BoxGeometry(0.07, 0.07, 0.07);
  const leftPincer = new THREE.Mesh(leftPincerGeom, redMaterial);
  leftPincer.position.set(-0.13, 0.06, 0.13);
  leftPincer.castShadow = true;
  group.add(leftPincer);
  
  const rightArmGeom = new THREE.BoxGeometry(0.06, 0.04, 0.1);
  rightArmGeom.translate(0.03, 0, 0.05);
  const rightArm = new THREE.Mesh(rightArmGeom, redMaterial);
  rightArm.position.set(0.08, 0.06, 0.06);
  rightArm.rotation.y = -0.4;
  rightArm.castShadow = true;
  group.add(rightArm);
  
  const rightPincer = leftPincer.clone();
  rightPincer.position.set(0.13, 0.06, 0.13);
  group.add(rightPincer);

  // 4. Six Legs (3 on each side)
  group.legs = [];
  const legGeom = new THREE.BoxGeometry(0.12, 0.02, 0.02);
  legGeom.translate(0.06, 0, 0); // pivot at base
  
  for (let i = 0; i < 3; i++) {
    // Left legs (point outwards along -X)
    const legL = new THREE.Mesh(legGeom, redMaterial);
    legL.position.set(-0.1, 0.05, -0.05 + i * 0.05);
    legL.rotation.y = Math.PI - 0.3 + i * 0.3; // point leftward/angled
    legL.rotation.z = -0.3; // angle down
    legL.castShadow = true;
    group.add(legL);
    group.legs.push(legL);
    
    // Right legs (point outwards along +X)
    const legR = new THREE.Mesh(legGeom, redMaterial);
    legR.position.set(0.1, 0.05, -0.05 + i * 0.05);
    legR.rotation.y = 0.3 - i * 0.3; // point rightward/angled
    legR.rotation.z = 0.3; // angle down
    legR.castShadow = true;
    group.add(legR);
    group.legs.push(legR);
  }
  
  group.scale.setScalar(0.7);
  return group;
}

// Helper to create detailed low-poly fishes
function createFish() {
  const group = new THREE.Group();
  
  // Bright orange/yellow tropical theme or neon blue
  const colors = [0xff7a00, 0x00b4d8, 0xffd166, 0xef476f];
  const chosenColor = colors[Math.floor(Math.random() * colors.length)];
  
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: chosenColor, roughness: 0.5, flatShading: true });
  const finMaterial = new THREE.MeshStandardMaterial({ color: chosenColor, roughness: 0.5, flatShading: true });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: 0xfff9e6, roughness: 0.5, flatShading: true });
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.5 });
  
  // 1. Streamlined compressed body
  const bodyGeom = new THREE.BoxGeometry(0.08, 0.16, 0.28);
  const body = new THREE.Mesh(bodyGeom, bodyMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  
  // 2. Eyes
  const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.025), eyeMaterial);
  leftEye.position.set(-0.042, 0.03, 0.08);
  group.add(leftEye);
  
  const rightEye = leftEye.clone();
  rightEye.position.x = 0.042;
  group.add(rightEye);
  
  // 3. Tail Fin (animated back/forth)
  const tailGroup = new THREE.Group();
  tailGroup.position.set(0, 0, -0.14); // position at back of body
  
  const tailFinGeom = new THREE.BoxGeometry(0.02, 0.13, 0.09);
  tailFinGeom.translate(0, 0, -0.045); // pivot at base
  const tailFin = new THREE.Mesh(tailFinGeom, finMaterial);
  tailFin.castShadow = true;
  tailGroup.add(tailFin);
  
  // Accent tip on tail fin
  const tailTipGeom = new THREE.BoxGeometry(0.022, 0.08, 0.03);
  tailTipGeom.translate(0, 0, -0.08);
  const tailTip = new THREE.Mesh(tailTipGeom, accentMaterial);
  tailFin.add(tailTip);
  
  group.add(tailGroup);
  group.tail = tailGroup; // store reference for animation
  
  // 4. Pectoral Fins (side fins)
  const leftFinGeom = new THREE.BoxGeometry(0.07, 0.015, 0.05);
  leftFinGeom.translate(-0.035, 0, 0); // pivot at body side
  const leftFin = new THREE.Mesh(leftFinGeom, finMaterial);
  leftFin.position.set(-0.04, -0.02, 0.02);
  leftFin.rotation.z = -0.4;
  leftFin.rotation.y = 0.2;
  leftFin.castShadow = true;
  group.add(leftFin);
  
  const rightFinGeom = new THREE.BoxGeometry(0.07, 0.015, 0.05);
  rightFinGeom.translate(0.035, 0, 0);
  const rightFin = new THREE.Mesh(rightFinGeom, finMaterial);
  rightFin.position.set(0.04, -0.02, 0.02);
  rightFin.rotation.z = 0.4;
  rightFin.rotation.y = -0.2;
  rightFin.castShadow = true;
  group.add(rightFin);
  
  group.scale.setScalar(0.7);
  return group;
}

// Helper to create detailed low-poly crawling worms
function createWorm() {
  const wormGroup = new THREE.Group();
  const pinkMaterial = new THREE.MeshStandardMaterial({
    color: 0xe5a397,
    roughness: 0.9,
    flatShading: true
  });
  
  // A worm made of 3 segments so it can wiggle dynamically
  const segments = [];
  const segLength = 0.08;
  const segRadius = 0.015;
  
  for (let i = 0; i < 3; i++) {
    const geom = new THREE.CylinderGeometry(segRadius, segRadius, segLength, 4);
    geom.rotateZ(Math.PI / 2); // align horizontally along X
    const mesh = new THREE.Mesh(geom, pinkMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    const segmentGroup = new THREE.Group();
    if (i > 0) {
      // Connect to the end of the previous segment
      segmentGroup.position.x = segLength;
    }
    segmentGroup.add(mesh);
    
    if (i === 0) {
      wormGroup.add(segmentGroup);
    } else {
      segments[i-1].add(segmentGroup);
    }
    segments.push(segmentGroup);
  }
  
  wormGroup.segments = segments;
  wormGroup.wiggleSpeed = 6.0 + Math.random() * 4.0;
  wormGroup.wiggleOffset = Math.random() * Math.PI * 2;
  return wormGroup;
}

// Helper to create detailed low-poly flying seagulls
function createSeagull() {
  const group = new THREE.Group();
  
  const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.6, flatShading: true }); // white body
  const greyMaterial = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.6, flatShading: true });  // wingtips
  const beakMaterial = new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.5, flatShading: true });  // yellow beak
  
  // 1. Body
  const bodyGeom = new THREE.BoxGeometry(0.12, 0.1, 0.35);
  const body = new THREE.Mesh(bodyGeom, whiteMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  
  // 2. Beak (pointing forward along +Z)
  const beakGeom = new THREE.ConeGeometry(0.03, 0.11, 4);
  beakGeom.rotateX(Math.PI / 2);
  const beak = new THREE.Mesh(beakGeom, beakMaterial);
  beak.position.set(0, 0.02, 0.21);
  beak.castShadow = true;
  group.add(beak);
  
  // 3. Wings
  const wingYShift = 0.03;
  
  // Left Wing Group (pivot at body side)
  const leftWingGroup = new THREE.Group();
  leftWingGroup.position.set(-0.06, wingYShift, 0);
  
  const leftWingGeom = new THREE.BoxGeometry(0.42, 0.015, 0.11);
  leftWingGeom.translate(-0.21, 0, 0); // pivot at base
  const leftWing = new THREE.Mesh(leftWingGeom, whiteMaterial);
  leftWing.castShadow = true;
  leftWingGroup.add(leftWing);
  
  const leftTipGeom = new THREE.BoxGeometry(0.12, 0.013, 0.09);
  leftTipGeom.translate(-0.45, 0, -0.01);
  const leftTip = new THREE.Mesh(leftTipGeom, greyMaterial);
  leftWing.add(leftTip);
  
  group.add(leftWingGroup);
  group.leftWing = leftWingGroup;
  
  // Right Wing Group
  const rightWingGroup = new THREE.Group();
  rightWingGroup.position.set(0.06, wingYShift, 0);
  
  const rightWingGeom = new THREE.BoxGeometry(0.42, 0.015, 0.11);
  rightWingGeom.translate(0.21, 0, 0);
  const rightWing = new THREE.Mesh(rightWingGeom, whiteMaterial);
  rightWing.castShadow = true;
  rightWingGroup.add(rightWing);
  
  const rightTipGeom = new THREE.BoxGeometry(0.12, 0.013, 0.09);
  rightTipGeom.translate(0.45, 0, -0.01);
  const rightTip = new THREE.Mesh(rightTipGeom, greyMaterial);
  rightWing.add(rightTip);
  
  group.add(rightWingGroup);
  group.rightWing = rightWingGroup;
  
  group.scale.setScalar(0.75);
  return group;
}

// Spawns crabs, fishes, and seagulls in their respective ecological niches
function spawnFauna() {
  const spacing = world.spacing;
  const mapWidth = world.sizeX * spacing;
  const mapLength = world.sizeZ * spacing;
  
  // 1. Spawn Crabs on the sandy shore (Height Y between 4.05 and 5.6)
  let spawnedCrabs = 0;
  let attempts = 0;
  while (spawnedCrabs < 5 && attempts < 150) {
    attempts++;
    const rx = Math.random() * (mapWidth - 10) + 5;
    const rz = Math.random() * (mapLength - 10) + 5;
    const ry = getSurfaceHeightNear(rx, 15, rz);
    
    if (ry >= 4.05 && ry <= 5.6) {
      const crab = createCrab();
      crab.position.set(rx, ry, rz);
      
      crab.state = 'idle';
      crab.timer = 1.0 + Math.random() * 2.0;
      crab.target = new THREE.Vector3(rx, ry, rz);
      
      game.scene.add(crab);
      game.crabs.push(crab);
      spawnedCrabs++;
    }
  }
  
  // 2. Spawn Fish submerged in water (Surface terrain Y < 3.7)
  let spawnedFish = 0;
  attempts = 0;
  while (spawnedFish < 8 && attempts < 200) {
    attempts++;
    const rx = Math.random() * (mapWidth - 6) + 3;
    const rz = Math.random() * (mapLength - 6) + 3;
    const terrainY = getSurfaceHeightNear(rx, 15, rz);
    
    if (terrainY < 3.7) {
      const fish = createFish();
      const ry = 1.5 + Math.random() * 1.8; // Under water level (4.0)
      fish.position.set(rx, ry, rz);
      
      fish.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 1.2,
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 1.2
      );
      fish.swimTimer = 2.0 + Math.random() * 3.0;
      fish.targetY = ry;
      
      game.scene.add(fish);
      game.fishes.push(fish);
      spawnedFish++;
    }
  }

  // 2b. Spawn 4-5 Fish inside the mountain lake
  const lakeFishCount = 4 + Math.floor(Math.random() * 2); // 4 or 5
  for (let i = 0; i < lakeFishCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * 18.0; // keep it inside the lake (radius 24.0)
    const rx = 41.6 + Math.cos(angle) * dist;
    const rz = 41.6 + Math.sin(angle) * dist;
    
    const fish = createFish();
    const ry = 12.0 + Math.random() * 1.5; // Under lake water level (14.4)
    fish.position.set(rx, ry, rz);
    fish.isLakeFish = true;
    
    fish.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 1.2,
      (Math.random() - 0.5) * 0.3,
      (Math.random() - 0.5) * 1.2
    );
    fish.swimTimer = 2.0 + Math.random() * 3.0;
    fish.targetY = ry;
    
    game.scene.add(fish);
    game.fishes.push(fish);
  }

  // 2c. Spawn a Dead Seagull with crawling worms on the lake shore (Southeastern side)
  const deadGullX = 57.6; // 41.6 + 16.0
  const deadGullZ = 50.6; // 41.6 + 9.0
  const deadGullY = getSurfaceHeightNear(deadGullX, 15, deadGullZ);
  
  const deadSeagull = createSeagull();
  deadSeagull.name = "dead_seagull";
  deadSeagull.position.set(deadGullX, deadGullY + 0.05, deadGullZ);
  deadSeagull.rotation.x = Math.PI - 0.1; // Upside down
  deadSeagull.rotation.z = 0.4;          // Tilted slightly
  deadSeagull.rotation.y = Math.random() * Math.PI * 2;
  
  // Pivot the wings down to look limp/dead
  if (deadSeagull.leftWing && deadSeagull.rightWing) {
    deadSeagull.leftWing.rotation.z = 0.65;
    deadSeagull.rightWing.rotation.z = -0.65;
  }
  game.scene.add(deadSeagull);

  // Spawn 4 crawling worms near the dead seagull
  const wormPositions = [
    { dx: 0.18, dz: -0.05 },
    { dx: -0.15, dz: 0.12 },
    { dx: 0.05, dz: 0.05, onGull: true },
    { dx: -0.05, dz: -0.14 }
  ];

  wormPositions.forEach((pos, idx) => {
    const wx = deadGullX + pos.dx;
    const wz = deadGullZ + pos.dz;
    const baseWy = getSurfaceHeightNear(wx, 15, wz);
    const wy = pos.onGull ? baseWy + 0.08 : baseWy;

    const worm = createWorm();
    worm.position.set(wx, wy + 0.015, wz);
    worm.rotation.y = Math.random() * Math.PI * 2;
    worm.rotation.z = (Math.random() - 0.5) * 0.15;
    worm.rotation.x = (Math.random() - 0.5) * 0.15;

    game.scene.add(worm);
    game.worms.push(worm);

    // Add to activeDebris so the player can highlight and collect them by pressing E
    activeDebris.push({
      mesh: worm,
      velocity: new THREE.Vector3(0, 0, 0),
      type: 'worm',
      onGround: true,
      lifeTime: 999999
    });
  });
  
  // 3. Spawn Seagulls in the sky (Y = 11 to 16)
  for (let i = 0; i < 4; i++) {
    const seagull = createSeagull();
    
    const cx = mapWidth / 2 + (Math.random() - 0.5) * 20;
    const cz = mapLength / 2 + (Math.random() - 0.5) * 20;
    const radius = 8.0 + Math.random() * 12.0;
    const height = 11.0 + Math.random() * 5.0;
    const speed = 0.55 + Math.random() * 0.3; // radians per second
    const angle = Math.random() * Math.PI * 2;
    
    seagull.orbit = { cx, cz, radius, height, speed, angle };
    
    const sx = cx + Math.cos(angle) * radius;
    const sz = cz + Math.sin(angle) * radius;
    seagull.position.set(sx, height, sz);
    
    game.scene.add(seagull);
    game.seagulls.push(seagull);
  }
}



export function togglePause() {
  if (!game.pointerLocked) return; 
  
  game.paused = !game.paused;
  const overlay = document.getElementById('pause-overlay');
  if (overlay) {
    overlay.style.display = game.paused ? 'flex' : 'none';
  }
  
  if (game.controls) {
    game.controls.enabled = !game.paused; // Stop camera rotation when paused
  }
}

// Run engine initialization on load
window.onload = init;
