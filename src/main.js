import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { GUI } from 'lil-gui'; // Using lil-gui (modern dat.GUI alternative) for better ES6 support
import { createWatchFace, createTextTexture } from './watch/watchFace.js';
import { createWatchArms } from './watch/watchArms.js';
import { setupCoordinateSystem } from './utils/coordinateSystem.js';

// Coordinate system declaration (per CURSOR_RULES.md §6)
// Right-handed, Y-up
// X: East(+)/West(-)
// Y: Up(+)/Down(-)
// Z: South(+)/North(-)
// Origin: Center of world grid
const coordinateSystem = {
  handedness: 'right',
  up: 'Y',
  origin: 'center',
  units: 'meters'
};

// Create gradient background texture
function createGradientBackground() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  
  // Create vertical gradient (top to bottom)
  const gradient = context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#d0d0e0'); // Light blue-gray at top
  gradient.addColorStop(0.5, '#c0c0d0'); // Medium blue-gray in middle
  gradient.addColorStop(1, '#a0a0b0'); // Darker blue-gray at bottom
  
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// Scene setup
const scene = new THREE.Scene();
scene.background = createGradientBackground(); // Gradient background
scene.fog = new THREE.FogExp2(0xa0a0b0, 0.03); // Exponential fog (color, density) - reduced

// Detect mobile device
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
    || window.innerWidth <= 768 
    || ('ontouchstart' in window);
}
const isMobile = isMobileDevice();

// Mobile camera auto-adjustment variables
let targetCameraPosition = new THREE.Vector3();
let targetCameraZoom = 1.7;
let cameraLerpSpeed = 0.03; // Slower, smoother camera movement
let lastCameraAdjustSecond = -1; // Track when camera was last adjusted

