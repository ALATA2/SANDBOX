import * as THREE from 'three';
import { initControls, updateControls } from './controls.js';
import { initWorld, updateWorld } from './world.js';
import { initPlayer, updatePlayer } from './player.js';
import { initInteraction, updateInteraction } from './interact.js';
import { startDrone, stopDrone, playHover, playSelect, playLaunch, startCoreHover, stopCoreHover, getMuted, setMute } from './audio.js';
import { setLanguage, currentLang } from './lang.js';

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
const startContainer = document.getElementById('start-container');

// Environment Presets Settings
const presets = {
  sunset: {
    bg: 0xfc8c82,
    fogDensity: 0.015,
    ambient: 0x4a2e5c,
    ambientIntensity: 1.2,
    sun: 0xffaa44,
    sunIntensity: 2.5,
    sunPos: new THREE.Vector3(-60, 20, -20)
  },
  nebula: {
    bg: 0x070312,
    fogDensity: 0.02,
    ambient: 0x442266,
    ambientIntensity: 0.6,
    sun: 0x00ffff,
    sunIntensity: 1.2,
    sunPos: new THREE.Vector3(40, 30, -50)
  },
  toxic: {
    bg: 0x08140c,
    fogDensity: 0.018,
    ambient: 0x113311,
    ambientIntensity: 1.0,
    sun: 0x33ff33,
    sunIntensity: 1.8,
    sunPos: new THREE.Vector3(-30, 25, 40)
  },
  frost: {
    bg: 0xddeeff,
    fogDensity: 0.012,
    ambient: 0x6688aa,
    ambientIntensity: 1.4,
    sun: 0xffffff,
    sunIntensity: 2.0,
    sunPos: new THREE.Vector3(50, 40, 50)
  }
};

let currentPreset = 'sunset';
let cameraShake = 0;

// Particles variables
let menuParticles = null;
let particleSpeeds = [];

// Scrolling telemetry log lines
const logLines = [
  "SYS_STATUS: ACTIVE",
  "GRID_DENSITY: 40x16x40",
  "CORE_TEMP: NOMINAL",
  "SATELLITE_LINK: STABLE",
  "ORBITAL_VELOCITY: 7.2 KM/S",
  "VOXEL_MESH: GENERATED",
  "LIGHTHOUSE: BEACON_SYNCED",
  "GPS_COORDS: RETRIEVED",
  "WIND_SPEED: 12 KNOTS",
  "WAVE_FREQ: 0.35 HZ",
  "DEBRIS_FIELD: INTEGRATED",
  "BIOMETRIC_STATUS: GOOD",
  "HOLOGRAPHIC_HUD: ARMED",
  "WATER_DEPTH: 5.2 METERS",
  "BAROMETRIC_PRESSURE: 1013 HPA",
  "GRAVITY_FORCE: 9.8 M/S^2"
];

let activeLogs = [
  "SYSTEM INITIALIZING...",
  "WELCOME TO 11° CONSOLE",
  "TARGET LOCATED: ARCHIPELAGO"
];

// Initialize the 3D Game Engine
function init() {
  // 1. Create Scene
  game.scene = new THREE.Scene();
  game.scene.background = new THREE.Color(presets.sunset.bg);
  game.scene.fog = new THREE.FogExp2(presets.sunset.bg, presets.sunset.fogDensity);

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

  // 4. Create Lights
  game.lights.ambient = new THREE.AmbientLight(presets.sunset.ambient, presets.sunset.ambientIntensity); 
  game.scene.add(game.lights.ambient);

  game.lights.sun = new THREE.DirectionalLight(presets.sunset.sun, presets.sunset.sunIntensity);
  game.lights.sun.position.copy(presets.sunset.sunPos);
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
  game.lights.sun.shadow.normalBias = 0.08;
  
  game.scene.add(game.lights.sun);

  // 5. Setup Clock
  game.clock = new THREE.Clock();

  // 6. Initialize Sub-modules
  initControls();
  initWorld();
  initPlayer();
  initInteraction();

  // Initialize atmospheric particles
  initMenuParticles();

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
    
    // Trigger Pointer Lock synchronously to avoid browser block
    const controls = game.controls;
    if (controls) {
      controls.lock();
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
      
      game.pointerLocked = true;
      stopDrone();
      stopCoreHover();
      cameraShake = 6.0; // Extra screen impact shake when entering world
      
      if (firstStart) {
        if (game.controls && game.controls.getObject) {
          game.controls.getObject().position.set(25, 8, 25);
        }
        firstStart = false;
      }
    } else {
      // If feedback modal is open, do not show start menu blocker
      const feedbackModal = document.getElementById('feedback-modal');
      if (feedbackModal && feedbackModal.style.display === 'flex') {
        game.pointerLocked = false;
      } else {
        blocker.style.display = 'flex';
        game.pointerLocked = false;
        startDrone();
      }
      
      // Reset menu vibration classes
      const menu = document.getElementById('instructions');
      if (menu) {
        menu.classList.remove('vibrate');
      }
    }
  });

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

  // Hover sound for standard controls and presets
  const hoverables = document.querySelectorAll('.lang-pill, .preset-btn, #mute-toggle');
  hoverables.forEach(el => {
    el.addEventListener('mouseenter', () => {
      playHover();
    });
  });

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

  // 8. Start Game Loop
  animate();
}

