import { game } from './game.js';
import { world } from './world.js';
import { player, showHudMessage } from './player.js';
import { playWoodChop, setSubmergedAudio } from './audio.js';
import { 
  menuParticles, 
  rainParticles, 
  underwaterParticles,
  particleSpeeds, 
  updateRainParticles 
} from './particles.js';

export let currentPreset = 'sunset';

export const presets = {
  sunset: {
    bg: 0xfc8c82,
    fogDensity: 0.0015,
    ambient: 0x4a2e5c,
    ambientIntensity: 1.2,
    sun: 0xffaa44,
    sunIntensity: 2.5,
    sunPos: new THREE.Vector3(-120, 5, -50),
    sunMeshColor: 0xfff9e6
  },
  nebula: {
    bg: 0x070312,
    fogDensity: 0.002,
    ambient: 0x442266,
    ambientIntensity: 0.6,
    sun: 0x00ffff,
    sunIntensity: 1.2,
    sunPos: new THREE.Vector3(100, 10, -90),
    sunMeshColor: 0xe6ffff
  },
  toxic: {
    bg: 0x08140c,
    fogDensity: 0.0018,
    ambient: 0x113311,
    ambientIntensity: 1.0,
    sun: 0x33ff33,
    sunIntensity: 1.8,
    sunPos: new THREE.Vector3(-80, 8, 80),
    sunMeshColor: 0xe6ffe6
  },
  frost: {
    bg: 0xddeeff,
    fogDensity: 0.0012,
    ambient: 0x6688aa,
    ambientIntensity: 1.4,
    sun: 0xffffff,
    sunIntensity: 2.0,
    sunPos: new THREE.Vector3(90, 12, 90),
    sunMeshColor: 0xffffff
  }
};

export const presetCycles = {
  sunset: {
    day: {
      bg: 0xfba190,
      gradTop: 0x2b1b54,
      gradBottom: 0xff8560,
      ambient: 0x442854,
      ambientIntensity: 0.9,
      sun: 0xffaa66,
      sunIntensity: 3.2,
      fogDensity: 0.0022
    },
    twilight: {
      bg: 0xe05650,
      gradTop: 0x190c30,
      gradBottom: 0xd4504a,
      ambient: 0x2c1435,
      ambientIntensity: 0.6,
      sun: 0xff4f1f,
      sunIntensity: 1.8,
      fogDensity: 0.0028
    },
    night: {
      bg: 0x070312,
      gradTop: 0x020107,
      gradBottom: 0x070312,
      ambient: 0x0c0e1a,
      ambientIntensity: 0.45,
      sun: 0xaaccff,
      sunIntensity: 0.15,
      fogDensity: 0.0018
    }
  },
  nebula: {
    day: {
      bg: 0x9d4edd,
      gradTop: 0x5a189a,
      gradBottom: 0x9d4edd,
      ambient: 0x7b2cbf,
      ambientIntensity: 0.8,
      sun: 0xff00ff,
      sunIntensity: 1.5,
      fogDensity: 0.0015
    },
    twilight: {
      bg: 0x070312,
      gradTop: 0x020107,
      gradBottom: 0x070312,
      ambient: 0x442266,
      ambientIntensity: 0.6,
      sun: 0x00ffff,
      sunIntensity: 1.2,
      fogDensity: 0.002
    },
    night: {
      bg: 0x020107,
      gradTop: 0x000000,
      gradBottom: 0x020107,
      ambient: 0x0f031b,
      ambientIntensity: 0.3,
      sun: 0x00ffff,
      sunIntensity: 0.1,
      fogDensity: 0.0022
    }
  },
  toxic: {
    day: {
      bg: 0x40916c,
      gradTop: 0x1b4332,
      gradBottom: 0x40916c,
      ambient: 0x2d6a4f,
      ambientIntensity: 1.2,
      sun: 0x33ff33,
      sunIntensity: 2.0,
      fogDensity: 0.0014
    },
    twilight: {
      bg: 0x08140c,
      gradTop: 0x020804,
      gradBottom: 0x08140c,
      ambient: 0x113311,
      ambientIntensity: 1.0,
      sun: 0x33ff33,
      sunIntensity: 1.8,
      fogDensity: 0.0018
    },
    night: {
      bg: 0x020503,
      gradTop: 0x000000,
      gradBottom: 0x020503,
      ambient: 0x051a08,
      ambientIntensity: 0.4,
      sun: 0x00ff66,
      sunIntensity: 0.5,
      fogDensity: 0.0022
    }
  },
  frost: {
    day: {
      bg: 0xcfe8ff,
      gradTop: 0x9ac7f8,
      gradBottom: 0xcfe8ff,
      ambient: 0xaaccff,
      ambientIntensity: 1.5,
      sun: 0xffffff,
      sunIntensity: 2.3,
      fogDensity: 0.0009
    },
    twilight: {
      bg: 0xddeeff,
      gradTop: 0xaaccff,
      gradBottom: 0xddeeff,
      ambient: 0x6688aa,
      ambientIntensity: 1.4,
      sun: 0xffffff,
      sunIntensity: 2.0,
      fogDensity: 0.0012
    },
    night: {
      bg: 0x0e1d2f,
      gradTop: 0x030810,
      gradBottom: 0x0e1d2f,
      ambient: 0x1d3557,
      ambientIntensity: 0.5,
      sun: 0xbdecff,
      sunIntensity: 0.8,
      fogDensity: 0.0016
    }
  }
};