// Camera setup
const camera = new THREE.PerspectiveCamera(
  101,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

// Camera initial setup - will be dynamically adjusted on mobile
if (isMobile) {
  const aspect = window.innerWidth / window.innerHeight;
  const isPortrait = aspect < 1;
  
  if (isPortrait) {
    camera.position.set(0, 3.0, 4.2);
    camera.zoom = 1.5;
  } else {
    camera.position.set(0, 2.8, 4.0);
    camera.zoom = 1.8;
  }
  targetCameraPosition.copy(camera.position);
  targetCameraZoom = camera.zoom;
} else {
  camera.position.set(-0.3, 3.3, 2.7);
  camera.zoom = 1.7;
  targetCameraPosition.copy(camera.position);
  targetCameraZoom = camera.zoom;
}
camera.updateProjectionMatrix();

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft shadows
document.getElementById('canvas-container').appendChild(renderer.domElement);

// Coordinate system verification helpers
const { axesHelper, gridHelper } = setupCoordinateSystem(scene);
axesHelper.visible = false; // Default: hidden
gridHelper.visible = false; // Default: hidden

// Camera controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
  // Mobile: target will be set dynamically in animate loop to follow arm midpoint; Desktop: keep original offset
  if (isMobile) {
    // Initial target will be set in first animate frame based on arm position
  } else {
    controls.target.set(-0.2, 0.5, 1.3);
  }
controls.update();

// Watch face (at origin, Y=0)
const watchFace = createWatchFace();
scene.add(watchFace);

// Track last day/date to avoid unnecessary texture updates
let lastDay = -1;
let lastDate = -1;

// Watch arms
const arms = createWatchArms();
scene.add(arms);

// Physics setup
let physicsWorld;
let RAPIER; // Will be loaded dynamically
// Initialize cubes array early to prevent ReferenceError
const cubes = []; // Array to store cube meshes and their physics bodies
let armBodies = {
  second: null,
  minute: null,
  hour: null
};

// Initialize physics world
async function initPhysics() {
  // Use rapier3d-compat which has proper init() function
  const rapierModule = await import('@dimforge/rapier3d-compat');
  RAPIER = rapierModule.default || rapierModule;
  
  // Initialize Rapier - this loads the WASM module
  await RAPIER.init();
  
  // Create physics world with gravity
  const gravity = new RAPIER.Vector3(0.0, -9.81, 0.0);
  physicsWorld = new RAPIER.World(gravity);
  
  // Create static collider for watch face (circular plane at Y=0)
  // Watch face is a circle with radius 3, use square collider that matches the visual radius
  // to prevent cubes from falling through gaps at the edges
  const watchFaceRadius = 3.0; // Match visual radius to prevent gaps
  const watchFaceColliderDesc = RAPIER.ColliderDesc.cuboid(watchFaceRadius, 0.01, watchFaceRadius); // Flat box matching watch face
  watchFaceColliderDesc.setTranslation(0, 0, 0); // At origin, Y=0
  watchFaceColliderDesc.setRotation({ x: 0, y: 0, z: 0, w: 1 }); // Flat in XZ plane
  watchFaceColliderDesc.setRestitution(0.1); // Low restitution on watch face for less bouncing
  physicsWorld.createCollider(watchFaceColliderDesc);
  
  // Add physics colliders for hour numbers so cubes can collide with them
  if (watchFace.userData.numberMeshes) {
    const numberMeshes = watchFace.userData.numberMeshes;
    for (const numberMesh of numberMeshes) {
      // Create a thin box collider for each number (flat plane)
      // Number plane is 0.6 x 0.6, positioned at y=0.09, rotated -90° around X
      const numberPos = numberMesh.position;
      const numberColliderDesc = RAPIER.ColliderDesc.cuboid(0.3, 0.01, 0.3); // Half extents: 0.6/2 = 0.3
      numberColliderDesc.setTranslation(numberPos.x, numberPos.y, numberPos.z);
      // Rotate to match the plane orientation (flat in XZ plane)
      // Rotation: -90° around X axis = quaternion (0.707, 0, 0, 0.707)
      numberColliderDesc.setRotation({ x: 0.707, y: 0, z: 0, w: 0.707 });
      numberColliderDesc.setRestitution(0.1); // Low restitution on numbers for less bouncing
      physicsWorld.createCollider(numberColliderDesc);
    }
  }
  
  // Create physics bodies for watch arms (kinematic - controlled by script, can push cubes)
  // Arms rotate around origin (0,0,0), so physics bodies should be at origin
  // Second arm: cylinder, length 3.0, positioned at origin, extends along Z-axis
  const secondArmBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(0, 0.08, 0); // At origin, below minute and hour arms
  const secondArmBody = physicsWorld.createRigidBody(secondArmBodyDesc);
  // Use a capsule collider for the second arm - extends along Z from origin
  // Match the visual arm: length 3.0, radius 0.025-0.06 (tapered), use average radius
  // Capsule: half-height is the length from center to end, radius matches visual arm
  const secondArmColliderDesc = RAPIER.ColliderDesc.capsule(1.4, 0.045); // half-height (length/2), radius (average of 0.025 and 0.06)
  secondArmColliderDesc.setTranslation(0, 0, 1.4); // Offset along Z to center the capsule
  secondArmColliderDesc.setRotation({ x: 0.707, y: 0, z: 0, w: 0.707 }); // Rotate 90° around X to be horizontal
  physicsWorld.createCollider(secondArmColliderDesc, secondArmBody);
  armBodies.second = secondArmBody;
  
  // Minute arm: box, 0.12 x 0.045 x 1.8, positioned at origin, extends along Z-axis
  const minuteArmBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(0, 0.35, 0); // At origin, at arm height (higher to avoid cubes)
  const minuteArmBody = physicsWorld.createRigidBody(minuteArmBodyDesc);
  // Box: half extents (width/2, height/2, depth/2) - match visual arm dimensions exactly
  const minuteArmColliderDesc = RAPIER.ColliderDesc.cuboid(0.06, 0.0225, 0.9); // Half extents (0.12/2, 0.045/2, 1.8/2)
  minuteArmColliderDesc.setTranslation(0, 0, 0.9); // Offset along Z to center the box
  physicsWorld.createCollider(minuteArmColliderDesc, minuteArmBody);
  armBodies.minute = minuteArmBody;
  
  // Hour arm: box, 0.16 x 0.045 x 1.2, positioned at origin, extends along Z-axis
  const hourArmBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(0, 0.30, 0); // At origin, at arm height (higher to avoid cubes)
  const hourArmBody = physicsWorld.createRigidBody(hourArmBodyDesc);
  const hourArmColliderDesc = RAPIER.ColliderDesc.cuboid(0.08, 0.0225, 0.6); // Half extents (0.16/2, 0.045/2, 1.2/2)
  hourArmColliderDesc.setTranslation(0, 0, 0.6); // Offset along Z to center the box
  physicsWorld.createCollider(hourArmColliderDesc, hourArmBody);
  armBodies.hour = hourArmBody;
  
  // Spawn initial 300 cubes
  spawnInitialCubes(300);
}

// Track simulation start time
const simulationStartTime = Date.now();

// Track whether we should spawn replacement cubes (pause at 300, resume at 150)
let shouldSpawnReplacementCubes = true;
let lastCubeCount = 0; // Track previous cube count to detect threshold crossing

// Initialize physics
initPhysics();

// Cube properties - physics properties (colors are now determined by mass)
// Base mass range: 0.1 (lightest/red) to 10.0 (heaviest/violet) - much wider range for better color distinction
const baseMassMin = 0.1;
const baseMassMax = 10.0;

// Map mass to color in spectrum: Red (lightest) → Yellow → Green → Cyan → Blue → Magenta/Violet (heaviest)
function massToColor(mass) {
  // Normalize mass to 0-1 range based on base mass range
  let normalized = Math.max(0, Math.min(1, (mass - baseMassMin) / (baseMassMax - baseMassMin)));
  
  // Apply power curve to make differences more visible (emphasize differences)
  // Using power < 1 to spread out the lower masses more, making them more distinguishable
  normalized = Math.pow(normalized, 0.7); // 0.7 power makes differences more visible
  
  // Interpolate through the spectrum
  // Red (0) → Orange → Yellow (0.2) → Green (0.4) → Cyan (0.6) → Blue (0.8) → Violet (1.0)
  let r, g, b;
  
  if (normalized < 0.2) {
    // Red to Yellow
    const t = normalized / 0.2;
    r = 255;
    g = Math.round(255 * t);
    b = 0;
  } else if (normalized < 0.4) {
    // Yellow to Green
    const t = (normalized - 0.2) / 0.2;
    r = Math.round(255 * (1 - t));
    g = 255;
    b = 0;
  } else if (normalized < 0.6) {
    // Green to Cyan
    const t = (normalized - 0.4) / 0.2;
    r = 0;
    g = 255;
    b = Math.round(255 * t);
  } else if (normalized < 0.8) {
    // Cyan to Blue
    const t = (normalized - 0.6) / 0.2;
    r = 0;
    g = Math.round(255 * (1 - t));
    b = 255;
  } else {
    // Blue to Violet
    const t = (normalized - 0.8) / 0.2;
    r = Math.round(255 * t);
    g = 0;
    b = 255;
  }
  
  return (r << 16) | (g << 8) | b;
}

// Get physics properties based on mass (interpolate between light and heavy properties)
function getPhysicsProperties(mass) {
  // Normalize based on base mass range (not affected by massVariation for consistent physics)
  const normalized = Math.max(0, Math.min(1, (mass - baseMassMin) / (baseMassMax - baseMassMin)));
  
  // Interpolate friction and restitution
  const friction = 0.3 + (0.8 - 0.3) * normalized; // 0.3 (light) to 0.8 (heavy)
  // Reduced restitution for less bouncing: 0.15 (light) to 0.05 (heavy) - much less bouncy
  const restitution = 0.15 - (0.15 - 0.05) * normalized;
  
  return { friction, restitution };
}

// Create a rounded cube (rounded edges)
function createRoundedCube(size, color, roundness = cubeRoundness, material = null) {
  // Use RoundedBoxGeometry for proper rounded edges
  const segments = 3; // Number of segments per edge (higher = smoother but more vertices)
  const geometry = new RoundedBoxGeometry(size, size, size, segments, roundness);
  // Use provided material or create new one
  if (!material) {
    material = new THREE.MeshStandardMaterial({ 
      color: color,
      metalness: 0.0, // Plastic has no metalness
      roughness: 0.3  // Semi-shiny plastic
    });
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Spawn a cube with random properties
// Check if a position would overlap with watch arms
function wouldOverlapWithArms(x, z, cubeSize) {
  const distanceFromCenter = Math.sqrt(x * x + z * z);
  const cubeHalfSize = cubeSize / 2;
  
  // Arm dimensions (from watchArms.js):
  // Second arm: length 2.8, radius 0.025-0.06 (tapered), y = 0.08
  // Minute arm: length 1.8, width 0.12, height 0.045, y = 0.20
  // Hour arm: length 1.2, width 0.16, height 0.045, y = 0.14
  
  // Cubes spawn at y = cubeSize/2, which ranges from 0.025 to 0.125
  // Check vertical overlap with each arm
  const cubeY = cubeSize / 2;
  const cubeYMin = cubeY - cubeHalfSize;
  const cubeYMax = cubeY + cubeHalfSize;
  
  // Padding to ensure no overlap (account for arm width and cube size)
  const padding = 0.2; // Increased padding for safety
  
  // Calculate current arm rotations based on current time
  const now = new Date();
  const rawSeconds = now.getSeconds();
  const rawMinutes = now.getMinutes();
  const rawHours = now.getHours();
  
  // Calculate arm rotations (same as in animate function)
  const secondsRotation = Math.PI - (rawSeconds / 60) * Math.PI * 2;
  const minutesRotation = Math.PI - (rawMinutes / 60) * Math.PI * 2;
  const hoursRotation = Math.PI - ((rawHours % 12) / 12) * Math.PI * 2;
  
  // Helper function to check if point is near a rotated line segment
  function isNearRotatedArm(cubeX, cubeZ, armRotation, armLength, armWidth) {
    // Rotate cube position to arm's local space (arm points along +Z axis)
    const cos = Math.cos(-armRotation);
    const sin = Math.sin(-armRotation);
    const localX = cubeX * cos - cubeZ * sin;
    const localZ = cubeX * sin + cubeZ * cos;
    
    // Check if cube is within arm's length and width
    // Arm extends from origin along +Z axis
    if (localZ >= -armWidth/2 && localZ <= armLength + armWidth/2) {
      const distFromArm = Math.abs(localX);
      if (distFromArm < armWidth/2 + cubeHalfSize + padding) {
        return true;
      }
    }
    return false;
  }
  
  // Second arm: y = 0.08, radius up to 0.06, length 2.8
  const secondArmY = 0.08;
  const secondArmRadius = 0.06;
  const secondArmLength = 2.8;
  if (cubeYMax > secondArmY - secondArmRadius && cubeYMin < secondArmY + secondArmRadius) {
    if (isNearRotatedArm(x, z, secondsRotation, secondArmLength, secondArmRadius * 2)) {
      return true;
    }
  }
  
  // Minute arm: y = 0.20, height 0.045, length 1.8, width 0.12
  const minuteArmY = 0.20;
  const minuteArmHeight = 0.045;
  const minuteArmLength = 1.8;
  const minuteArmWidth = 0.12;
  if (cubeYMax > minuteArmY - minuteArmHeight/2 && cubeYMin < minuteArmY + minuteArmHeight/2) {
    if (isNearRotatedArm(x, z, minutesRotation, minuteArmLength, minuteArmWidth)) {
      return true;
    }
  }
  
  // Hour arm: y = 0.30, height 0.045, length 1.2, width 0.16
  const hourArmY = 0.30;
  const hourArmHeight = 0.045;
  const hourArmLength = 1.2;
  const hourArmWidth = 0.16;
  if (cubeYMax > hourArmY - hourArmHeight/2 && cubeYMin < hourArmY + hourArmHeight/2) {
    if (isNearRotatedArm(x, z, hoursRotation, hourArmLength, hourArmWidth)) {
      return true;
    }
  }
  
  return false;
}

function spawnCube(randomY = true, isRedRepulsionCube = false) {
  // Check if physics is initialized
  if (!RAPIER || !physicsWorld) return;
  
  // Pre-determine cube size
  let normalizedSize, cubeSize;
  if (isRedRepulsionCube) {
    // Special cubes (red/blue) should be between median and max size
    const medianSize = (cubeSizeMin + cubeSizeMax) / 2;
    const sizeRange = cubeSizeMax - medianSize; // Range from median to max
    cubeSize = medianSize + Math.random() * sizeRange; // Random between median and max
    // Calculate normalized size for later use (0.5 to 1.0 range)
    normalizedSize = 0.5 + (cubeSize - medianSize) / (cubeSizeMax - cubeSizeMin);
  } else {
    // Regular cubes: random size across full range
    normalizedSize = Math.random();
    cubeSize = cubeSizeMin + normalizedSize * (cubeSizeMax - cubeSizeMin);
  }
  
  let x, z, radius, angle;
  
  if (randomY) {
    // Random position on watch face, avoiding arms
    let attempts = 0;
    const maxAttempts = 100;
    
    do {
      angle = Math.random() * Math.PI * 2;
      radius = Math.random() * 2.8; // Random radius up to 2.8 (within watch face, avoiding edges)
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
      attempts++;
      
      // If we've tried too many times, just use this position (avoid infinite loop)
      if (attempts >= maxAttempts) break;
    } while (wouldOverlapWithArms(x, z, cubeSize));
  } else {
    // Drop from above - random position above watch face, weighted towards center
    angle = Math.random() * Math.PI * 2;
    const randomValue = Math.random(); // 0 to 1
    
    // Regular cubes and red cube: use larger radius
    const maxRadius = 1.2; // Reduced from 2.5 to 1.2 for closer to center
    radius = Math.sqrt(randomValue) * maxRadius; // Square root distribution favors smaller radii
    
    x = Math.cos(angle) * radius;
    z = Math.sin(angle) * radius;
  }
  
  // Random base mass (before massVariation multiplier)
  let randomBaseMass, adjustedMass;
  if (isRedRepulsionCube) {
    // Special cubes should be very heavy so they're not easily pushed around by collisions
    randomBaseMass = baseMassMax; // Use maximum mass
    adjustedMass = randomBaseMass * massVariation * 5.0; // Make them 5x heavier than normal
  } else {
    randomBaseMass = baseMassMin + Math.random() * (baseMassMax - baseMassMin);
    adjustedMass = randomBaseMass * massVariation;
  }
  
  // Use red color for repulsion cube, white for others
  let color;
  if (isRedRepulsionCube) {
    color = 0xff0000; // Red
  } else {
    color = 0xffffff; // White
  }
  
  // Get physics properties based on base mass (for consistent physics behavior)
  const physicsProps = getPhysicsProperties(randomBaseMass);
  
  // Store physics properties in material for later retrieval
  // Semi-shiny plastic: low metalness, medium-low roughness for semi-shiny appearance
  const material = new THREE.MeshStandardMaterial({ 
    color: color,
    metalness: 0.0, // Plastic has no metalness
    roughness: 0.3  // Lower roughness = more shiny (0.3 = semi-shiny plastic)
  });
  material.userData.friction = physicsProps.friction;
  material.userData.restitution = physicsProps.restitution;
  
  // Create Three.js mesh
  // normalizedSize and cubeSize already determined above for overlap checking
  const size = cubeSize; // Use the size determined above
  
  // Place cubes: if randomY is true, place on watch face; if false, drop from above
  let y;
  if (randomY) {
    // Place cubes on the watch face (Y = half cube size so bottom sits on Y=0)
    y = size / 2;
  } else {
    // Drop from above (spawn above the watch face, will fall down)
    y = 5.0; // Spawn high above the watch face
  }
  const cubeMesh = createRoundedCube(size, color, cubeRoundness, material);
  cubeMesh.position.set(x, y, z);
  scene.add(cubeMesh);
  
  // Create physics body
  const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(x, y, z);
  const rigidBody = physicsWorld.createRigidBody(rigidBodyDesc);
  
  // Create collider with physics properties
  const colliderDesc = RAPIER.ColliderDesc.cuboid(size / 2, size / 2, size / 2)
    .setFriction(physicsProps.friction)
    .setRestitution(physicsProps.restitution);
  colliderDesc.setDensity(adjustedMass);
  const collider = physicsWorld.createCollider(colliderDesc, rigidBody);
  
  // Store cube data
  const cubeData = {
    mesh: cubeMesh,
    rigidBody: rigidBody,
    collider: collider, // Store collider reference for updates
    size: size, // Store size for roundness updates
    normalizedSize: normalizedSize, // Store normalized size (0-1) for size range updates
    baseMass: randomBaseMass, // Store base mass (before massVariation) for color and physics
    mass: adjustedMass, // Store adjusted mass for physics density
    isRedRepulsionCube: isRedRepulsionCube, // Flag to identify red repulsion cube
    spawnTime: isRedRepulsionCube ? Date.now() : null // Track spawn time for special cubes
  };
  cubes.push(cubeData);
  
  // Store reference to special cubes (no longer needed for red cubes - using flag instead)
  
  return cubeData;
}

// Spawn initial cubes
function spawnInitialCubes(count = 300) {
  for (let i = 0; i < count; i++) {
    spawnCube();
  }
}

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.78);
directionalLight.position.set(5, 10, 5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 4096; // Increased for better quality
directionalLight.shadow.mapSize.height = 4096; // Increased for better quality
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 50;
directionalLight.shadow.camera.left = -10;
directionalLight.shadow.camera.right = 10;
directionalLight.shadow.camera.top = 10;
directionalLight.shadow.camera.bottom = -10;
directionalLight.shadow.bias = -0.0001;
directionalLight.shadow.radius = 16; // Even more soft shadow blur radius
scene.add(directionalLight);

// Animation parameters (exposed for debug panel)
let secondsLerpFactor = 0.3;
let minutesLerpFactor = 0.1;
let hoursLerpFactor = 0.1;
let secondsAccumulatedRotation = 0; // Track accumulated rotation to prevent resets
let lastSecondsValue = -1;
let lastSpawnedSecond = -1; // Track last second when a cube was spawned
let fogDensity = 0.03;
let ambientIntensity = 0.75;
let directionalIntensity = 1.78;
let showAxes = false;
let showGrid = false;
let cubeRoundness = 0.03; // Roundness for cube edges (0 = sharp, higher = more rounded)
let massVariation = 10.0; // Mass variation multiplier (1.0 = default, higher = more variation)
let cubeSizeMin = 0.05; // Minimum cube size
let cubeSizeMax = 0.25; // Maximum cube size
let repulsionStrength = 5.0; // Strength of repulsion from red cube
let redRepulsionCube = null; // Reference to the red repulsion cube
const SPECIAL_CUBE_LIFETIME = 15000; // 15 seconds in milliseconds

// Debug panel using lil-gui (dat.GUI style) - only on desktop
let gui = null;
let guiContainer = null;
if (!isMobile) {
  gui = new GUI({ title: 'Debug Panel', autoPlace: false });
  gui.close(); // Collapse debug panel by default
  guiContainer = document.createElement('div');
  guiContainer.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 1000;';
  document.body.appendChild(guiContainer);
  guiContainer.appendChild(gui.domElement);
}

// GUI parameter objects (defined before GUI creation)
const cameraParams = {
  'Camera X': -0.3,
  'Camera Y': 3.3,
  'Camera Z': 2.7,
  'Target X': -0.2,
  'Target Y': 0.5,
  'Target Z': 1.3,
  'Zoom': 1.7,
  'FOV': 101
};
const fogParams = { 'Fog Density': 0.03 };
const lightingParams = {
  'Ambient Intensity': 0.75,
  'Directional Intensity': 1.78
};
const animationParams = {
  'Seconds Lerp': 0.3,
  'Minutes Lerp': 0.1,
  'Hours Lerp': 0.1
};
const debugParams = {
  'Show Axes': false,
  'Show Grid': false
};
const cubesParams = {
  'Cube Roundness': 0.03,
  'Mass Variation': 10.0,
  'Repulsion Strength': 5.0,
  'Cube Size Min': 0.05,
  'Cube Size Max': 0.25
};

// Only create GUI folders and controllers on desktop
if (!isMobile && gui) {
  // Camera folder
  const cameraFolder = gui.addFolder('Camera');
  
  // Fog folder
  const fogFolder = gui.addFolder('Fog');
  fogFolder.add(fogParams, 'Fog Density', 0, 0.1, 0.001).onChange((val) => {
    fogDensity = val;
    scene.fog.density = val;
  });
  
  // Lighting folder
  const lightingFolder = gui.addFolder('Lighting');
  lightingFolder.add(lightingParams, 'Ambient Intensity', 0, 2, 0.01).onChange((val) => {
    ambientIntensity = val;
    ambientLight.intensity = val;
  });
  lightingFolder.add(lightingParams, 'Directional Intensity', 0, 2, 0.01).onChange((val) => {
    directionalIntensity = val;
    directionalLight.intensity = val;
  });
  
  // Animation folder
  const animationFolder = gui.addFolder('Animation');
  animationFolder.add(animationParams, 'Seconds Lerp', 0, 1, 0.01).onChange((val) => {
    secondsLerpFactor = val;
  });
  animationFolder.add(animationParams, 'Minutes Lerp', 0, 1, 0.01).onChange((val) => {
    minutesLerpFactor = val;
  });
  animationFolder.add(animationParams, 'Hours Lerp', 0, 1, 0.01).onChange((val) => {
    hoursLerpFactor = val;
  });
  
  // Debug folder
  const debugFolder = gui.addFolder('Debug');
  debugFolder.add(debugParams, 'Show Axes').onChange((val) => {
    showAxes = val;
    axesHelper.visible = val;
  });
  debugFolder.add(debugParams, 'Show Grid').onChange((val) => {
    showGrid = val;
    gridHelper.visible = val;
  });
  
  // Cubes folder
  const cubesFolder = gui.addFolder('Cubes');
  cubesFolder.add(cubesParams, 'Cube Roundness', 0, 0.2, 0.01).onChange((val) => {
    cubeRoundness = val;
    // Update all existing cubes with new roundness
    cubes.forEach(cube => {
      const oldGeometry = cube.mesh.geometry;
      const size = cube.size || 0.2; // Use stored size
      
      // Dispose old geometry
      oldGeometry.dispose();
      
      // Create new geometry with updated roundness
      const newGeometry = new RoundedBoxGeometry(size, size, size, 3, cubeRoundness);
      cube.mesh.geometry = newGeometry;
    });
  });
  cubesFolder.add(cubesParams, 'Mass Variation', 0.1, 20.0, 0.1).onChange((val) => {
    massVariation = val;
    // Update existing cubes: recalculate adjusted mass and update physics collider density
    cubes.forEach(cube => {
    if (cube.baseMass !== undefined) {
      // Recalculate adjusted mass with new multiplier
      const newAdjustedMass = cube.baseMass * massVariation;
      cube.mass = newAdjustedMass;
      
      // Update physics collider density
      if (cube.collider && physicsWorld) {
        const position = cube.rigidBody.translation();
        const rotation = cube.rigidBody.rotation();
        const linvel = cube.rigidBody.linvel();
        const angvel = cube.rigidBody.angvel();
        
        // Remove old collider (wakeUp = true to ensure physics updates)
        physicsWorld.removeCollider(cube.collider, true);
        
        // Get physics properties from material
        const friction = cube.mesh.material.userData?.friction || 0.5;
        const restitution = cube.mesh.material.userData?.restitution || 0.5;
        
        // Create new collider with updated density
        const colliderDesc = RAPIER.ColliderDesc.cuboid(cube.size / 2, cube.size / 2, cube.size / 2)
          .setDensity(newAdjustedMass)
          .setFriction(friction)
          .setRestitution(restitution);
        cube.collider = physicsWorld.createCollider(colliderDesc, cube.rigidBody);
        
        // Ensure rigid body is awake and active
        cube.rigidBody.wakeUp();
        
        // Restore position, rotation, and velocity
        cube.rigidBody.setTranslation(position, true);
        cube.rigidBody.setRotation(rotation, true);
        cube.rigidBody.setLinvel(linvel, true);
        cube.rigidBody.setAngvel(angvel, true);
      }
    } else {
      // Fallback for cubes created before baseMass was stored
      const newColor = massToColor(cube.mass / massVariation);
      cube.mesh.material.color.setHex(newColor);
    }
  });
  });
  cubesFolder.add(cubesParams, 'Repulsion Strength', 0, 200, 1).onChange((val) => {
    repulsionStrength = val;
  });
  const cubeSizeMinCtrl = cubesFolder.add(cubesParams, 'Cube Size Min', 0.05, 1.0, 0.01);
  cubeSizeMinCtrl.onChange((val) => {
    cubeSizeMin = val;
    // Ensure min doesn't exceed max
    if (cubeSizeMin > cubeSizeMax) {
      cubeSizeMin = cubeSizeMax;
      cubesParams['Cube Size Min'] = cubeSizeMin;
      cubeSizeMinCtrl.updateDisplay();
    }
    // Update all existing cubes
    updateCubeSizes();
  });

  const cubeSizeMaxCtrl = cubesFolder.add(cubesParams, 'Cube Size Max', 0.05, 1.0, 0.01);
  cubeSizeMaxCtrl.onChange((val) => {
    cubeSizeMax = val;
    // Ensure max doesn't go below min
    if (cubeSizeMax < cubeSizeMin) {
      cubeSizeMax = cubeSizeMin;
      cubesParams['Cube Size Max'] = cubeSizeMax;
      cubeSizeMaxCtrl.updateDisplay();
    }
    // Update all existing cubes
    updateCubeSizes();
  });
  
  // Store controllers after creation
  const cameraXCtrl = cameraFolder.add(cameraParams, 'Camera X', -20, 20, 0.1);
  cameraControllers.positionX = cameraXCtrl;
  cameraXCtrl.onChange((val) => {
    camera.position.x = val;
    controls.update();
  });
  
  const cameraYCtrl = cameraFolder.add(cameraParams, 'Camera Y', 0, 20, 0.1);
  cameraControllers.positionY = cameraYCtrl;
  cameraYCtrl.onChange((val) => {
    camera.position.y = val;
    controls.update();
  });
  
  const cameraZCtrl = cameraFolder.add(cameraParams, 'Camera Z', -20, 20, 0.1);
  cameraControllers.positionZ = cameraZCtrl;
  cameraZCtrl.onChange((val) => {
    camera.position.z = val;
    controls.update();
  });
  
  const targetXCtrl = cameraFolder.add(cameraParams, 'Target X', -10, 10, 0.1);
  cameraControllers.targetX = targetXCtrl;
  targetXCtrl.onChange((val) => {
    controls.target.x = val;
    controls.update();
  });
  
  const targetYCtrl = cameraFolder.add(cameraParams, 'Target Y', -10, 10, 0.1);
  cameraControllers.targetY = targetYCtrl;
  targetYCtrl.onChange((val) => {
    controls.target.y = val;
    controls.update();
  });
  
  const targetZCtrl = cameraFolder.add(cameraParams, 'Target Z', -10, 10, 0.1);
  cameraControllers.targetZ = targetZCtrl;
  targetZCtrl.onChange((val) => {
    controls.target.z = val;
    controls.update();
  });
  
  const zoomCtrl = cameraFolder.add(cameraParams, 'Zoom', 0.1, 5, 0.1);
  cameraControllers.zoom = zoomCtrl;
  zoomCtrl.onChange((val) => {
    camera.zoom = val;
    camera.updateProjectionMatrix();
  });
  
  const fovCtrl = cameraFolder.add(cameraParams, 'FOV', 10, 120, 1);
  cameraControllers.fov = fovCtrl;
  fovCtrl.onChange((val) => {
    camera.fov = val;
    camera.updateProjectionMatrix();
  });
  
  // Save/Load functionality
  const saveLoadFolder = gui.addFolder('Save/Load');
  const saveLoadParams = {
    save: () => {
      const data = {
        ...cameraParams,
        ...fogParams,
        ...lightingParams,
        ...animationParams,
        ...debugParams
      };
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'debug-settings.json';
      a.click();
      URL.revokeObjectURL(url);
    },
    load: () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            try {
              const data = JSON.parse(event.target.result);
              // Update all params
              Object.assign(cameraParams, data);
              Object.assign(fogParams, data);
              Object.assign(lightingParams, data);
              Object.assign(animationParams, data);
              Object.assign(debugParams, data);
              // Update GUI displays - controllers will update automatically when params change
              // Apply values
              camera.position.set(cameraParams['Camera X'], cameraParams['Camera Y'], cameraParams['Camera Z']);
              controls.target.set(cameraParams['Target X'], cameraParams['Target Y'], cameraParams['Target Z']);
              camera.zoom = cameraParams['Zoom'];
              camera.fov = cameraParams['FOV'];
              camera.updateProjectionMatrix();
              controls.update();
              scene.fog.density = fogParams['Fog Density'];
              ambientLight.intensity = lightingParams['Ambient Intensity'];
              directionalLight.intensity = lightingParams['Directional Intensity'];
              secondsLerpFactor = animationParams['Seconds Lerp'];
              minutesLerpFactor = animationParams['Minutes Lerp'];
              hoursLerpFactor = animationParams['Hours Lerp'];
              axesHelper.visible = debugParams['Show Axes'];
              gridHelper.visible = debugParams['Show Grid'];
            } catch (err) {
              alert('Error loading file: ' + err.message);
            }
          };
          reader.readAsText(file);
        }
      };
      input.click();
    },
    copy: async () => {
      const data = {
        ...cameraParams,
        ...fogParams,
        ...lightingParams,
        ...animationParams,
        ...debugParams
      };
      const json = JSON.stringify(data, null, 2);
      try {
        await navigator.clipboard.writeText(json);
        alert('Copied to clipboard!');
      } catch (err) {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = json;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        alert('Copied to clipboard!');
      }
    }
  };
  saveLoadFolder.add(saveLoadParams, 'save');
  saveLoadFolder.add(saveLoadParams, 'load');
  saveLoadFolder.add(saveLoadParams, 'copy');
}

