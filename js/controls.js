import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { game } from './game.js';
import { getSurfaceHeightNear, checkCollision, checkInWater, getWaterHeightAt } from './world.js';
import { player, showHudMessage } from './player.js';
import { getTranslation } from './lang.js';

// Movement state variables
export let moveForward = false;
export let moveBackward = false;
export let moveLeft = false;
export let moveRight = false;
export let moveUp = false;
export let moveDown = false;
export let shiftPressed = false;
export let canJump = false;
export let joystickValues = { x: 0, y: 0 };

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

// Throttle world edge warnings
let lastEdgeMsgTime = 0;
function throttleHudEdgeMessage() {
  const now = performance.now();
  if (now - lastEdgeMsgTime > 3000) {
    showHudMessage(getTranslation('msg_world_edge') || "Reached the edge of the world!");
    lastEdgeMsgTime = now;
  }
}

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
        moveUp = true;
        if (canJump) {
          velocity.y = 8.5; // Jump vertical velocity
          canJump = false;
        }
        break;
      case 'KeyC':
      case 'ControlLeft':
        moveDown = true;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        shiftPressed = true;
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
      case 'Space':
        moveUp = false;
        break;
      case 'KeyC':
      case 'ControlLeft':
        moveDown = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        shiftPressed = false;
        break;
    }
  };

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
}