function onWindowResize() {
  game.camera.aspect = window.innerWidth / window.innerHeight;
  game.camera.updateProjectionMatrix();
  game.renderer.setSize(window.innerWidth, window.innerHeight);
}

// Particle System Initialization
function initMenuParticles() {
  const geom = new THREE.BufferGeometry();
  const count = 200;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  
  for (let i = 0; i < count; i++) {
    // Center around the sunset island (cx = 32, cz = 32)
    positions[i * 3] = (Math.random() - 0.5) * 80 + 32;
    positions[i * 3 + 1] = Math.random() * 25 + 3;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 80 + 32;
    
    particleSpeeds.push(new THREE.Vector3(
      (Math.random() - 0.5) * 0.4,
      Math.random() * 0.4 + 0.1, // float up slowly by default
      (Math.random() - 0.5) * 0.4
    ));
    
    // Default color values (sunset orange)
    colors[i * 3] = 1.0;
    colors[i * 3 + 1] = 0.6;
    colors[i * 3 + 2] = 0.2;
  }
  
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  
  const mat = new THREE.PointsMaterial({
    size: 0.8,
    vertexColors: true,
    transparent: true,
    opacity: 0.75,
    sizeAttenuation: true
  });
  
  menuParticles = new THREE.Points(geom, mat);
  game.scene.add(menuParticles);
}

