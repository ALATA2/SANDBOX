import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { game } from './game.js';
import { getSurfaceHeightNear, checkCollision } from './world.js';

// Movement state variables
export let moveForward = false;
export let moveBackward = false;
export let moveLeft = false;
export let moveRight = false;
export let canJump = false;
export let joystickValues = { x: 0, y: 0 };

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

// Player dimensions
const playerEyeHeight = 1.8;
const playerRadius = 0.5;

// Initialize PointerLockControls and keyboard listeners
export function initControls() {
  game.controls = new PointerLockControls(game.camera, game.renderer.domElement);
  game.scene.add(game.controls.getObject());

  // Set camera default height on starting
  game.controls.getObject().position.y = 12; // Start above ground

  // Keyboard Event Handlers
  const onKeyDown = function (event) {
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        moveForward = true;
        break;
      case 'ArrowLeft':
      case 'KeyA':
        moveLeft = true;
        break;
      case 'ArrowDown':
      case 'KeyS':
        moveBackward = true;
        break;
      case 'ArrowRight':
      case 'KeyD':
        moveRight = true;
        break;
      case 'Space':
        if (canJump) {
          velocity.y = 8.5; // Jump vertical velocity
          canJump = false;
        } else if (game.controls.getObject().position.y < 5.5) {
          velocity.y = 3.5; // Swim up velocity in water
        }
        break;
    }
  };

  const onKeyUp = function (event) {
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        moveForward = false;
        break;
      case 'ArrowLeft':
      case 'KeyA':
        moveLeft = false;
        break;
      case 'ArrowDown':
      case 'KeyS':
        moveBackward = false;
        break;
      case 'ArrowRight':
      case 'KeyD':
        moveRight = false;
        break;
    }
  };

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
}

// Update player position, check collisions and apply gravity
export function updateControls(delta) {
  if (!game.pointerLocked) return;

  const playerObj = game.controls.getObject();
  const position = playerObj.position;

  // 1. Water check: Wading or swimming slows down movement and dampens gravity
  const inWater = position.y < 4.8; // Water level is 4.0
  
  // Apply gravity / buoyancy force
  if (inWater) {
    // If player is below water surface (5.0), apply buoyancy to make them float
    const waterSurfaceY = 5.0; // Water level (4.0) + eye height offset to keep head above water
    if (position.y < waterSurfaceY) {
      // Push up towards water surface
      velocity.y += (waterSurfaceY - position.y) * 4.0 * delta;
      // Dampen downward velocity in water
      if (velocity.y < -1.0) velocity.y *= 0.8;
    } else {
      // Normal gravity in water
      velocity.y -= 8.0 * delta;
    }
  } else {
    // Normal gravity on land
    velocity.y -= 24.0 * delta;
  }

  // Linear damping (friction) for movement
  const friction = inWater ? 15.0 : 10.0;
  velocity.x -= velocity.x * friction * delta;
  velocity.z -= velocity.z * friction * delta;

  // Reset direction vector
  if (game.isMobile) {
    direction.x = joystickValues.x;
    direction.z = -joystickValues.y; // note screen Y is inverted: push UP (negative Y) maps to forward (positive Z)
    
    // Analog movement calculation
    const len = direction.length();
    if (len > 1.0) {
      direction.normalize();
    }
  } else {
    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize(); // Ensure uniform diagonal speed
  }

  // Get forward and right relative camera vectors
  const camDir = new THREE.Vector3();
  game.camera.getWorldDirection(camDir);
  
  // Project vectors horizontally (ignore Y for flat WASD movement)
  const forward = new THREE.Vector3(camDir.x, 0, camDir.z).normalize();
  const right = new THREE.Vector3();
  right.crossVectors(forward, game.camera.up).normalize();

  // Apply acceleration input
  const moveSpeed = inWater ? 28.0 : 45.0; // Acceleration force
  if (game.isMobile) {
    velocity.addScaledVector(forward, direction.z * moveSpeed * delta);
    velocity.addScaledVector(right, direction.x * moveSpeed * delta);
  } else {
    if (moveForward || moveBackward) {
      velocity.addScaledVector(forward, direction.z * moveSpeed * delta);
    }
    if (moveLeft || moveRight) {
      velocity.addScaledVector(right, direction.x * moveSpeed * delta);
    }
  }

  // Cap horizontal speed to keep movement smooth
  const horizontalVelocity = new THREE.Vector2(velocity.x, velocity.z);
  const maxSpeed = inWater ? 2.5 : 5.0;
  if (horizontalVelocity.length() > maxSpeed) {
    horizontalVelocity.setLength(maxSpeed);
    velocity.x = horizontalVelocity.x;
    velocity.z = horizontalVelocity.z;
  }

  // 2. Sliding Wall Collision Detection
  // Check movement on X axis separately
  const nextX = position.x + velocity.x * delta;
  // Sample collision at player eye and chest heights
  const isColX = checkCollision(nextX, position.y - 0.4, position.z) || 
                 checkCollision(nextX, position.y - 1.2, position.z);

  if (!isColX) {
    position.x = nextX;
  } else {
    velocity.x = 0; // stop moving on X
  }

  // Check movement on Z axis separately
  const nextZ = position.z + velocity.z * delta;
  const isColZ = checkCollision(position.x, position.y - 0.4, nextZ) || 
                 checkCollision(position.x, position.y - 1.2, nextZ);

  if (!isColZ) {
    position.z = nextZ;
  } else {
    velocity.z = 0; // stop moving on Z
  }

  // Apply Y velocity (vertical movement)
  position.y += velocity.y * delta;

  // 3. Ground Collision & Step-up Heightmap checking
  const groundY = getSurfaceHeightNear(position.x, position.y, position.z);
  const footY = position.y - playerEyeHeight;

  if (footY <= groundY) {
    // Ground collision response
    position.y = groundY + playerEyeHeight;
    
    // Jump mechanics check
    if (velocity.y < 0) {
      velocity.y = 0;
      canJump = true;
    }
  } else {
    canJump = false;
  }

  // Cap Y coordinates so players can't jump out of the world bounds
  if (position.y > 22.0) {
    position.y = 22.0;
    velocity.y = 0;
  }

  // Safety net: if player falls below the world or coordinates become NaN, teleport them safely to the center of the island
  if (position.y < -40.0 || Number.isNaN(position.x) || Number.isNaN(position.y) || Number.isNaN(position.z)) {
    console.warn("Safety net triggered! Player position:", position.x, position.y, position.z, "Velocity Y:", velocity.y);
    position.set(32, 12, 32);
    velocity.set(0, 0, 0);
  }
}

export function triggerMobileJump() {
  const inWater = game.controls && game.controls.getObject && game.controls.getObject().position.y < 4.8;
  if (canJump) {
    velocity.y = 8.5; // Jump vertical velocity
    canJump = false;
  } else if (inWater) {
    velocity.y = 3.5; // Swim up velocity in water
  }
}