// Function to update all existing cube sizes based on new min/max range
function updateCubeSizes() {
  cubes.forEach(cube => {
    if (!cube.normalizedSize) {
      // For cubes created before normalizedSize was added, calculate it from current size
      cube.normalizedSize = (cube.size - 0.15) / (0.25 - 0.15); // Use old defaults
    }
    
    // Recalculate size from normalized value
    const newSize = cubeSizeMin + cube.normalizedSize * (cubeSizeMax - cubeSizeMin);
    const scaleFactor = newSize / cube.size;
    
    // Update visual mesh scale
    cube.mesh.scale.set(scaleFactor, scaleFactor, scaleFactor);
    
    // Update physics collider - need to remove and recreate
    if (cube.collider && physicsWorld) {
      const position = cube.rigidBody.translation();
      const rotation = cube.rigidBody.rotation();
      const linvel = cube.rigidBody.linvel();
      const angvel = cube.rigidBody.angvel();
      
      // Remove old collider
      physicsWorld.removeCollider(cube.collider, true);
      
      // Create new collider with updated size
      const colliderDesc = RAPIER.ColliderDesc.cuboid(newSize / 2, newSize / 2, newSize / 2)
        .setDensity(cube.mass)
        .setFriction(cube.mesh.material.userData.friction || 0.5)
        .setRestitution(cube.mesh.material.userData.restitution || 0.5);
      cube.collider = physicsWorld.createCollider(colliderDesc, cube.rigidBody);
      
      // Restore velocity
      cube.rigidBody.setLinvel(linvel, true);
      cube.rigidBody.setAngvel(angvel, true);
    }
    
    // Update stored size
    cube.size = newSize;
  });
}

