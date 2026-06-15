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
  const inWater = position.y < 4.8; // Water level is 4.0, player feet are at position.y - playerEyeHeight (1.8) = 2.2 inside water if height is 4.0
  const gravityScale = inWater ? 8.0 : 24.0; // Water buoyancy
  const jumpDamp = inWater ? 0.4 : 1.0;
  
  // Apply gravity
  velocity.y -= gravityScale * delta;

  // Linear damping (friction) for movement
  const friction = inWater ? 15.0 : 10.0;
  velocity.x -= velocity.x * friction * delta;
  velocity.z -= velocity.z * friction * delta;

  // Reset direction vector
  direction.z = Number(moveForward) - Number(moveBackward);
  direction.x = Number(moveRight) - Number(moveLeft);
  direction.normalize(); // Ensure uniform diagonal speed

  // Get forward and right relative camera vectors
  const camDir = new THREE.Vector3();
  game.camera.getWorldDirection(camDir);
  
  // Project vectors horizontally (ignore Y for flat WASD movement)
  const forward = new THREE.Vector3(camDir.x, 0, camDir.z).normalize();
  const right = new THREE.Vector3();
  right.crossVectors(forward, game.camera.up).normalize();

  // Apply acceleration input
  const moveSpeed = inWater ? 28.0 : 45.0; // Acceleration force
  if (moveForward || moveBackward) {
    velocity.addScaledVector(forward, direction.z * moveSpeed * delta);
  }
  if (moveLeft || moveRight) {
    velocity.addScaledVector(right, direction.x * moveSpeed * delta);
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
}