// Apply Atmospheric Preset & Particle parameters
function applyPreset(presetName) {
  const preset = presets[presetName];
  if (!preset) return;
  
  currentPreset = presetName;

  // 1. Transition Scene variables
  game.scene.background.setHex(preset.bg);
  if (game.scene.fog) {
    game.scene.fog.color.setHex(preset.bg);
    game.scene.fog.density = preset.fogDensity;
  }
  
  game.lights.ambient.color.setHex(preset.ambient);
  game.lights.ambient.intensity = preset.ambientIntensity;
  
  game.lights.sun.color.setHex(preset.sun);
  game.lights.sun.intensity = preset.sunIntensity;
  game.lights.sun.position.copy(preset.sunPos);

  // 2. Reposition / recolor active particles
  if (menuParticles) {
    const colors = menuParticles.geometry.attributes.color.array;
    const positions = menuParticles.geometry.attributes.position.array;
    const count = positions.length / 3;
    
    menuParticles.material.size = presetName === 'toxic' ? 1.4 : (presetName === 'nebula' ? 2.5 : 0.8);
    
    for (let i = 0; i < count; i++) {
      if (presetName === 'sunset') {
        // Orange embers
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.55 + Math.random() * 0.25;
        colors[i * 3 + 2] = 0.15;
        particleSpeeds[i].set((Math.random() - 0.5) * 0.4, Math.random() * 0.5 + 0.15, (Math.random() - 0.5) * 0.4);
      } else if (presetName === 'nebula') {
        // Starfield colors (Cyan, Magenta, White)
        const r = Math.random();
        if (r < 0.35) {
          colors[i * 3] = 0.15; colors[i * 3 + 1] = 0.85; colors[i * 3 + 2] = 1.0;
        } else if (r < 0.7) {
          colors[i * 3] = 0.95; colors[i * 3 + 1] = 0.25; colors[i * 3 + 2] = 1.0;
        } else {
          colors[i * 3] = 1.0; colors[i * 3 + 1] = 1.0; colors[i * 3 + 2] = 1.0;
        }
        // Force high up for space stars look
        positions[i * 3 + 1] = Math.random() * 60 + 45;
        particleSpeeds[i].set(0, 0, 0); // Stationary stars
      } else if (presetName === 'toxic') {
        // Bright neon green fireflies
        colors[i * 3] = 0.15;
        colors[i * 3 + 1] = 1.0;
        colors[i * 3 + 2] = 0.25;
        particleSpeeds[i].set((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 1.6);
        positions[i * 3 + 1] = Math.random() * 12 + 2;
      } else if (presetName === 'frost') {
        // Snow flakes
        colors[i * 3] = 0.92;
        colors[i * 3 + 1] = 0.96;
        colors[i * 3 + 2] = 1.0;
        particleSpeeds[i].set((Math.random() - 0.5) * 0.6, -Math.random() * 2.2 - 0.6, (Math.random() - 0.5) * 0.6);
      }
    }
    
    menuParticles.geometry.attributes.color.needsUpdate = true;
    menuParticles.geometry.attributes.position.needsUpdate = true;
  }
}

// Particle Drift Updates
function updateMenuParticles(delta) {
  if (!menuParticles) return;
  
  const positions = menuParticles.geometry.attributes.position.array;
  const count = positions.length / 3;
  
  for (let i = 0; i < count; i++) {
    positions[i * 3] += particleSpeeds[i].x * delta;
    positions[i * 3 + 1] += particleSpeeds[i].y * delta;
    positions[i * 3 + 2] += particleSpeeds[i].z * delta;
    
    // Bounds check and wrap around
    if (currentPreset === 'sunset') {
      if (positions[i * 3 + 1] > 32) {
        positions[i * 3 + 1] = 3;
        positions[i * 3] = (Math.random() - 0.5) * 80 + 32;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 80 + 32;
      }
    } else if (currentPreset === 'frost') {
      if (positions[i * 3 + 1] < 1) {
        positions[i * 3 + 1] = 28;
        positions[i * 3] = (Math.random() - 0.5) * 80 + 32;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 80 + 32;
      }
    } else if (currentPreset === 'toxic') {
      if (positions[i * 3 + 1] < 1 || positions[i * 3 + 1] > 18) {
        particleSpeeds[i].y = -particleSpeeds[i].y;
      }
      if (Math.abs(positions[i * 3] - 32) > 42 || Math.abs(positions[i * 3 + 2] - 32) > 42) {
        positions[i * 3] = (Math.random() - 0.5) * 60 + 32;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 60 + 32;
      }
    }
  }
  
  menuParticles.geometry.attributes.position.needsUpdate = true;
}

// Initial Telemetry logs setup
function initTerminalLogger() {
  const term = document.getElementById('telemetry-terminal');
  if (!term) return;
  
  term.innerHTML = activeLogs.join('<br>');
  
  setInterval(() => {
    const newLine = logLines[Math.floor(Math.random() * logLines.length)];
    activeLogs.push(newLine);
    if (activeLogs.length > 4) {
      activeLogs.shift();
    }
    term.innerHTML = activeLogs.join('<br>');
  }, 1400);
}

let wasSubmerged = false;

function updateUnderwaterVisuals(submerged) {
  if (submerged === wasSubmerged) return;
  wasSubmerged = submerged;
  
  const preset = presets[currentPreset];
  if (!preset) return;
  
  if (submerged) {
    // Deep murky underwater colors based on the active atmosphere preset
    let waterColor, waterDensity;
    if (currentPreset === 'sunset') {
      waterColor = 0x081b2a; // Deep dark blue-teal
      waterDensity = 0.08;
    } else if (currentPreset === 'nebula') {
      waterColor = 0x030310; // Void space navy
      waterDensity = 0.09;
    } else if (currentPreset === 'toxic') {
      waterColor = 0x051a0a; // Deep toxic sludge green
      waterDensity = 0.08;
    } else if (currentPreset === 'frost') {
      waterColor = 0x203548; // Cold icy navy
      waterDensity = 0.07;
    }
    
    game.scene.background.setHex(waterColor);
    if (game.scene.fog) {
      game.scene.fog.color.setHex(waterColor);
      game.scene.fog.density = waterDensity;
    }
  } else {
    // Restores original preset visual values when emerging
    applyPreset(currentPreset);
  }
}

// Main Game Loop
function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(game.clock.getDelta(), 0.1); // Cap delta

  // Apply camera shake decay
  if (cameraShake > 0) {
    cameraShake = Math.max(0, cameraShake - delta * 4.5);
  }

  // Check underwater state
  let isSubmerged = false;
  if (game.pointerLocked && game.controls && game.controls.getObject) {
    if (game.controls.getObject().position.y < 4.8) {
      isSubmerged = true;
    }
  }
  updateUnderwaterVisuals(isSubmerged);

  if (game.pointerLocked) {
    if (menuParticles) menuParticles.visible = false;
    // Update active game sub-modules
    updateControls(delta);
    updatePlayer(delta);
    updateWorld(delta);
    updateInteraction(delta);
    
    // Apply camera shake to playing camera if active
    if (cameraShake > 0) {
      const shakeX = (Math.random() - 0.5) * cameraShake * 0.08;
      const shakeY = (Math.random() - 0.5) * cameraShake * 0.08;
      const shakeZ = (Math.random() - 0.5) * cameraShake * 0.08;
      game.camera.position.x += shakeX;
      game.camera.position.y += shakeY;
      game.camera.position.z += shakeZ;
    }
  } else {
    if (menuParticles) menuParticles.visible = true;
    // Cinematic menu rotation of the camera wrapper (game.controls.getObject())
    if (game.controls && game.controls.getObject) {
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
      const latEl = document.getElementById('telemetry-lat');
      const lngEl = document.getElementById('telemetry-lng');
      const altEl = document.getElementById('telemetry-alt');
      
      if (latEl) latEl.textContent = pObj.position.x.toFixed(2);
      if (lngEl) lngEl.textContent = pObj.position.z.toFixed(2);
      if (altEl) altEl.textContent = pObj.position.y.toFixed(2);
    }
  }

  // Render scene
  game.renderer.render(game.scene, game.camera);
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
  
  if (game.controls) {
    game.controls.unlock();
  }
};

function closeFeedbackBoard() {
  const modal = document.getElementById('feedback-modal');
  if (modal) {
    modal.style.display = 'none';
  }
  
  if (game.controls) {
    game.controls.lock();
  }
}

// Run engine initialization on load
window.onload = init;