// Store controller references for real-time updates (defined outside if block for animate function)
const cameraControllers = {
  positionX: null,
  positionY: null,
  positionZ: null,
  targetX: null,
  targetY: null,
  targetZ: null,
  zoom: null,
  fov: null
};


// FPS and cube count display at top right
let fps = 0;
let frameCount = 0;
let lastTime = performance.now();
let statsElement = null;

// Create stats display element (cube count and FPS)
statsElement = document.createElement('div');
statsElement.style.cssText = `
  position: fixed;
  top: 20px;
  right: 20px;
  color: white;
  font-family: monospace;
  font-size: 11px;
  background: rgba(0, 0, 0, 0.6);
  padding: 4px 8px;
  border-radius: 3px;
  z-index: 1000;
  pointer-events: none;
  line-height: 1.3;
`;
statsElement.innerHTML = 'Cubes: 0<br>FPS: 60';
document.body.appendChild(statsElement);


// Easing function: ease in and out (smooth acceleration and deceleration)
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Convert Euler angles to quaternion (for physics body rotation)
function eulerToQuaternion(x, y, z) {
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  
  return {
    x: s1 * c2 * c3 - c1 * s2 * s3,
    y: c1 * s2 * c3 + s1 * c2 * s3,
    z: c1 * c2 * s3 - s1 * s2 * c3,
    w: c1 * c2 * c3 + s1 * s2 * s3
  };
}

