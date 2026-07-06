import * as THREE from 'three';
import { game } from './game.js';

export let menuParticles = null;
export let underwaterParticles = null;
export let rainParticles = null;
export let particleSpeeds = [];

export function initMenuParticles() {
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

export function initUnderwaterParticles() {
  const particleCount = 120;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const velocities = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 15;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 15;
    velocities[i] = 0.5 + Math.random() * 1.5;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.05,
    transparent: true,
    opacity: 0.6,
    depthWrite: false
  });

  underwaterParticles = new THREE.Points(geometry, material);
  underwaterParticles.visible = false;
  underwaterParticles.userData = { velocities: velocities };
  
  game.scene.add(underwaterParticles);
}

export function initRainParticles() {
  const particleCount = 800;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const velocities = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 35;
    positions[i * 3 + 1] = Math.random() * 20;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 35;
    velocities[i] = 12.0 + Math.random() * 8.0;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0x99ccff,
    size: 0.08,
    transparent: true,
    opacity: 0.4,
    depthWrite: false
  });

  rainParticles = new THREE.Points(geometry, material);
  rainParticles.visible = false;
  rainParticles.userData = { velocities: velocities };
  
  game.scene.add(rainParticles);
}

export function updateRainParticles(delta) {
  if (!rainParticles || !rainParticles.visible || !game.camera) return;

  const positions = rainParticles.geometry.attributes.position.array;
  const velocities = rainParticles.userData.velocities;
  const camPos = game.camera.position;

  rainParticles.position.copy(camPos);

  for (let i = 0; i < velocities.length; i++) {
    positions[i * 3 + 1] -= velocities[i] * delta;

    if (positions[i * 3 + 1] < -5.0) {
      positions[i * 3 + 1] = 15.0 + Math.random() * 5.0;
      positions[i * 3 + 0] = (Math.random() - 0.5) * 35;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 35;
    }
  }

  rainParticles.geometry.attributes.position.needsUpdate = true;
}

export function updateMenuParticles(delta, currentPreset) {
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

export function updateUnderwaterParticles(delta) {
  if (!underwaterParticles || !underwaterParticles.visible || !game.camera) return;

  const positions = underwaterParticles.geometry.attributes.position.array;
  const velocities = underwaterParticles.userData.velocities;
  const count = positions.length / 3;
  const camPos = game.camera.position;

  for (let i = 0; i < count; i++) {
    // 1. Rise up
    positions[i * 3 + 1] += velocities[i] * delta;

    // 2. Sinusoidal float wobble
    positions[i * 3] += Math.sin(game.time * 2 + i) * 0.05 * delta;
    positions[i * 3 + 2] += Math.cos(game.time * 2 + i) * 0.05 * delta;

    // 3. Dynamic wrap bounds around camera position (e.g. 7.5x5.0x7.5 box)
    const dx = positions[i * 3] - camPos.x;
    const dy = positions[i * 3 + 1] - camPos.y;
    const dz = positions[i * 3 + 2] - camPos.z;

    const rangeX = 7.5;
    const rangeY = 5.0;
    const rangeZ = 7.5;

    if (dx < -rangeX) positions[i * 3] += rangeX * 2;
    if (dx > rangeX) positions[i * 3] -= rangeX * 2;

    if (dy < -rangeY) {
      positions[i * 3 + 1] += rangeY * 2;
      positions[i * 3] = camPos.x + (Math.random() - 0.5) * rangeX * 2;
      positions[i * 3 + 2] = camPos.z + (Math.random() - 0.5) * rangeZ * 2;
    }
    if (dy > rangeY) {
      positions[i * 3 + 1] -= rangeY * 2;
      positions[i * 3] = camPos.x + (Math.random() - 0.5) * rangeX * 2;
      positions[i * 3 + 2] = camPos.z + (Math.random() - 0.5) * rangeZ * 2;
    }

    if (dz < -rangeZ) positions[i * 3 + 2] += rangeZ * 2;
    if (dz > rangeZ) positions[i * 3 + 2] -= rangeZ * 2;
  }

  underwaterParticles.geometry.attributes.position.needsUpdate = true;
}

export let snowParticles = null;
export function initSnowParticles() {
  const particleCount = 600;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const velocities = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 35;
    positions[i * 3 + 1] = Math.random() * 20;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 35;
    velocities[i] = 1.5 + Math.random() * 1.5;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.16,
    transparent: true,
    opacity: 0.85,
    depthWrite: false
  });

  snowParticles = new THREE.Points(geometry, material);
  snowParticles.visible = false;
  snowParticles.userData = { velocities: velocities };
  
  game.scene.add(snowParticles);
}