// Pre-allocated colors for zero-allocation transitions
const colorTempTop = new THREE.Color();
const colorTempBottom = new THREE.Color();
const colorTempAmbient = new THREE.Color();
const colorTempSun = new THREE.Color();
const colorTempFog = new THREE.Color();

const cTemp1 = new THREE.Color();
const cTemp2 = new THREE.Color();
const cTemp3 = new THREE.Color();
const cTemp4 = new THREE.Color();
const cTemp5 = new THREE.Color();
const cTemp6 = new THREE.Color();
const cTemp7 = new THREE.Color();
const cTemp8 = new THREE.Color();

export function applyPreset(presetName) {
  const preset = presets[presetName];
  if (!preset) return;
  
  currentPreset = presetName;

  const container = document.getElementById('canvas-container');
  if (container) {
    if (presetName === 'sunset') {
      container.style.background = 'linear-gradient(to bottom, #4ba3e3, #fc8c82)';
    } else if (presetName === 'nebula') {
      container.style.background = 'linear-gradient(to bottom, #020107, #070312)';
    } else if (presetName === 'toxic') {
      container.style.background = 'linear-gradient(to bottom, #020804, #08140c)';
    } else if (presetName === 'frost') {
      container.style.background = 'linear-gradient(to bottom, #aaccff, #ddeeff)';
    }
  }
  
  if (game.scene.fog) {
    game.scene.fog.color.setHex(preset.bg);
    game.scene.fog.density = preset.fogDensity;
  }
  
  game.lights.ambient.color.setHex(preset.ambient);
  game.lights.ambient.intensity = preset.ambientIntensity;
  
  game.lights.sun.color.setHex(preset.sun);
  game.lights.sun.intensity = preset.sunIntensity;
  game.lights.sun.position.copy(preset.sunPos);

  if (game.sunMesh) {
    game.sunMesh.position.copy(preset.sunPos).normalize().multiplyScalar(180);
    const mColor = preset.sunMeshColor || preset.sun;
    game.sunMesh.material.color.setHex(mColor);
    
    if (game.sunHaloMesh) {
      game.sunHaloMesh.material.color.setHex(mColor);
      if (presetName === 'nebula') {
        game.sunHaloMesh.material.opacity = 0.2;
      } else {
        game.sunHaloMesh.material.opacity = 0.35;
      }
    }
    
    if (presetName === 'nebula') {
      game.sunMesh.scale.setScalar(0.4);
    } else {
      game.sunMesh.scale.setScalar(1.0);
    }
  }

  if (menuParticles) {
    const colors = menuParticles.geometry.attributes.color.array;
    const positions = menuParticles.geometry.attributes.position.array;
    const count = positions.length / 3;
    
    menuParticles.material.size = presetName === 'toxic' ? 1.4 : (presetName === 'nebula' ? 2.5 : 0.8);
    
    for (let i = 0; i < count; i++) {
      if (presetName === 'sunset') {
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.55 + Math.random() * 0.25;
        colors[i * 3 + 2] = 0.15;
        particleSpeeds[i].set((Math.random() - 0.5) * 0.4, Math.random() * 0.5 + 0.15, (Math.random() - 0.5) * 0.4);
      } else if (presetName === 'nebula') {
        const r = Math.random();
        if (r < 0.35) {
          colors[i * 3] = 0.15; colors[i * 3 + 1] = 0.85; colors[i * 3 + 2] = 1.0;
        } else if (r < 0.7) {
          colors[i * 3] = 0.95; colors[i * 3 + 1] = 0.25; colors[i * 3 + 2] = 1.0;
        } else {
          colors[i * 3] = 1.0; colors[i * 3 + 1] = 1.0; colors[i * 3 + 2] = 1.0;
        }
        positions[i * 3 + 1] = Math.random() * 60 + 45;
        particleSpeeds[i].set(0, 0, 0);
      } else if (presetName === 'toxic') {
        colors[i * 3] = 0.15;
        colors[i * 3 + 1] = 1.0;
        colors[i * 3 + 2] = 0.25;
        particleSpeeds[i].set((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 1.6);
        positions[i * 3 + 1] = Math.random() * 12 + 2;
      } else if (presetName === 'frost') {
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

export function updateWeatherAndOrbit(delta, wasSubmerged, cameraPos, angle, sunDir, moonDir, cameraShakeSetter) {
  // Atmospheric cycle interpolation (Day <-> Twilight <-> Night)
  const cycle = presetCycles[currentPreset];
  if (!cycle) return;

  const isDayTime = sunDir.y >= 0;
  let t = Math.abs(Math.sin(angle)); // 0.0 at horizon, 1.0 at Zenith
  if (!isDayTime) {
    const isEvening = angle >= Math.PI && angle < 1.5 * Math.PI;
    if (isEvening) {
      t = Math.pow(t, 0.08);
    } else {
      t = Math.pow(t, 0.3);
    }
  }

  let targetState = isDayTime ? cycle.day : cycle.night;
  let baseState = cycle.twilight;

  // 1. Lerp ambient light
  game.lights.ambient.intensity = baseState.ambientIntensity + (targetState.ambientIntensity - baseState.ambientIntensity) * t;
  colorTempAmbient.copy(cTemp1.set(baseState.ambient)).lerp(cTemp2.set(targetState.ambient), t);
  game.lights.ambient.color.copy(colorTempAmbient);

  // 2. Lerp directional light
  game.lights.sun.intensity = baseState.sunIntensity + (targetState.sunIntensity - baseState.sunIntensity) * t;
  colorTempSun.copy(cTemp1.set(baseState.sun)).lerp(cTemp2.set(targetState.sun), t);
  game.lights.sun.color.copy(colorTempSun);

  // 3. Lerp fog color & density
  if (game.scene.fog) {
    game.scene.fog.density = baseState.fogDensity + (targetState.fogDensity - baseState.fogDensity) * t;
    colorTempFog.copy(cTemp1.set(baseState.bg)).lerp(cTemp2.set(targetState.bg), t);
    game.scene.fog.color.copy(colorTempFog);
  }

  // Weather System State Progression & Effects
  if (!game.paused) {
    if (!game.weather) {
      game.weather = 'clear';
      game.weatherTimer = 90.0;
    }
    game.weatherTimer -= delta;
    if (game.weatherTimer <= 0) {
      const weatherStates = ['clear', 'rain', 'storm'];
      const filtered = weatherStates.filter(s => s !== game.weather);
      game.weather = filtered[Math.floor(Math.random() * filtered.length)];
      game.weatherTimer = 80.0 + Math.random() * 60.0;

      const localizedMsg = game.weather === 'clear' ? 
        (player.currentLang === 'it' ? "Il cielo si sta schiarendo." : "The weather is clearing up.") :
        game.weather === 'rain' ?
        (player.currentLang === 'it' ? "Inizia a piovere." : "It is starting to rain.") :
        (player.currentLang === 'it' ? "⚠️ Una tempesta tropicale si sta avvicinando! Trova un rifugio!" : "⚠️ A tropical storm is brewing! Seek shelter!");
      
      showHudMessage(localizedMsg);
    }
  }

  // Apply Weather Overlays to Ambient/Directional lights & Fog
  if (game.weather === 'rain' || game.weather === 'storm') {
    if (game.scene.fog) {
      const mult = game.weather === 'storm' ? 0.35 : 0.65;
      game.scene.fog.color.multiplyScalar(mult);
      game.scene.fog.density = Math.max(game.scene.fog.density, game.weather === 'storm' ? 0.045 : 0.025);
    }
    
    if (game.lights.sun) {
      game.lights.sun.intensity *= (game.weather === 'storm' ? 0.3 : 0.6);
    }

    if (rainParticles) {
      rainParticles.visible = !wasSubmerged;
      updateRainParticles(delta);
    }
  } else {
    if (rainParticles) rainParticles.visible = false;
  }

  // Lightning strike simulation during storms (Zero-alloc)
  if (game.weather === 'storm' && !game.paused && Math.random() < 0.005) {
    if (game.scene.fog) {
      game.scene.fog.color.setHex(0xffffff);
      game.scene.fog.density = 0.01;
    }
    if (game.lights.sun) {
      game.lights.sun.intensity = 3.5;
    }
    cameraShakeSetter(1.2);
    
    setTimeout(() => {
      if (game.weather === 'storm' && game.scene.fog) {
        cTemp3.set(baseState.bg);
        cTemp4.set(targetState.bg);
        const freshFogColor = cTemp3.lerp(cTemp4, t);
        game.scene.fog.color.copy(freshFogColor).multiplyScalar(0.35);
        game.scene.fog.density = 0.045;
        if (game.lights.sun) {
          game.lights.sun.intensity = (baseState.sunIntensity + (targetState.sunIntensity - baseState.sunIntensity) * t) * 0.3;
        }
      }
    }, 80);
  }

  // Wind sway pinetrees
  if (world.trees && !game.paused) {
    const windSpeed = game.weather === 'storm' ? 8.0 : game.weather === 'rain' ? 4.0 : 1.5;
    const windForce = game.weather === 'storm' ? 0.08 : game.weather === 'rain' ? 0.03 : 0.008;
    world.trees.forEach(tree => {
      if (tree.userData && tree.userData.falling) return;
      const sway = Math.sin(game.time * windSpeed + tree.position.x * 0.5) * windForce;
      tree.rotation.z = sway;
      tree.rotation.x = sway * 0.5;
    });
  }

  // Progressive structure decay during storms
  if (game.weather === 'storm' && !game.paused) {
    if (!game.lastDecayTime) game.lastDecayTime = game.time;
    if (game.time - game.lastDecayTime >= 1.0) {
      game.lastDecayTime = game.time;
      if (world.placedStructures) {
        for (let i = world.placedStructures.length - 1; i >= 0; i--) {
          const struct = world.placedStructures[i];
          if (struct.userData && struct.userData.type === 'primitive_roof') {
            struct.userData.durability = (struct.userData.durability || 100) - 2;
            if (struct.userData.durability <= 0) {
              game.scene.remove(struct);
              world.placedStructures.splice(i, 1);
              playWoodChop();
              showHudMessage(player.currentLang === 'it' ? "UN TETTO DI FOGLIE È CROLLATO PER LA TEMPESTA!" : "A LEAF ROOF COLLAPSED IN THE STORM!");
            }
          }
        }
      }
    }
  }

  // Dynamic water color adjustment (Zero-alloc)
  if (world.waterMesh && world.waterMesh.material && !wasSubmerged) {
    const twilightColor = cTemp1.set(cycle.twilight.bg);
    const twilightTint = cTemp2.copy(twilightColor).lerp(cTemp3.set(0xffffff), 0.5);
    const twilightEmissive = cTemp4.copy(twilightColor).multiplyScalar(0.22);
    
    const dayEmissive = cTemp5.set(cycle.day.bg).multiplyScalar(0.12);
    const nightEmissive = cTemp6.set(cycle.night.bg).multiplyScalar(0.08);
    
    const waterColor = cTemp7;
    const waterEmissive = cTemp8;
    
    if (isDayTime) {
      waterColor.copy(twilightTint).lerp(cTemp3.set(0xffffff), t);
      waterEmissive.copy(twilightEmissive).lerp(dayEmissive, t);
    } else {
      waterColor.copy(twilightTint).lerp(cTemp3.set(cycle.night.bg), t);
      waterEmissive.copy(twilightEmissive).lerp(nightEmissive, t);
    }
    
    world.waterMesh.material.color.copy(waterColor);
    world.waterMesh.material.emissive.copy(waterEmissive);
  }

  // Lerp CSS canvas-container linear-gradient (only when not submerged)
  const container = document.getElementById('canvas-container');
  if (container && !wasSubmerged) {
    colorTempTop.copy(cTemp1.set(baseState.gradTop)).lerp(cTemp2.set(targetState.gradTop), t);
    colorTempBottom.copy(cTemp1.set(baseState.gradBottom)).lerp(cTemp2.set(targetState.gradBottom), t);
    
    const topCSS = '#' + colorTempTop.getHexString();
    const bottomCSS = '#' + colorTempBottom.getHexString();
    container.style.background = `linear-gradient(to bottom, ${topCSS}, ${bottomCSS})`;
  }
}

export let wasSubmerged = false;

export function updateUnderwaterVisuals(submerged) {
  if (submerged === wasSubmerged) return;
  wasSubmerged = submerged;
  
  // Apply low-pass sweep for immersion
  setSubmergedAudio(submerged);

  // Toggle screen-space HTML/CSS wavy ripple distortion overlay
  const overlay = document.getElementById('underwater-ripple');
  if (overlay) {
    overlay.style.display = submerged ? 'block' : 'none';
  }

  // Toggle 3D underwater bubble points system
  if (underwaterParticles) {
    underwaterParticles.visible = submerged;
  }

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
    
    const container = document.getElementById('canvas-container');
    if (container) {
      container.style.background = '#' + waterColor.toString(16).padStart(6, '0');
    }
    if (game.scene.fog) {
      game.scene.fog.color.setHex(waterColor);
      game.scene.fog.density = waterDensity;
    }
  } else {
    // Restores original preset visual values when emerging
    applyPreset(currentPreset);
  }
}