// Animation loop
function animate() {
  // Safety check: ensure cubes array is initialized before proceeding
  if (typeof cubes === 'undefined' || !Array.isArray(cubes)) {
    requestAnimationFrame(animate);
    return;
  }
  
  requestAnimationFrame(animate);
  
  // Update FPS counter
  frameCount++;
  const currentTime = performance.now();
  const deltaTime = currentTime - lastTime;
  
  if (deltaTime >= 1000) { // Update every second
    fps = Math.round((frameCount * 1000) / deltaTime);
    frameCount = 0;
    lastTime = currentTime;
  }
  
  // Update stats display (cube count and FPS)
  if (statsElement && Array.isArray(cubes)) {
    const currentCubeCount = cubes.length;
    statsElement.innerHTML = `Cubes: ${currentCubeCount}<br>FPS: ${fps}`;
  }
  
  
  // Update controls
  controls.update();
  
  // Update watch arms rotation first
  const now = new Date();
  const rawSeconds = now.getSeconds();
  const rawMilliseconds = now.getMilliseconds();
  const rawMinutes = now.getMinutes();
  const rawHours = now.getHours();
  
  // Check cube count and spawn special cubes BEFORE regular cube spawning
  // This ensures we check the count before it increases from regular spawning
  if (!Array.isArray(cubes)) return; // Safety check - ensure cubes array is initialized
  const currentCubeCount = cubes.length;
  
  // Spawn a new red repulsion cube when crossing the 300 threshold
  if (lastCubeCount < 300 && currentCubeCount >= 300) {
    spawnCube(false, true, false); // Drop red repulsion cube from above
  }
  
  // Pause 5-cube replacement spawning when reaching max (300), resume when dropping to min (150)
  if (currentCubeCount >= 300) {
    shouldSpawnReplacementCubes = false;
  } else if (currentCubeCount <= 150) {
    shouldSpawnReplacementCubes = true;
  }
  
  // Update last cube count for threshold detection
  lastCubeCount = currentCubeCount;
  
  // Drop a cube every second (always, regardless of count)
  if (rawSeconds !== lastSpawnedSecond) {
    lastSpawnedSecond = rawSeconds;
    spawnCube(false); // false = drop from above, not place on watch face
  }
  
  // Discrete seconds with smooth transitions - track accumulated rotation to prevent resets
  // Detect when seconds wrap from 59 to 0 and accumulate rotation
  if (lastSecondsValue !== -1 && rawSeconds < lastSecondsValue) {
    // Wrapped around - add one full rotation (2π)
    secondsAccumulatedRotation += Math.PI * 2;
  }
  lastSecondsValue = rawSeconds;
  
  // Discrete target: jump to each whole second, but smooth the transition
  const targetSeconds = rawSeconds; // Discrete target (whole seconds only)
  // Base rotation for current second (0-59) in current cycle
  const baseRotationForSecond = Math.PI - (targetSeconds / 60) * Math.PI * 2;
  // Add accumulated rotations to continue from where we left off
  const targetSecondsRotation = baseRotationForSecond + secondsAccumulatedRotation;
  
  // Use lerp to smoothly approach the discrete target
  let currentSecondsRotation = arms.children[0].rotation.y;
  
  // Normalize current rotation to the same cycle as target
  // Both should be in the range [accumulatedRotation - π, accumulatedRotation + π]
  // This ensures we're comparing rotations in the same cycle
  const cycleBase = secondsAccumulatedRotation;
  let normalizedCurrent = currentSecondsRotation;
  
  // Adjust current rotation to be in the same cycle as target
  // If current is much smaller than target, it might be from previous cycle
  if (targetSecondsRotation - normalizedCurrent > Math.PI) {
    // Current is likely from previous cycle, add 2π to bring it forward
    normalizedCurrent += Math.PI * 2;
  } else if (normalizedCurrent - targetSecondsRotation > Math.PI) {
    // Current is ahead, subtract 2π
    normalizedCurrent -= Math.PI * 2;
  }
  
  let rotationDiff = targetSecondsRotation - normalizedCurrent;
  // Normalize difference to shortest path in [-π, π] range
  if (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
  if (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;
  
  // Lerp with ease in/out - use secondsLerpFactor for smoothness
  // Lower lerp value = more discrete, higher = smoother
  const secondsLerp = secondsLerpFactor * 0.3; // Scale down for more discrete feel
  // Lerp from normalized current to target, result is in the correct cycle
  const smoothedSecondsRotation = normalizedCurrent + rotationDiff * secondsLerp;
  
  // Calculate smooth seconds for minutes/hours calculation
  // Convert smoothed rotation back to seconds value (accounting for accumulated rotations)
  const rotationFromStart = smoothedSecondsRotation - secondsAccumulatedRotation;
  const smoothSeconds = ((Math.PI - rotationFromStart) / (Math.PI * 2)) * 60;
  const normalizedSmoothSeconds = ((smoothSeconds % 60) + 60) % 60;
  
  const minutes = rawMinutes + normalizedSmoothSeconds / 60; // Smooth minutes
  const hours = (rawHours % 12) + minutes / 60; // Smooth hours
  
  // Calculate target rotations
  const targetMinutesRotation = Math.PI - (minutes / 60) * Math.PI * 2;
  const targetHoursRotation = Math.PI - (hours / 12) * Math.PI * 2;
  
  // Update visual arm rotations
  arms.children[0].rotation.y = smoothedSecondsRotation;
  arms.children[1].rotation.y = targetMinutesRotation;
  arms.children[2].rotation.y = targetHoursRotation;
  
  // Mobile: Dynamically zoom in/out to ensure seconds arm is 100% visible with maximum zoom
  if (isMobile) {
    const secondArmLength = 2.8;
    const armHalfLength = secondArmLength / 2; // Arm extends from -1.4 to +1.4 from center
    const padding = 0.3; // Minimal padding for maximum zoom
    
    // Arm Y position
    const armY = 0.08;
    
    // Calculate camera parameters
    const aspect = window.innerWidth / window.innerHeight;
    const fovRad = (camera.fov * Math.PI) / 180;
    const tanHalfFov = Math.tan(fovRad / 2);
    const isPortrait = aspect < 1;
    
    // Calculate current arm tip positions (both ends of the arm)
    // Arm extends from -armHalfLength to +armHalfLength along its axis
    const currentTip1X = -Math.sin(smoothedSecondsRotation) * armHalfLength;
    const currentTip1Z = -Math.cos(smoothedSecondsRotation) * armHalfLength;
    const currentTip2X = Math.sin(smoothedSecondsRotation) * armHalfLength;
    const currentTip2Z = Math.cos(smoothedSecondsRotation) * armHalfLength;
    
    // Follow the forward tip of the arm (tip2) instead of the center
    // This creates a moving target that follows the arm's rotation
    const armTarget = new THREE.Vector3(currentTip2X, armY, currentTip2Z);
    
    // Calculate bounding box of the arm at current rotation (only arm tips, no center reference)
    const minX = Math.min(currentTip1X, currentTip2X) - padding;
    const maxX = Math.max(currentTip1X, currentTip2X) + padding;
    const minZ = Math.min(currentTip1Z, currentTip2Z) - padding;
    const maxZ = Math.max(currentTip1Z, currentTip2Z) + padding;
    
    const boxWidth = maxX - minX;
    const boxHeight = maxZ - minZ;
    
    // Use a fixed camera angle and distance for consistent calculations
    const cameraAngle = isPortrait ? Math.PI / 4.8 : Math.PI / 5.0; // ~37-36 degrees
    const cameraDistance = 4.5; // Fixed distance
    
    // Calculate camera position relative to arm target (forward tip)
    const cameraHeight = armTarget.y + cameraDistance * Math.sin(cameraAngle);
    const cameraHorizontalDist = cameraDistance * Math.cos(cameraAngle);
    
    // Position camera to look at arm target with slight offset
    const cameraOffsetX = 0.1;
    const cameraOffsetZ = 0.9;
    
    targetCameraPosition.set(
      armTarget.x + cameraHorizontalDist * cameraOffsetX,
      cameraHeight,
      armTarget.z + cameraHorizontalDist * cameraOffsetZ
    );
    
    // Calculate distance from camera to the plane at arm Y position
    const heightDiff = cameraHeight - armTarget.y;
    const cameraToPlaneDistance = heightDiff / Math.sin(cameraAngle);
    
    // Calculate horizontal and vertical FOV
    const horizontalFov = 2 * Math.atan(tanHalfFov * aspect);
    const tanHalfHorizontalFov = Math.tan(horizontalFov / 2);
    
    // Calculate visible dimensions on the watch face plane (at zoom = 1.0)
    const visibleWidthOnPlane = 2 * cameraToPlaneDistance * tanHalfHorizontalFov;
    const visibleHeightOnPlane = 2 * cameraToPlaneDistance * tanHalfFov;
    
    // Calculate required zoom to fit the bounding box
    // zoom = visibleSize / requiredSize
    const zoomForWidth = visibleWidthOnPlane / boxWidth;
    const zoomForHeight = visibleHeightOnPlane / boxHeight;
    
    // Also check diagonal case - when arm is at 45 degrees
    // The diagonal of the bounding box
    const boxDiagonal = Math.sqrt(boxWidth * boxWidth + boxHeight * boxHeight);
    const visibleDiagonal = Math.sqrt(visibleWidthOnPlane * visibleWidthOnPlane + visibleHeightOnPlane * visibleHeightOnPlane);
    const zoomForDiagonal = visibleDiagonal / boxDiagonal;
    
    // Use the most restrictive zoom (smallest = most zoomed out = safest)
    // This ensures the entire bounding box fits in view
    let requiredZoom = Math.min(zoomForWidth, zoomForHeight, zoomForDiagonal);
    
    // Apply small safety margin (2%) to ensure 100% visibility
    requiredZoom = requiredZoom * 0.98;
    
    // Clamp zoom to reasonable range
    const maxZoom = isPortrait ? 3.5 : 4.0;
    const minZoom = 1.0;
    requiredZoom = Math.max(minZoom, Math.min(maxZoom, requiredZoom));
    
    targetCameraZoom = requiredZoom;
    
    // Smoothly lerp camera position and zoom with eased interpolation
    // Use slower, smoother interpolation for position
    const positionLerpSpeed = cameraLerpSpeed * 0.8; // Even slower for position
    camera.position.lerp(targetCameraPosition, positionLerpSpeed);
    
    // Use smooth interpolation for zoom (slightly faster than position but still smooth)
    const zoomLerpSpeed = cameraLerpSpeed * 1.2;
    camera.zoom = THREE.MathUtils.lerp(camera.zoom, targetCameraZoom, zoomLerpSpeed);
    camera.updateProjectionMatrix();
    
    // Move camera target to follow the forward tip of the seconds arm
    // This creates a moving target that rotates with the arm, not fixed at center
    controls.target.lerp(armTarget, positionLerpSpeed);
    controls.update();
  }
  
  // Update physics bodies for arms BEFORE physics step (so they can push cubes)
  // Arms rotate around origin, so bodies stay at origin and only rotation changes
  if (physicsWorld && armBodies.second && armBodies.minute && armBodies.hour) {
    // All arms stay at origin (0, y, 0) and rotate around Y-axis
    const secondQuatObj = eulerToQuaternion(0, smoothedSecondsRotation, 0);
    const secondQuat = new RAPIER.Quaternion(secondQuatObj.x, secondQuatObj.y, secondQuatObj.z, secondQuatObj.w);
            const secondPos = new RAPIER.Vector3(0, 0.08, 0); // Below minute and hour arms
    armBodies.second.setNextKinematicTranslation(secondPos);
    armBodies.second.setNextKinematicRotation(secondQuat);
    
    const minuteQuatObj = eulerToQuaternion(0, targetMinutesRotation, 0);
    const minuteQuat = new RAPIER.Quaternion(minuteQuatObj.x, minuteQuatObj.y, minuteQuatObj.z, minuteQuatObj.w);
            const minutePos = new RAPIER.Vector3(0, 0.35, 0);
    armBodies.minute.setNextKinematicTranslation(minutePos);
    armBodies.minute.setNextKinematicRotation(minuteQuat);
    
    const hourQuatObj = eulerToQuaternion(0, targetHoursRotation, 0);
    const hourQuat = new RAPIER.Quaternion(hourQuatObj.x, hourQuatObj.y, hourQuatObj.z, hourQuatObj.w);
            const hourPos = new RAPIER.Vector3(0, 0.30, 0);
    armBodies.hour.setNextKinematicTranslation(hourPos);
    armBodies.hour.setNextKinematicRotation(hourQuat);
  }
  
  // Step physics simulation
  if (physicsWorld) {
    // Apply repulsion forces from all red cubes before physics step
    // Find all red repulsion cubes
    const redCubes = cubes.filter(cube => cube.isRedRepulsionCube);
    
    // Apply repulsion from each red cube to all other cubes
    redCubes.forEach(redCube => {
      const redPos = redCube.rigidBody.translation();
      const redPosition = { x: redPos.x, y: redPos.y, z: redPos.z };
      
      cubes.forEach(cube => {
        // Skip the red cube itself
        if (cube === redCube) return;
        
        const cubePos = cube.rigidBody.translation();
        const dx = cubePos.x - redPosition.x;
        const dy = cubePos.y - redPosition.y;
        const dz = cubePos.z - redPosition.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        // Apply repulsion force if within range (e.g., 5 units)
        const repulsionRange = 5.0;
        if (distance > 0.01 && distance < repulsionRange) {
          // Normalize direction vector
          const invDistance = 1.0 / distance;
          const dirX = dx * invDistance;
          const dirY = dy * invDistance;
          const dirZ = dz * invDistance;
          
          // Calculate force strength (inverse square law, scaled by repulsionStrength)
          const forceStrength = repulsionStrength / (distance * distance);
          
          // Apply impulse (force * deltaTime is handled by Rapier, but we use impulse for immediate effect)
          const impulse = new RAPIER.Vector3(
            dirX * forceStrength * 0.016, // 0.016 approximates 60fps deltaTime
            dirY * forceStrength * 0.016,
            dirZ * forceStrength * 0.016
          );
          cube.rigidBody.applyImpulse(impulse, true);
        }
      });
    });
    
    
    // Update special cube colors (gradually convert to white over 15 seconds)
    const currentTime = Date.now();
    cubes.forEach(cube => {
      if (cube.spawnTime && cube.isRedRepulsionCube) {
        const age = currentTime - cube.spawnTime;
        const progress = Math.min(age / SPECIAL_CUBE_LIFETIME, 1.0); // 0 to 1 over 15 seconds
        
        if (progress < 1.0) {
          // Interpolate from red to white
          const startColor = { r: 255, g: 0, b: 0 }; // Red
          const endColor = { r: 255, g: 255, b: 255 }; // White
          
          const r = Math.round(startColor.r + (endColor.r - startColor.r) * progress);
          const g = Math.round(startColor.g + (endColor.g - startColor.g) * progress);
          const b = Math.round(startColor.b + (endColor.b - startColor.b) * progress);
          
          const newColor = (r << 16) | (g << 8) | b;
          cube.mesh.material.color.setHex(newColor);
        } else {
          // Fully converted to white - remove special cube flags
          cube.isRedRepulsionCube = false;
        }
      }
    });
    
    physicsWorld.step();
    
    // Sync Three.js meshes with physics bodies and cleanup
    const watchFaceRadius = 3.0; // Circular watch face radius
    for (let i = cubes.length - 1; i >= 0; i--) {
      const cube = cubes[i];
      const position = cube.rigidBody.translation();
      const rotation = cube.rigidBody.rotation();
      
      cube.mesh.position.set(position.x, position.y, position.z);
      cube.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      
      // Calculate distance from center (watch face is circular with radius 3)
      const distanceFromCenter = Math.sqrt(position.x * position.x + position.z * position.z);
      const visualWatchFaceRadius = 3.0; // Visual watch face radius
      
      // Remove cubes that are outside the circular watch face and hovering (stuck on square collider corners)
      // Only remove if they're clearly stuck, not if they're actively falling
      const velocity = cube.rigidBody.linvel();
      const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z);
      const isHovering = distanceFromCenter > visualWatchFaceRadius && 
                         position.y < 0.3 && 
                         position.y > -0.1 && 
                         speed < 0.1 && // Very slow or stationary
                         Math.abs(velocity.y) < 0.05; // Not falling or rising
      
      // Remove cubes that fall too far below (cleanup)
      // Also remove cubes hovering outside the circular boundary (but only if truly stuck)
      if (position.y < -30 || isHovering) {
        // Check if 10 seconds have passed since simulation start
        const elapsedSeconds = (Date.now() - simulationStartTime) / 1000;
        const shouldSpawnNewCubes = elapsedSeconds > 10;
        
        // Clear special cube references if this is one (no longer needed - using flags)
        
        scene.remove(cube.mesh);
        cube.mesh.geometry.dispose();
        cube.mesh.material.dispose();
        if (cube.collider) {
          physicsWorld.removeCollider(cube.collider, true);
        }
        physicsWorld.removeRigidBody(cube.rigidBody);
        cubes.splice(i, 1);
        
        // Check cube count after removal
        const countAfterRemoval = cubes.length;
        
        // Spawn 5 replacement cubes for each fallen cube
        // Pause when max (300) is reached, resume when min (150) is reached
        if (shouldSpawnNewCubes && shouldSpawnReplacementCubes) {
          for (let j = 0; j < 5; j++) {
            spawnCube(false); // Drop from above
          }
        }
      }
    }
  }
  
  // Update lil-gui camera controls to reflect current camera state
  // Only update if values differ to avoid triggering onChange callbacks
  if (cameraControllers.positionX && Math.abs(cameraParams['Camera X'] - camera.position.x) > 0.01) {
    cameraParams['Camera X'] = camera.position.x;
    cameraControllers.positionX.updateDisplay();
  }
  if (cameraControllers.positionY && Math.abs(cameraParams['Camera Y'] - camera.position.y) > 0.01) {
    cameraParams['Camera Y'] = camera.position.y;
    cameraControllers.positionY.updateDisplay();
  }
  if (cameraControllers.positionZ && Math.abs(cameraParams['Camera Z'] - camera.position.z) > 0.01) {
    cameraParams['Camera Z'] = camera.position.z;
    cameraControllers.positionZ.updateDisplay();
  }
  if (cameraControllers.targetX && Math.abs(cameraParams['Target X'] - controls.target.x) > 0.01) {
    cameraParams['Target X'] = controls.target.x;
    cameraControllers.targetX.updateDisplay();
  }
  if (cameraControllers.targetY && Math.abs(cameraParams['Target Y'] - controls.target.y) > 0.01) {
    cameraParams['Target Y'] = controls.target.y;
    cameraControllers.targetY.updateDisplay();
  }
  if (cameraControllers.targetZ && Math.abs(cameraParams['Target Z'] - controls.target.z) > 0.01) {
    cameraParams['Target Z'] = controls.target.z;
    cameraControllers.targetZ.updateDisplay();
  }
  if (cameraControllers.zoom && Math.abs(cameraParams['Zoom'] - camera.zoom) > 0.01) {
    cameraParams['Zoom'] = camera.zoom;
    cameraControllers.zoom.updateDisplay();
  }
  if (cameraControllers.fov && Math.abs(cameraParams['FOV'] - camera.fov) > 0.1) {
    cameraParams['FOV'] = camera.fov;
    cameraControllers.fov.updateDisplay();
  }
  
  // Update day and date on watch face (only when changed)
  if (watchFace.userData.dayMesh && watchFace.userData.dateMesh) {
    const currentDay = now.getDay();
    const currentDate = now.getDate();
    
    // Update day texture only if day changed
    if (currentDay !== lastDay) {
      const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
      const dayName = days[currentDay];
      const dayTexture = createTextTexture(dayName, 512);
      // Dispose old texture to prevent memory leak
      if (watchFace.userData.dayMaterial.map) {
        watchFace.userData.dayMaterial.map.dispose();
      }
      watchFace.userData.dayMaterial.map = dayTexture;
      watchFace.userData.dayMaterial.needsUpdate = true;
      lastDay = currentDay;
    }
    
    // Update date texture only if date changed
    if (currentDate !== lastDate) {
      const dateTexture = createTextTexture(currentDate.toString(), 512);
      // Dispose old texture to prevent memory leak
      if (watchFace.userData.dateMaterial.map) {
        watchFace.userData.dateMaterial.map.dispose();
      }
      watchFace.userData.dateMaterial.map = dateTexture;
      watchFace.userData.dateMaterial.needsUpdate = true;
      lastDate = currentDate;
    }
  }
  
  // Update cube counter on watch face (update every frame)
  if (watchFace.userData.cubeCounterMesh && watchFace.userData.cubeCounterMaterial) {
    const currentCubeCount = cubes.length;
    const cubeCounterTexture = createTextTexture(currentCubeCount.toString(), 512);
    // Dispose old texture to prevent memory leak
    if (watchFace.userData.cubeCounterMaterial.map) {
      watchFace.userData.cubeCounterMaterial.map.dispose();
    }
    watchFace.userData.cubeCounterMaterial.map = cubeCounterTexture;
    watchFace.userData.cubeCounterMaterial.needsUpdate = true;
  }
  
  renderer.render(scene, camera);
}

// Ensure cubes array is initialized before starting animation
if (typeof cubes !== 'undefined' && Array.isArray(cubes)) {
  animate();
} else {
  // Fallback: wait for next tick if cubes isn't ready
  requestAnimationFrame(() => {
    if (typeof cubes !== 'undefined' && Array.isArray(cubes)) {
      animate();
    }
  });
}

// Handle window resize
window.addEventListener('resize', () => {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  
  // Re-check mobile status on resize and adjust camera if needed
  const wasMobile = isMobile;
  const nowMobile = isMobileDevice();
  
  if (nowMobile) {
    // On mobile, adjust camera based on current orientation
    // Target will be set dynamically in animate loop based on arm position
    const isPortrait = aspect < 1;
    if (isPortrait) {
      camera.position.set(0, 3.0, 4.2);
      camera.zoom = 1.5;
    } else {
      camera.position.set(0, 2.8, 4.0);
      camera.zoom = 1.8;
    }
    // Don't set target here - let animate loop handle it based on arm position
    camera.updateProjectionMatrix();
    controls.update();
  } else if (!nowMobile && wasMobile) {
    // Switched to desktop: restore original
    camera.position.set(-0.3, 3.3, 2.7);
    camera.zoom = 1.7;
    controls.target.set(-0.2, 0.5, 1.3);
    camera.updateProjectionMatrix();
    controls.update();
  }
});