// Update player position, check collisions and apply gravity
export function updateControls(delta) {
  if (!game.pointerLocked) return;

  // If the player is sailing/riding the raft, steer the raft and snap player position
  if (game.raftState && game.raftState.active) {
    const rs = game.raftState;
    
    // W/S: Accelerate / Decelerate
    const accelerate = moveForward ? 1.0 : (moveBackward ? -0.5 : 0.0);
    // A/D: Rotate (steer)
    const rotate = moveLeft ? 1.0 : (moveRight ? -1.0 : 0.0);
    
    // Apply steering rotation
    rs.rotationY += rotate * 1.8 * delta;
    
    // Target speed: max forward 12 m/s, max backward -5 m/s
    const targetSpeed = accelerate * 12.0;
    
    // Smoothly adjust speed towards target
    if (rs.speed < targetSpeed) {
      rs.speed = Math.min(targetSpeed, rs.speed + 6.0 * delta);
    } else if (rs.speed > targetSpeed) {
      rs.speed = Math.max(targetSpeed, rs.speed - 10.0 * delta);
    }
    
    // Rowing sound: periodic splash sound when moving
    if (Math.abs(rs.speed) > 0.5) {
      if (!rs.lastSplashTime) rs.lastSplashTime = 0;
      rs.lastSplashTime += delta;
      if (rs.lastSplashTime > 1.2) {
        rs.lastSplashTime = 0;
        if (typeof window.playRowingSplash === 'function') {
          window.playRowingSplash();
        }
      }
    }
    
    // Update raft position based on yaw rotation
    rs.position.x += Math.sin(rs.rotationY) * rs.speed * delta;
    rs.position.z += Math.cos(rs.rotationY) * rs.speed * delta;
    
    // Snap raft Y to water height (bobs on waves!)
    const waterY = getWaterHeightAt(rs.position.x, rs.position.z);
    rs.position.y = waterY;
    
    // Snap player coordinate positions to raft center
    const playerObj = game.controls.getObject();
    playerObj.position.copy(rs.position);
    playerObj.position.y += 1.45; // standing eye height offset
    
    // Sync 3D raft mesh group position and rotation
    if (world.raftMesh) {
      world.raftMesh.position.copy(rs.position);
      world.raftMesh.rotation.y = rs.rotationY;
    }
    return;
  }

  const playerObj = game.controls.getObject();
  const position = playerObj.position;

  // 1. Water check: Wading or swimming slows down movement and dampens gravity
  const inWater = checkInWater(position.x, position.y - 1.0, position.z);
  
  // Get forward and right relative camera vectors
  const camDir = new THREE.Vector3();
  game.camera.getWorldDirection(camDir);

  // Apply gravity / buoyancy force
  if (inWater) {
    const baseWaterHeight = getWaterHeightAt(position.x, position.z);
    const waterSurfaceY = baseWaterHeight + 1.0; // Water level + eye height offset to keep head above water
    const isMovingForward = game.isMobile ? (direction.z > 0.1) : moveForward;
    
    if (moveUp) {
      velocity.y += 12.0 * delta;
    } else if (moveDown) {
      velocity.y -= 12.0 * delta;
    } else if (position.y < waterSurfaceY) {
      // If we are underwater and not pressing swim keys, buoyancy floats us up
      // unless we are actively swimming down by looking down
      const isSwimmingDown = isMovingForward && camDir.y < -0.15;
      if (!isSwimmingDown) {
        velocity.y += (waterSurfaceY - position.y) * 4.0 * delta;
        if (velocity.y < -1.0) velocity.y *= 0.8;
      }
    } else {
      velocity.y -= 8.0 * delta;
    }
    
    // Cap vertical velocity in water for controlled swimming
    if (velocity.y > 3.0) velocity.y = 3.0;
    if (velocity.y < -3.0) velocity.y = -3.0;
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

  // Project forward vector. If in water, allow Y component to steer vertical swimming
  const forward = inWater
    ? camDir.clone().normalize()
    : new THREE.Vector3(camDir.x, 0, camDir.z).normalize();
  const right = new THREE.Vector3();
  right.crossVectors(forward, game.camera.up).normalize();

  // Apply speed boost from equipped boots
  const hasBoots = player.equipped && player.equipped.feet === 'wooden_boots';
  const speedMultiplier = hasBoots ? 1.15 : 1.0;

  // Walking vs Running Speed Scale (Walk at 40% speed, run at 100%)
  const isRunning = shiftPressed || game.isMobile;
  const speedScale = isRunning ? 1.0 : 0.4;

  // Apply acceleration input
  const moveSpeed = (inWater ? 28.0 : 45.0) * speedMultiplier * speedScale; // Acceleration force
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
  const maxSpeed = (inWater ? 2.5 : 5.0) * speedMultiplier * speedScale;
  if (horizontalVelocity.length() > maxSpeed) {
    horizontalVelocity.setLength(maxSpeed);
    velocity.x = horizontalVelocity.x;
    velocity.z = horizontalVelocity.y;
  }

  // 2. Sliding Wall Collision Detection
  // Check movement on X axis separately
  const nextX = position.x + velocity.x * delta;
  // Sample collision at player eye and chest heights
  const isColX = checkCollision(nextX, position.y - 0.4, position.z) || 
                 checkCollision(nextX, position.y - 1.0, position.z);

  if (!isColX) {
    position.x = nextX;
  } else {
    velocity.x = 0; // stop moving on X
  }

  // Check movement on Z axis separately
  const nextZ = position.z + velocity.z * delta;
  const isColZ = checkCollision(position.x, position.y - 0.4, nextZ) || 
                 checkCollision(position.x, position.y - 1.0, nextZ);

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
  if (position.y > 25.5) {
    position.y = 25.5;
    velocity.y = 0;
  }

  // Boundary constraints: 22x22 km (from -11000m to +11000m on X and Z)
  const halfSize = 11000.0;
  let hitEdge = false;
  if (position.x < -halfSize) { position.x = -halfSize; velocity.x = 0; hitEdge = true; }
  if (position.x > halfSize) { position.x = halfSize; velocity.x = 0; hitEdge = true; }
  if (position.z < -halfSize) { position.z = -halfSize; velocity.z = 0; hitEdge = true; }
  if (position.z > halfSize) { position.z = halfSize; velocity.z = 0; hitEdge = true; }

  if (hitEdge) {
    throttleHudEdgeMessage();
  }

  // Safety net: if player falls below the world or coordinates become NaN, teleport them safely to the center of the island
  if (position.y < -40.0 || Number.isNaN(position.x) || Number.isNaN(position.y) || Number.isNaN(position.z)) {
    console.warn("Safety net triggered! Player position:", position.x, position.y, position.z, "Velocity Y:", velocity.y);
    let reason = "Safety Reset: ";
    if (position.y < -40.0) {
      reason += `Fell below -40 (Y=${position.y.toFixed(1)})`;
    } else if (Number.isNaN(position.x)) {
      reason += "NaN X";
    } else if (Number.isNaN(position.y)) {
      reason += "NaN Y";
    } else if (Number.isNaN(position.z)) {
      reason += "NaN Z";
    }
    showHudMessage(reason);
    position.set(96, 12, 96);
    velocity.set(0, 0, 0);
  }
}

export function triggerMobileJump() {
  const p = game.controls && game.controls.getObject && game.controls.getObject().position;
  const inWater = p && checkInWater(p.x, p.y - 1.0, p.z);
  if (canJump) {
    velocity.y = 8.5; // Jump vertical velocity
    canJump = false;
  } else if (inWater) {
    velocity.y = 3.5; // Swim up velocity in water
  }
}