export function updateSnowParticles(delta) {
  if (!snowParticles || !snowParticles.visible || !game.camera) return;

  const positions = snowParticles.geometry.attributes.position.array;
  const velocities = snowParticles.userData.velocities;
  const camPos = game.camera.position;

  snowParticles.position.copy(camPos);

  const time = game.time || 0;
  for (let i = 0; i < velocities.length; i++) {
    positions[i * 3 + 1] -= velocities[i] * delta;
    positions[i * 3 + 0] += Math.sin(time * 1.5 + i) * 0.8 * delta;
    positions[i * 3 + 2] += Math.cos(time * 1.2 + i) * 0.5 * delta;

    if (positions[i * 3 + 1] < -5.0) {
      positions[i * 3 + 1] = 15.0 + Math.random() * 5.0;
      positions[i * 3 + 0] = (Math.random() - 0.5) * 35;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 35;
    }
  }

  snowParticles.geometry.attributes.position.needsUpdate = true;
}

export let autumnLeafParticles = null;
export function initAutumnLeafParticles() {
  const particleCount = 80;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const velocities = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);

  const leafColors = [
    [0xd84315, 0xbf360c], // orange-red
    [0xffb300, 0xf57f17], // gold/yellow
    [0x8d6e63, 0x5d4037]  // brown
  ];

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 40;
    positions[i * 3 + 1] = 5.0 + Math.random() * 15.0;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 40;

    velocities[i * 3 + 0] = -1.5 - Math.random() * 2.0;
    velocities[i * 3 + 1] = -1.0 - Math.random() * 1.5;
    velocities[i * 3 + 2] = 0.5 + Math.random() * 1.0;

    const category = leafColors[Math.floor(Math.random() * leafColors.length)];
    const hex = category[Math.floor(Math.random() * category.length)];
    const color = new THREE.Color(hex);
    colors[i * 3 + 0] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.18,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false
  });

  autumnLeafParticles = new THREE.Points(geometry, material);
  autumnLeafParticles.visible = false;
  autumnLeafParticles.userData = { velocities: velocities };
  
  game.scene.add(autumnLeafParticles);
}

export function updateAutumnLeafParticles(delta) {
  if (!autumnLeafParticles || !autumnLeafParticles.visible || !game.camera) return;

  const positions = autumnLeafParticles.geometry.attributes.position.array;
  const velocities = autumnLeafParticles.userData.velocities;
  const camPos = game.camera.position;

  autumnLeafParticles.position.copy(camPos);

  const time = game.time || 0;
  const count = positions.length / 3;
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] += velocities[i * 3 + 0] * delta;
    positions[i * 3 + 1] += velocities[i * 3 + 1] * delta;
    positions[i * 3 + 2] += velocities[i * 3 + 2] * delta;

    positions[i * 3 + 0] += Math.sin(time * 2.0 + i) * 0.4 * delta;
    positions[i * 3 + 2] += Math.cos(time * 1.8 + i) * 0.4 * delta;

    if (positions[i * 3 + 1] < -5.0 || Math.abs(positions[i * 3 + 0]) > 25.0 || Math.abs(positions[i * 3 + 2]) > 25.0) {
      positions[i * 3 + 1] = 10.0 + Math.random() * 10.0;
      positions[i * 3 + 0] = (Math.random() - 0.5) * 40;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 40;
    }
  }

  autumnLeafParticles.geometry.attributes.position.needsUpdate = true;
}
